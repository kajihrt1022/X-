import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countText, ensureEmoji, fitText, generateLocal, hasEmoji, LIMITS, validateInput } from '../src/generator.js';

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

test('古い絵文字オフ設定でも全案に絵文字を入れ、文字数と質問を守る', () => {
  for (const length of Object.keys(LIMITS)) {
    for (const emoji of [true, false]) {
      for (const variation of [0, 1, 2]) {
        const result = generateLocal({ post, length, emoji, variation, directions: ['insight', 'action', 'question'], thought: '自分が気づいたことを毎日一つずつ記録して、発信につなげていきたいと思います。'.repeat(3) });
        for (const reply of result.replies) {
          assert.ok(countText(reply.text) <= LIMITS[length], `${length}: ${reply.text}`);
          assert.equal(hasEmoji(reply.text), true);
        }
        assert.match(result.replies[2].text, /[？?](?: 😊)?$/);
        assert.equal(result.replies.filter(reply => /[？?]/.test(reply.text)).length, 1);
      }
    }
  }
});

test('古いトーン指定に影響されず、方向性・気づき・再生成を反映する', () => {
  const input = { post, length: 'long', thought: 'まずは今日の気づきを一つ書いてみたいです。', directions: ['insight', 'action'] };
  const natural = generateLocal(input);
  const warm = generateLocal({ ...input, tone: 'warm' });
  assert.deepEqual(natural.replies, warm.replies);
  for (const reply of natural.replies) assert.ok(reply.text.includes(input.thought));
  assert.notDeepEqual(natural.replies, generateLocal({ ...input, variation: 1 }).replies);
  assert.ok(generateLocal({ ...input, author: 'ヒロさん' }).replies[0].text.startsWith('ヒロさん、'));
  const action = generateLocal({ post, directions: ['action'] });
  assert.ok(action.replies.every(reply => reply.kind === 'action'));
});

test('空白、URLのみ、過大な本文、不正な入力を拒否する', () => {
  for (const value of [null, [], { post: '   ' }, { post: 'https://x.com/user/status/1' }, { post: 'あ'.repeat(60001) }, { post, thought: 'あ'.repeat(301) }]) assert.throws(() => validateInput(value));
  assert.equal(validateInput({ post, tone: 'invalid', length: 'invalid' }).length, 'medium');
});

test('長いスレッドでも、冒頭だけでなく最後の結論を返信案に含める', () => {
  const body = ['冒頭は相手への関心が大切。', ...Array.from({ length: 12 }, (_, index) => `途中の話題${index + 1}を紹介します。`), '最後は小さな約束を守ることが信頼になる。'].join('\n');
  const result = generateLocal({ post: body, length: 'long' });
  assert.match(result.replies[0].text, /相手への関心/);
  assert.match(result.replies[2].text, /小さな約束/);
  assert.doesNotThrow(() => validateInput({ post: '長い連続投稿の本文。'.repeat(1000) }));
});

test('Xの重み付き文字数を使い、URL・絵文字・日本語の途中で壊さない', () => {
  assert.equal(countText('日本語abc'), 9);
  assert.equal(countText('https://example.com/very-long-link-path'), 23);
  assert.equal(countText('😊'), 2);
  const fitted = fitText('😊こんにちは世界', 8);
  assert.ok(countText(fitted) <= 8);
  assert.ok(!fitted.includes('\uFFFD'));
});


test('AI出力・編集後の本文にも、文字数上限内で絵文字を補える', () => {
  for (const limit of Object.values(LIMITS)) {
    const text = ensureEmoji('あ'.repeat(limit / 2), limit);
    assert.ok(hasEmoji(text));
    assert.ok(countText(text) <= limit);
  }
  assert.equal(ensureEmoji('やってみます！🙏'), 'やってみます！🙏');
  assert.equal(ensureEmoji('参考になります✨'), '参考になります✨');
  assert.equal(ensureEmoji(''), '');
  assert.equal(hasEmoji('123 © 2026'), false);
  assert.ok(hasEmoji(ensureEmoji('123 © 2026')));
});
