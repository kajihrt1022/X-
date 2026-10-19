import twitterText from 'twitter-text';
import { CONTENT_LIMIT } from './post-reader.js';

export const countText = text => twitterText.parseTweet(text).weightedLength;
export const LIMITS = { short: 120, medium: 200, long: 280 };
const EMOJI_PATTERN = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[#*0-9]\uFE0F?\u20E3)/u;
export const hasEmoji = text => EMOJI_PATTERN.test(text);

export function ensureEmoji(text, limit = 280) {
  if (!text.trim() || hasEmoji(text)) return text;
  const suffix = ' 😊';
  return fitText(text.trimEnd(), limit - countText(suffix)) + suffix;
}

export function fitText(text, limit) {
  if (countText(text) <= limit) return text;
  let result = '';
  for (const char of text) {
    if (countText(result + char + '…') > limit) break;
    result += char;
  }
  return result.trimEnd() + '…';
}

export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('入力内容を確認してください。');
  if (typeof input.post !== 'string' || !input.post.trim()) throw new Error('リプライしたい投稿の本文を入力してください。');
  if (/^https?:\/\/\S+$/.test(input.post.trim())) throw new Error('URLだけでは投稿を読み取れません。投稿の本文を貼り付けてください。');
  if (input.post.length > CONTENT_LIMIT) throw new Error(`投稿の本文は${CONTENT_LIMIT.toLocaleString()}文字以内で入力してください。`);
  const thought = typeof input.thought === 'string' ? input.thought.trim() : '';
  if (thought.length > 300) throw new Error('気づき・試したいことは300文字以内で入力してください。');
  const directions = Array.isArray(input.directions) ? input.directions.filter(d => ['insight', 'action', 'question'].includes(d)) : ['insight', 'action'];
  return {
    post: input.post.trim(),
    author: typeof input.author === 'string' ? input.author.slice(0, 80) : '',
    thought,
    length: Object.hasOwn(LIMITS, input.length) ? input.length : 'medium',
    directions: directions.length ? [...new Set(directions)] : ['insight'],
    variation: Number.isSafeInteger(input.variation) ? Math.abs(input.variation % 100) : 0,
  };
}

function excerpts(post, max) {
  const parts = post.replace(/https?:\/\/\S+/g, '').split(/[。！？!?\n]+/).map(s => s.replace(/^[\s#・\d.①②③④⑤「『]+|[」』\s]+$/g, '').trim()).filter(Boolean);
  if (!parts.length) return ['この投稿'];
  return parts.map(part => {
    if (countText(part) <= max) return part;
    const clauses = part.split(/[、，,：:]/).map(s => s.trim()).filter(s => s && countText(s) <= max);
    return clauses.length ? clauses.at(-1) : fitText(part, max);
  });
}

export function generateLocal(rawInput) {
  const input = validateInput(rawInput);
  const limit = LIMITS[input.length];
  const quotes = excerpts(input.post, input.length === 'short' ? 28 : input.length === 'long' ? 100 : 66);
  // Read across the full text: opening, middle and ending, including a thread's
  // final post. Regeneration varies each region without silently dropping it.
  const anchors = [0, Math.floor((quotes.length - 1) / 2), quotes.length - 1];
  const quote = i => {
    const base = anchors[i % 3];
    const span = Math.max(1, Math.ceil(quotes.length / 3));
    const at = input.variation % 2 === 0 ? base : Math.min(quotes.length - 1, base + (input.variation % span));
    return `「${quotes[at].replaceAll('「', '『').replaceAll('」', '』')}」`;
  };
  const endings = ['という視点が勉強になります。', 'という言葉が印象に残りました。'];
  const name = input.author.trim() ? `${fitText(input.author.trim(), 36)}、` : '';
  const insight = `${name}${quote(0)}${endings[input.variation % endings.length]}`;
  const action = `${quote(1)}を意識してみます。`;
  const useQuestion = input.directions.includes('question');
  const useAction = input.directions.includes('action');
  const useInsight = input.directions.includes('insight');
  const thought = input.thought;
  const connect = (base, addition, tail = '') => {
    const suffix = ' 😊';
    const budget = limit - countText(suffix);
    const required = tail ? '\n' + tail : '';
    base = fitText(base, budget - countText(required));
    const extra = thought ? '\n' + thought : addition;
    const remaining = budget - countText(base + required);
    // Keep complete questions and sentence endings; optional context uses the remaining budget.
    const middle = extra && remaining >= 20 ? fitText(extra, remaining) : '';
    return base + middle + required + suffix;
  };
  const versions = input.variation % 2 === 0;
  const replies = [
    {
      title: useInsight ? '気づきを、まっすぐに' : useAction ? '小さな一歩を伝える' : '関心を、まっすぐに',
      kind: useInsight ? 'insight' : useAction ? 'action' : 'insight',
      text: connect(useInsight ? insight : useAction ? action : `${quote(0)}について、もう少し知りたいです。`, useAction ? '\nまずは一つ、普段の行動に取り入れてみたいです。' : ''),
      note: '投稿の言葉をひとつ拾って、読んだことが伝わる形に。',
    },
    {
      title: useAction ? 'やってみたい、を言葉に' : '心に残ったことを伝える',
      kind: useAction ? 'action' : 'insight',
      text: connect(useAction ? (versions ? `まずは${quote(1)}から意識してみます。` : action) : `${quote(1)}。大切にしたい視点です。`, useInsight ? '\n行動に移すきっかけをいただきました。' : ''),
      note: '実績や体験を付け足さず、これからの行動として伝えます。',
    },
    {
      title: useQuestion ? '会話につながる問いかけ' : useInsight ? '短い言葉で、余韻を残す' : '一歩目を、シンプルに',
      kind: useQuestion ? 'question' : useInsight ? 'insight' : 'action',
      text: connect(useQuestion
        ? `${quote(2)}、勉強になります。`
        : useInsight ? `${quote(2)}。これから意識したい視点です。` : `${quote(2)}を、まずは試してみたいです。`, '', useQuestion ? versions ? 'まず何から始めるのがおすすめですか？' : '実践でつまずきやすい点はありますか？' : ''),
      note: useQuestion ? '質問はひとつだけ。投稿内で既に答えがないか確認しましょう。' : '無理に質問を添えず、ひとつの気づきに絞っています。',
    },
  ];
  return { mode: 'local', replies };
}
