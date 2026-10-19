import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostUrl, normalizeThread, readPostThread, THREAD_ENDPOINT, THREAD_LIMIT } from '../src/post-reader.js';

const author = { id: '100', name: '投稿者', screen_name: 'writer' };
const row = (id, text, extra = {}) => ({ id, type: 'status', text, author, ...extra });
const parsed = parsePostUrl('https://x.com/writer/status/22?s=20');
const payload = { code: 200, status: row('22', '途中の気づき。'), thread: [row('21', '最初の投稿。'), row('22', '途中の気づき。', { replying_to: { status: '21' } }), row('23', '最後の結論。', { replying_to: { status: '22' } })] };

test('X/TwitterのポストURLだけを許可し、クエリ・写真リンクを正規化する', () => {
  for (const value of ['https://x.com/writer/status/22?s=20', 'https://twitter.com/writer/status/22/photo/1', 'mobile.twitter.com/writer/status/22', 'https://x.com/i/web/status/22', 'https://x.com/i/status/22']) assert.equal(parsePostUrl(value).id, '22');
  for (const value of ['https://x.com.example.org/writer/status/22', 'https://example.com/22', 'http://127.0.0.1/status/22', 'https://x.com/writer', 'https://x.com/search?q=hello', 'javascript:alert(1)', 'https://user:pass@x.com/writer/status/22', 'https://x.com:444/writer/status/22']) assert.throws(() => parsePostUrl(value));
});

test('途中のURLから、重複を除いて最初・途中・最後を時系列順に取り込む', () => {
  const result = normalizeThread({ ...payload, thread: [payload.thread[2], payload.thread[1], payload.thread[0], payload.thread[1]] }, parsed);
  assert.deepEqual(result.posts.map(post => post.id), ['21', '22', '23']);
  assert.equal(result.body, '最初の投稿。\n\n途中の気づき。\n\n最後の結論。');
  assert.equal(result.author.handle, 'writer');
  assert.equal(result.warnings.length, 0);
});

test('別のユーザーの返信を混ぜず、削除済みや画像・欠けた親投稿を明示する', () => {
  const result = normalizeThread({ ...payload, thread: [row('21', '最初の投稿。'), { id: '24', type: 'tombstone' }, row('25', '別の人の返信', { author: { id: '999', name: '他人', screen_name: 'other' } }), row('26', '画像付き投稿', { media: { photos: [{}] } })] }, parsed);
  assert.ok(!result.body.includes('別の人'));
  assert.equal(result.otherAuthors, 1);
  assert.equal(result.unavailable, 1);
  assert.equal(result.partial, true);
  assert.ok(result.warnings.some(message => message.includes('画像')));
  assert.ok(result.warnings.some(message => message.includes('削除')));
  assert.ok(normalizeThread({ code: 200, status: row('22', '本文', { replying_to: { status: '21' } }) }, parsed).warnings.some(message => message.includes('前の投稿')));
});

test('長文と記事の提供済み本文を保持し、上限超過を完全取得と扱わない', () => {
  const long = '長文の本文。'.repeat(1000);
  const article = normalizeThread({ code: 200, status: row('22', long, { article: { title: '記事', content: '記事の最後の結論。' } }) }, parsed);
  assert.ok(article.body.includes(long));
  assert.ok(article.body.includes('記事の最後の結論。'));
  const many = Array.from({ length: THREAD_LIMIT + 3 }, (_, i) => row(String(22 + i), '本文'));
  const limited = normalizeThread({ code: 200, status: many[0], thread: many }, parsed);
  assert.equal(limited.posts.length, THREAD_LIMIT);
  assert.equal(limited.partial, true);
  assert.ok(limited.warnings.some(message => message.includes('上限')));
});

test('リンク先の不一致・空本文・非公開・存在しない投稿を拒否する', () => {
  for (const data of [null, { code: 200, status: row('99', '別のポスト') }, { code: 401 }, { code: 404 }, { code: 200, status: row('22', '') }]) assert.throws(() => normalizeThread(data, parsed));
});

test('固定の提供元にだけ通信し、認証情報を送らず、取得エラーを表示する', async () => {
  let called;
  const result = await readPostThread(parsed.url, { fetcher: async (url, options) => { called = { url, options }; return new Response(JSON.stringify(payload), { status: 200 }); } });
  assert.equal(called.url, THREAD_ENDPOINT + '22');
  assert.equal(called.options.credentials, 'omit');
  assert.equal(result.posts.length, 3);
  await assert.rejects(() => readPostThread(parsed.url, { fetcher: async () => new Response('', { status: 429 }) }), /混み合って/);
  await assert.rejects(() => readPostThread(parsed.url, { fetcher: async () => { throw new TypeError('Network failed'); } }), /接続できません/);
  await assert.rejects(() => readPostThread(parsed.url, { fetcher: async () => new Response('<html>error</html>') }), /応答を読み取れません/);
});

test('読み取り中のキャンセルを通常の取得失敗と区別する', async () => {
  const controller = new AbortController();
  const promise = readPostThread(parsed.url, { signal: controller.signal, fetcher: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) });
  controller.abort();
  await assert.rejects(() => promise, { name: 'AbortError' });
});
