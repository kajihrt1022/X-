import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { hasEmoji } from '../src/generator.js';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let url = process.env.TEST_SITE_URL;
  if (!url) {
    url = 'http://127.0.0.1:4174/replycraft.html';
    const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
    await context.route(url, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  }
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  assert.equal(response.status(), 200);
  assert.match(await page.title(), /Reply Craft/);
  if (process.env.TEST_POST_URL) await page.getByLabel('ポストのリンク', { exact: true }).fill(process.env.TEST_POST_URL);
  else await page.getByRole('button', { name: 'サンプルを入れる' }).click();
  await page.getByRole('button', { name: '返信を生成', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.chatgpt-handoff') || document.querySelector('[role="alert"]')?.textContent, null, { timeout: 35000 });
  const alert = page.getByRole('alert');
  if (await alert.count()) throw new Error(await alert.innerText());
  assert.equal(await page.locator('.reply-card').count(), 0, 'Public edition must not present pattern drafts as AI understanding');
  assert.equal(await page.locator('.chatgpt-handoff').count(), 1);
  const prompt = await page.getByLabel('ChatGPTへの依頼文').inputValue();
  const fullText = process.env.TEST_POST_URL ? await page.getByLabel('取得した投稿の本文').inputValue() : await page.getByLabel('相手の投稿', { exact: true }).inputValue();
  assert.ok(prompt.includes(JSON.stringify(fullText)), 'ChatGPT handoff must contain the entire imported or edited text');
  assert.ok(prompt.includes('主張・結論・注意点'));
  await page.getByRole('button', { name: '1. 依頼文をコピー', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  assert.equal(await page.getByRole('link', { name: '2. ChatGPTを開く' }).getAttribute('href'), 'https://chatgpt.com/');
  await page.locator('.pattern-option summary').click();
  await page.getByRole('button', { name: '定型文で下書きを作る', exact: true }).click();
  assert.equal(await page.locator('.reply-card').count(), 3);
  assert.equal(await page.getByText('返信のトーンを選択', { exact: true }).count(), 0);
  for (const draft of await page.locator('.reply-editor').evaluateAll(elements => elements.map(element => element.value))) assert.ok(hasEmoji(draft), 'Every draft must include an emoji');
  let details = 'manual input';
  if (process.env.TEST_POST_URL) {
    assert.ok(await page.locator('.thread-posts > li').count() > 0);
    details = await page.locator('.thread-summary').innerText();
    assert.ok(await page.locator('.thread-post-content p').last().innerText());
  }
  const text = await page.getByLabel('案1の本文').inputValue();
  assert.ok(text.trim());
  await page.locator('.reply-card').first().getByRole('button', { name: 'コピー', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
  await page.getByRole('button', { name: '案1を保存', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '保存したリプライ' }).click();
  assert.equal(await page.locator('.saved-text').innerText(), text);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  const summary = `Browser passed: ${process.env.TEST_SITE_URL ? 'live published HTTPS site' : 'built HTML'}; ${details}; full-text ChatGPT handoff/copy=ok; optional pattern drafts=3; clipboard/save/reload/mobile=ok`;
  console.log(summary);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Reply Craft browser check::${summary}`);
} catch (error) {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Reply Craft browser check::${error.message.replaceAll('\n', ' ')}`);
  throw error;
} finally { await browser.close(); }
