import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('HTML単体で外部通信なしに生成・編集・コピー・保存・再読込できる', async ({ page, context }) => {
  const html = await readFile(new URL('../../exports/kotoba.html', import.meta.url), 'utf8');
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url() !== 'http://127.0.0.1:4174/kotoba.html') external.push(request.url()); });
  // Cloud Chromium blocks file URLs by policy. Serve only this single document
  // through a test route, with actual networking disabled.
  await context.route('http://127.0.0.1:4174/kotoba.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await context.setOffline(true);
  await page.goto('http://127.0.0.1:4174/kotoba.html');
  await page.getByRole('button', { name: 'サンプルを入れる' }).click();
  await page.getByText('あなたらしさを、もう少し', { exact: true }).click();
  await page.getByRole('button', { name: '質問を添える' }).click();
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await expect(page.locator('.reply-card')).toHaveCount(3);
  await expect(page.getByLabel('案3の本文')).toHaveValue(/？/);
  const text = '小さな発見を記録する視点が勉強になります。今日から意識してみます。';
  await page.getByLabel('案1の本文').fill(text);
  await page.getByRole('button', { name: '案1を保存', exact: true }).click();
  await page.locator('.reply-card').first().getByRole('button', { name: 'コピー', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('コピーしました');
  await page.reload();
  await page.getByRole('button', { name: '保存したリプライ' }).click();
  await expect(page.locator('.saved-text')).toHaveText(text + ' 😊');
  await page.getByRole('textbox', { name: '保存したリプライを検索' }).fill('小さな');
  await expect(page.locator('.saved-text')).toHaveCount(1);
  await page.getByRole('button', { name: '保存を削除' }).click();
  await expect(page.locator('.saved-text')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
