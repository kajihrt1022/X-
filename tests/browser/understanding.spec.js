import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('公開版は定型文にすり替えず、補足した全文と理解の依頼文をChatGPTに渡せる', async ({ page, context }) => {
  const html = await readFile(new URL('../../exports/kotoba.html', import.meta.url), 'utf8');
  await context.route('http://127.0.0.1:4174/replycraft.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://127.0.0.1:4174/replycraft.html');
  await page.getByRole('button', { name: '本文を貼り付ける', exact: true }).click();
  const post = '以前は送信数を増やせばよいと考えていました。\nしかし結論は、相手に必要な場合だけ提案することです。';
  await page.getByLabel('相手の投稿', { exact: true }).fill(post);
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.chatgpt-handoff')).toBeVisible();
  await expect(page.locator('.reply-card')).toHaveCount(0);
  await page.getByText('依頼文を表示する', { exact: true }).click();
  const prompt = await page.getByLabel('ChatGPTへの依頼文').inputValue();
  expect(prompt).toContain(JSON.stringify(post));
  expect(prompt).toContain('否定された考え');
  expect(prompt).toContain('主張・結論・注意点');
  expect(prompt).toContain('絵文字は各案に必ず1つ以上');
  await page.getByRole('button', { name: '1. 依頼文をコピー', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  await expect(page.getByRole('link', { name: '2. ChatGPTを開く' })).toHaveAttribute('href', 'https://chatgpt.com/');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('AIサーバー版は内容理解と、各返信が踏まえた本文の根拠を表示する', async ({ page }) => {
  const analysis = { summary: '提案の前に相手の状況を理解する大切さを伝えている。', mainPoint: '送信数を増やすことより、相手の状況を聞く。', conclusion: '必要な場合だけ提案する。', cautions: ['送信数を増やすのは過去の考え。'] };
  const basis = '相手に必要な場合だけ提案する';
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', mode: 'ai' } }));
  await page.route('**/api/generate', route => {
    expect(route.request().postDataJSON().post).toContain(basis);
    return route.fulfill({ json: { mode: 'ai', analysis, replies: [0, 1, 2].map(i => ({ title: `着目点${i + 1}`, kind: 'insight', text: '相手の状況を確認してから提案する順番が大切ですね😊', note: '提案には必要性の確認が先にある。', basis })) } });
  });
  await page.goto('/');
  await expect(page.locator('.generation-mode')).toContainText('AIが主張');
  await page.getByRole('button', { name: '本文を貼り付ける', exact: true }).click();
  await page.getByLabel('相手の投稿', { exact: true }).fill('以前は数を増やしていました。しかし、相手に必要な場合だけ提案することが大切です。');
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
  await expect(page.locator('.understanding-panel')).toContainText(analysis.conclusion);
  await expect(page.locator('.understanding-panel')).toContainText(analysis.cautions[0]);
  await page.locator('.reply-basis').first().locator('summary').click();
  await expect(page.locator('.reply-basis').first()).toContainText(basis);
  await page.getByRole('button', { name: '履歴', exact: true }).click();
  await page.getByRole('button', { name: 'この返信を開く' }).click();
  await expect(page.locator('.understanding-panel')).toContainText(analysis.conclusion);
});

test('AI接続が失敗した場合に、定型文を理解済みの返信として出さない', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', mode: 'ai' } }));
  await page.route('**/api/generate', route => route.fulfill({ status: 502, json: { error: 'AIに接続できませんでした。' } }));
  await page.goto('/');
  await expect(page.locator('.generation-mode')).toContainText('AIが主張');
  await page.getByRole('button', { name: 'サンプルを入れる' }).click();
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('AIに接続できません');
  await expect(page.locator('.reply-card')).toHaveCount(0);
});
