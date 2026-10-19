import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAI } from '../server/ai.mjs';
import { hasEmoji, countText, validateInput } from '../src/generator.js';
import { buildChatGPTPrompt } from '../src/reply-instructions.js';

// This fixture reverses its opening example at the end. The test verifies the
// grounding contract and complete context, not an AI model's semantic accuracy.
const post = '以前は毎日100件送れば成果が出ると考えていました。\nでも、数だけ増やしても信頼にはつながりませんでした。\n大切なのは相手の状況を聞き、必要な場合だけ提案することです。';
const input = validateInput({ post, length: 'long' });
const analysis = {
  summary: '営業活動で、送信数より相手の状況を理解する大切さを伝えている。',
  mainPoint: '数を増やすことを優先せず、相手の状況を聞く。',
  conclusion: '必要な場合だけ提案する。', cautions: ['毎日100件送ることは推奨ではなく過去の考え。'],
  evidence: [{ quote: '相手の状況を聞き、必要な場合だけ提案する', meaning: '提案には相手の状況と必要性の確認が先にある。' }],
};
const replies = [
  { title: '気づき', kind: 'insight', text: '提案の前に相手の状況を聞く、という順番が大切なのですね。', note: '結論の提案の順番に着目。', evidenceIndex: 0 },
  { title: '実践', kind: 'action', text: 'まず状況を聞いて、必要な場合だけ提案することを意識してみます。', note: '必要性という条件を保持。', evidenceIndex: 0 },
  { title: '納得', kind: 'insight', text: '数を増やす前に、相手に必要な提案かを考える視点が参考になります。', note: '失敗例ではなく最終的な主張に反応。', evidenceIndex: 0 },
];
const response = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { headers: { 'Content-Type': 'application/json' } });

test('全文の理解と根拠確認を先に行い、同じ全文と分析を返信生成に渡す', async () => {
  const calls = [];
  const result = await generateAI(input, { apiKey: 'test-only', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    calls.push(JSON.parse(options.body));
    return response(calls.length === 1 ? analysis : { replies });
  } });
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].messages[1].content).post, post);
  assert.deepEqual(JSON.parse(calls[1].messages[1].content).analysis, analysis);
  assert.equal(JSON.parse(calls[1].messages[1].content).post, post);
  assert.match(calls[0].messages[0].content, /否定された考え/);
  assert.match(calls[1].messages[0].content, /架空の体験/);
  assert.deepEqual(result.analysis, analysis);
  for (const reply of result.replies) {
    assert.ok(hasEmoji(reply.text));
    assert.ok(countText(reply.text) <= 280);
    assert.equal(reply.basis, analysis.evidence[0].quote);
  }
});

test('本文に存在しない引用を根拠にした分析では返信を生成しない', async () => {
  let calls = 0;
  await assert.rejects(generateAI(input, { apiKey: 'test-only', fetchImpl: async () => {
    calls++;
    return response({ ...analysis, evidence: [{ quote: '毎日1000件送るべき', meaning: '本文にない推奨' }] });
  } }), /根拠を確認できません/);
  assert.equal(calls, 1);
});

test('根拠のない返信・長すぎる返信・不正な分析は表示用データにしない', async () => {
  for (const invalid of [null, { ...analysis, cautions: 'なし' }, { ...analysis, evidence: [] }]) {
    await assert.rejects(generateAI(input, { apiKey: 'test-only', fetchImpl: async () => response(invalid) }), /根拠を確認できません/);
  }
  for (const patch of [{ evidenceIndex: 8 }, { text: 'あ'.repeat(141) }, { kind: 'question' }]) {
    let calls = 0;
    await assert.rejects(generateAI(input, { apiKey: 'test-only', fetchImpl: async () => response(++calls === 1 ? analysis : { replies: [{ ...replies[0], ...patch }, ...replies.slice(1)] }) }), /根拠や文字数/);
  }
});

test('接続設定やAIのエラー時は定型文に切り替えず理由を返す', async () => {
  await assert.rejects(generateAI(input), /接続設定/);
  for (const [status, message] of [[401, /認証/], [429, /利用上限/], [503, /接続できません/]]) {
    await assert.rejects(generateAI(input, { apiKey: 'test-only', fetchImpl: async () => new Response('{}', { status }) }), message);
  }
});

test('ChatGPT用依頼文は長い投稿の最後まで残し、読み取りと返信の条件を含む', () => {
  const fullText = '冒頭の問題提起。' + '途中の具体例。'.repeat(3000) + '最後の結論は、相手に必要な場合だけ提案すること。';
  const prompt = buildChatGPTPrompt({ post: fullText, thought: '相手の話を聞くことから始めたいです。', length: 'short' });
  assert.ok(prompt.includes(JSON.stringify(fullText)));
  assert.match(prompt, /否定された考え/);
  assert.match(prompt, /架空の体験/);
  assert.match(prompt, /主張・結論・注意点/);
  assert.match(prompt, /絵文字は各案に必ず1つ以上/);
  assert.match(prompt, /質問は付けず/);
  assert.match(prompt, /120以内/);
  const partialPrompt = buildChatGPTPrompt(input, { url: 'https://x.com/writer/status/1', posts: [{}, {}], partial: true, warnings: ['途中の投稿が取得できませんでした。'] });
  assert.match(partialPrompt, /"partial":true/);
  assert.match(partialPrompt, /途中の投稿が取得できませんでした/);
  assert.match(partialPrompt, /欠けた投稿やメディアの中身を補って返信しない/);
});
