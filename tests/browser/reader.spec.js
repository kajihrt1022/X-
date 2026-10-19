import { test, expect } from '@playwright/test';

const author = { id: '1000', name: 'スレッドの投稿者', screen_name: 'writer' };
const root = { id: '2112099432640454601', type: 'status', author, text: '最初は相手の悩みを知ることから。' };
const focal = { id: '2112099432640454665', type: 'status', author, text: '途中で気づいたのは、一度に多くを伝えすぎないこと。', replying_to: { status: root.id } };
const last = { id: '2112099432640454699', type: 'status', author, text: '最後は、小さな約束を守ることが信頼につながる。', replying_to: { status: focal.id } };
const url = `https://x.com/writer/status/${focal.id}?s=20`;
const payload = { code: 200, status: focal, author, thread: [root, focal, last] };

test('リンクだけで最初から最後まで読み取り、表示・生成・保存・履歴を使える', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.fxtwitter.com/2/thread/*', route => { calls++; return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(payload) }); });
  await page.goto('/');
  await page.getByLabel('ポストのリンク', { exact: true }).fill(url);
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
  await expect(page.locator('.thread-posts > li')).toHaveCount(3);
  await expect(page.locator('.thread-posts > li').first()).toContainText(root.text);
  await expect(page.locator('.thread-posts > li').last()).toContainText(last.text);
  await expect(page.getByLabel('案3の本文')).toHaveValue(/小さな約束/);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '案1を保存', exact: true }).click();
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await expect(page.locator('.history-card')).toHaveCount(1);
  await expect(page.locator('.history-card')).toContainText('3件の投稿');
  await page.getByRole('button', { name: 'この返信を開く' }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
  await expect(page.getByLabel('相手の投稿', { exact: true })).toHaveValue([root.text, focal.text, last.text].join('\n\n'));
  await page.getByRole('button', { name: '保存したリプライ', exact: true }).click();
  await page.locator('.source-details summary').click();
  await expect(page.getByRole('link', { name: 'Xで開く' })).toHaveAttribute('href', `https://x.com/i/status/${focal.id}`);
});

test('削除済み・別ユーザー・画像の未解析を明示して、取得済みの全文を補足できる', async ({ page }) => {
  const data = { ...payload, thread: [root, { id: '2112099432640454602', type: 'tombstone' }, focal, { ...last, media: { photos: [{}] } }, { ...last, id: '2112099432640454700', author: { id: '2000', name: '他人', screen_name: 'other' }, text: '他のユーザーの返信' }] };
  await page.route('https://api.fxtwitter.com/2/thread/*', route => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) }));
  await page.goto('/');
  await page.getByLabel('ポストのリンク', { exact: true }).fill(url);
  await page.getByRole('button', { name: '読み込む', exact: true }).click();
  await expect(page.locator('.thread-count')).toContainText('一部未取得');
  await expect(page.locator('.coverage-warning')).toContainText('削除');
  await expect(page.locator('.coverage-warning')).toContainText('画像');
  await expect(page.locator('.thread-posts')).not.toContainText('他のユーザーの返信');
  await page.locator('.edit-imported summary').click();
  await page.getByLabel('取得した投稿の本文').fill('補足した本文です。最後は相手へのリスペクトが大切です。');
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByLabel('案3の本文')).toHaveValue(/リスペクト/);
});

test('取得失敗と不正URLでは返信を作らず、本文入力へ切り替えて利用できる', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.fxtwitter.com/2/thread/*', route => { calls++; return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' }); });
  await page.goto('/');
  await page.getByLabel('ポストのリンク', { exact: true }).fill('https://example.com/private');
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('x.com');
  expect(calls).toBe(0);
  await page.getByLabel('ポストのリンク', { exact: true }).fill(url);
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('取得サービス');
  await expect(page.locator('.reply-card')).toHaveCount(0);
  await page.getByRole('button', { name: '本文を貼り付ける' }).click();
  await page.getByLabel('相手の投稿', { exact: true }).fill('小さな行動を毎日続けることが大切です。');
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
});

test('読み込みを中止した後、古い取得結果を表示しない', async ({ page }) => {
  let release;
  await page.route('https://api.fxtwitter.com/2/thread/*', async route => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(payload) }).catch(() => {});
  });
  await page.goto('/');
  await page.getByLabel('ポストのリンク', { exact: true }).fill(url);
  await page.getByRole('button', { name: '読み込む', exact: true }).click();
  await expect(page.getByRole('button', { name: '読み込みを中止する' })).toBeVisible();
  await page.getByRole('button', { name: '読み込みを中止する' }).click();
  await page.getByRole('button', { name: '本文を貼り付ける' }).click();
  release?.();
  await expect(page.getByLabel('相手の投稿', { exact: true })).toHaveValue('');
  await expect(page.locator('.thread-preview')).toHaveCount(0);
});
