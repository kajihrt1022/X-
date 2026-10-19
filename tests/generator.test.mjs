import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countText, fitText, generateLocal, LIMITS, validateInput } from '../src/generator.js';

const post = '発信は完璧を目指さなくていい。小さな気づきを毎日記録する。等身大の言葉を大切にしよう。';

test('投稿の具体的な言葉を拾った異なる3案を作成する', () => {
  const result = generateLocal({ post });
  assert.equal(result.mode, 'local');
  assert.equal(result.replies.length, 3);
  assert.equal(new Set(result.replies.map(reply => reply.text)).size, 3);
  for (const reply of result.replies) {
    assert.match(reply.text, /完璧|気づき|等身大/);
    assert.doesNotMatch(reply.text, /成果が出|実践しました|やってみました|フォロー/);
    assert.doesNotMatch(reply.text, /[?？]/);
  }
});

test('各文字数と絵文字の組み合わせで上限を守り、選択した質問を最後まで残す', () => {
  for (const length of Object.keys(LIMITS)) {
    for (const emoji of [true, false]) {
      for (const variation of [0, 1, 2]) {
        const result = generateLocal({ post, length, emoji, variation, directions: ['insight', 'action', 'question'], thought: '自分が気づいたことを毎日一つずつ記録して、発信につなげていきたいと思います。'.repeat(3) });
        for (const reply of result.replies) {
          assert.ok(countText(reply.text) <= LIMITS[length], `${length}: ${reply.text}`);
          assert.equal(reply.text.includes('😊'), emoji);
        }
        assert.match(result.replies[2].text, /[？?](?: 😊)?$/);
        assert.equal(result.replies.filter(reply => /[？?]/.test(reply.text)).length, 1);
      }
    }
  }
});

test('文体・方向性・追加した気づきを反映し、再生成で表現を変える', () => {
  const input = { post, length: 'long', thought: 'まずは今日の気づきを一つ書いてみたいです。', directions: ['insight', 'action'] };
  const natural = generateLocal(input);
  const warm = generateLocal({ ...input, tone: 'warm' });
  assert.notEqual(natural.replies[0].text, warm.replies[0].text);
  for (const reply of natural.replies) assert.ok(reply.text.includes(input.thought));
  assert.notDeepEqual(natural.replies, generateLocal({ ...input, variation: 1 }).replies);
  assert.ok(generateLocal({ ...input, author: 'ヒロさん' }).replies[0].text.startsWith('ヒロさん、'));
  const action = generateLocal({ post, directions: ['action'] });
  assert.ok(action.replies.every(reply => reply.kind === 'action'));
});

test('空白、URLのみ、過大な本文、不正な入力を拒否する', () => {
  for (const value of [null, [], { post: '   ' }, { post: 'https://x.com/user/status/1' }, { post: 'あ'.repeat(5001) }, { post, thought: 'あ'.repeat(301) }]) assert.throws(() => validateInput(value));
  assert.equal(validateInput({ post, tone: 'invalid', length: 'invalid' }).tone, 'natural');
});

test('Xの重み付き文字数を使い、URL・絵文字・日本語の途中で壊さない', () => {
  assert.equal(countText('日本語abc'), 9);
  assert.equal(countText('https://example.com/very-long-link-path'), 23);
  assert.equal(countText('😊'), 2);
  const fitted = fitText('😊こんにちは世界', 8);
  assert.ok(countText(fitted) <= 8);
  assert.ok(!fitted.includes('\uFFFD'));
});
