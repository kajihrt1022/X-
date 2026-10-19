import { test, expect } from '@playwright/test';

test('生成・連続編集・コピー・保存・再読込・検索・削除が使える', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '本文を貼り付ける' }).click();
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('投稿の本文を入力');
  await page.getByRole('button', { name: 'サンプルを入れる' }).click();
  await page.getByText('あなたらしさを、もう少し', { exact: true }).click();
  await page.getByRole('button', { name: '質問を添える' }).click();
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
  await expect(page.getByLabel('案3の本文')).toHaveValue(/？/);
  const editor = page.getByLabel('案1の本文');
  await editor.fill('小さな気づきを積み重ねる、という視点が勉強になります。');
  await editor.press('End');
  await editor.pressSequentially('今日から意識してみます。');
  await expect(editor).toBeFocused();
  const edited = await editor.inputValue();
  await page.locator('.reply-card').first().getByRole('button', { name: 'コピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);
  await page.getByRole('button', { name: '案1を保存', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '保存したリプライ' }).click();
  await expect(page.locator('.saved-text')).toHaveText(edited);
  await page.getByRole('textbox', { name: '保存したリプライを検索' }).fill('見つからない言葉');
  await expect(page.getByText('この言葉を含むリプライはありません。')).toBeVisible();
  await page.getByRole('textbox', { name: '保存したリプライを検索' }).fill('気づき');
  await expect(page.locator('.saved-text')).toHaveText(edited);
  await page.getByRole('button', { name: '保存を削除' }).click();
  await expect(page.locator('.archive-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('URLだけの入力とサーバーエラーを表示し、再試行できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '本文を貼り付ける' }).click();
  await page.getByLabel('相手の投稿', { exact: true }).fill('https://x.com/user/status/123');
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('投稿の本文を貼り付け');
  await page.getByRole('button', { name: 'サンプルを入れる' }).click();
  await page.route('**/api/generate', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '接続テストエラー' }) }));
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('接続テストエラー');
  await page.unroute('**/api/generate');
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
});

test('文体の設定が保存され、ダイアログをキーボードで閉じられる', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: /いつもの文体を設定/ }).click();
  await page.getByLabel('いつもの雰囲気').selectOption('warm');
  await page.getByRole('dialog').getByLabel('文章の長さ').selectOption('short');
  await page.getByRole('button', { name: 'この文体を保存する' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'フレンドリー', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('文章の長さ', { exact: true })).toHaveValue('short');
  await page.getByRole('button', { name: '使い方ガイド' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('スマートフォンでも横にはみ出さず、生成と保存画面への移動ができる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'サンプルを入れる' }).click();
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
  await page.getByRole('button', { name: '案1を保存', exact: true }).click();
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  await page.getByRole('button', { name: '保存したリプライ' }).click();
  await expect(page.locator('.saved-text')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('APIが空入力・不正JSON・別サイトからの送信を拒否する', async ({ request }) => {
  expect((await request.post('/api/generate', { data: { post: '' } })).status()).toBe(400);
  expect((await request.post('/api/generate', { data: '{', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  expect((await request.post('/api/generate', { data: { post: '投稿本文' }, headers: { Origin: 'https://unrelated.example' } })).status()).toBe(403);
  const response = await request.post('/api/generate', { data: { post: '相手の話をよく聞くことが信頼につながる。' } });
  expect(response.ok()).toBe(true);
  expect((await response.json()).replies).toHaveLength(3);
});
