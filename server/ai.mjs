import { countText, ensureEmoji, LIMITS } from '../src/generator.js';
import { READING_INSTRUCTIONS, DRAFTING_INSTRUCTIONS } from '../src/reply-instructions.js';

const compact = text => text.replace(/\s+/gu, '');
const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export async function generateAI(input, { apiKey, model = 'gpt-4.1-mini', fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('AIの接続設定が必要です。');
  const signal = AbortSignal.timeout(60000);
  async function complete(system, data) {
    const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(data) }], response_format: { type: 'json_object' } }),
    });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new Error('AIへの接続が認証されませんでした。環境設定のAPIキーと権限を確認してください。');
      if (response.status === 429) throw new Error('AIの利用上限に達しました。時間をおくか、APIの利用状況を確認してください。');
      throw new Error('AIに接続できませんでした。時間をおいてもう一度お試しください。');
    }
    const payload = await response.json();
    try { return JSON.parse(payload.choices?.[0]?.message?.content); }
    catch { throw new Error('AIの出力を読み取れませんでした。もう一度お試しください。'); }
  }

  const analysis = await complete(`あなたは日本語の投稿を慎重に読む編集者です。\n${READING_INSTRUCTIONS}
返信はまだ作らず、次のJSONだけを返してください。
{"summary":"誰に向けた何の話か（200文字以内）","mainPoint":"最も伝えたい主張（200文字以内）","conclusion":"最後の結論（200文字以内）","cautions":["条件・例外・不明点（各200文字以内、最大6件。なければ空配列）"],"evidence":[{"quote":"主張や結論を裏付ける本文からの正確な抜粋（1〜160文字）","meaning":"文脈上の意味（200文字以内）"}]}
evidenceは1〜5件。本文にない引用を作らず、否定や条件を切り落とさないでください。`, { post: input.post });
  if (!analysis || !['summary', 'mainPoint', 'conclusion'].every(key => validText(analysis[key], 200)) ||
    !Array.isArray(analysis.cautions) || analysis.cautions.length > 6 || analysis.cautions.some(value => !validText(value, 200)) ||
    !Array.isArray(analysis.evidence) || analysis.evidence.length < 1 || analysis.evidence.length > 5 || analysis.evidence.some(item =>
      !item || !validText(item.quote, 160) || !validText(item.meaning, 200) || !compact(input.post).includes(compact(item.quote)))) {
    throw new Error('投稿の根拠を確認できませんでした。本文を確認して、もう一度お試しください。');
  }

  const result = await complete(`あなたは日本語のXリプライを作成する編集者です。\n${READING_INSTRUCTIONS}\n${DRAFTING_INSTRUCTIONS}
analysisは全文を読んで整理した内容です。元のpostと照合して返信を作ってください。directionsにquestionがある場合のみ質問を許可します。
各案は2〜3文、URLなしの日本語で最大${Math.floor(LIMITS[input.length] / 2) - 4}文字を目安に、Xの重み付き文字数で最大${LIMITS[input.length]}以内です。
JSONのみで返してください: {"replies":[{"title":"短い方針名","kind":"insight|action|question","text":"リプライ本文","note":"どの主張や結論を踏まえたか（200文字以内）","evidenceIndex":0}]}。
evidenceIndexはその案の根拠にしたanalysis.evidenceの添字（0から）です。3案とも本文に根拠を持たせてください。`, { ...input, analysis });
  if (!Array.isArray(result?.replies) || result.replies.length !== 3 || result.replies.some(reply =>
    !reply || !validText(reply.text, 600) || countText(reply.text) > LIMITS[input.length] || !validText(reply.title, 80) || !validText(reply.note, 200) ||
    !['insight', 'action', 'question'].includes(reply.kind) || (!input.directions.includes('question') && reply.kind === 'question') ||
    !Number.isInteger(reply.evidenceIndex) || !analysis.evidence[reply.evidenceIndex])) {
    throw new Error('根拠や文字数を満たす返信を作成できませんでした。もう一度お試しください。');
  }
  return { mode: 'ai', analysis, replies: result.replies.map(reply => ({ ...reply, text: ensureEmoji(reply.text, LIMITS[input.length]), basis: analysis.evidence[reply.evidenceIndex].quote })) };
}
