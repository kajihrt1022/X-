export const POST_PROVIDER = 'FxEmbed';
export const THREAD_LIMIT = 80;
export const CONTENT_LIMIT = 60000;
export const THREAD_ENDPOINT = 'https://api.fxtwitter.com/2/thread/';

export function parsePostUrl(value) {
  const raw = String(value || '').trim();
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); }
  catch { throw new Error('Xのポストのリンクを入力してください。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'm.twitter.com', 'm.x.com'].includes(url.hostname)) {
    throw new Error('x.com または twitter.com のポストURLを入力してください。');
  }
  const match = url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/web\/status|i\/status)\/(\d{2,20})(?:\/(?:photo|video)\/\d+)?\/?$/);
  if (!match) throw new Error('ポストのリンクを入力してください。プロフィールや検索画面のURLには対応していません。');
  return { id: match[1], url: `https://x.com/i/status/${match[1]}` };
}

function authorOf(value) {
  if (!value || typeof value !== 'object') return null;
  const handle = typeof value.screen_name === 'string' ? value.screen_name.replace(/^@/, '').slice(0, 30) : '';
  return {
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' ? value.name.slice(0, 100) : handle,
    handle,
  };
}

function sameAuthor(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return !!a.handle && a.handle.toLowerCase() === b.handle.toLowerCase();
}

function statusText(value) {
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  const article = value.article;
  // FxEmbed returns full long-post text in `text`. Article text is added only
  // when the provider actually supplies it; media content is never invented.
  const articleText = typeof article?.content === 'string' ? article.content.trim()
    : typeof article?.content?.text === 'string' ? article.content.text.trim() : '';
  return articleText && !text.includes(articleText) ? [text, article?.title, articleText].filter(v => typeof v === 'string' && v.trim()).join('\n\n') : text;
}

export function normalizeThread(payload, parsed) {
  if (!payload || typeof payload !== 'object') throw new Error('投稿データを読み取れませんでした。もう一度お試しください。');
  if (payload.code !== 200) {
    if ([401, 403].includes(payload.code)) throw new Error('このポストは非公開、または取得が制限されています。本文を貼り付けてご利用ください。');
    if (payload.code === 429) throw new Error('投稿の取得が混み合っています。少し待ってからお試しください。');
    throw new Error('ポストが見つからないか、取得サービスが応答していません。リンクを確認するか、本文を貼り付けてください。');
  }
  const focal = payload.status;
  if (!focal || focal.type === 'tombstone' || String(focal.id) !== parsed.id) throw new Error('リンク先のポスト本文を取得できませんでした。本文を貼り付けてご利用ください。');
  const author = authorOf(focal.author) || authorOf(payload.author);
  if (!author || (!author.id && !author.handle)) throw new Error('投稿者を確認できませんでした。本文を貼り付けてご利用ください。');
  const raw = Array.isArray(payload.thread) && payload.thread.length ? payload.thread : [focal];
  const seen = new Set();
  const posts = [];
  let unavailable = 0;
  let otherAuthors = 0;
  let media = false;
  let partial = false;
  let characters = 0;
  const warnings = [];
  for (const row of [...raw, focal]) {
    if (!row || row.type === 'tombstone' || !row.text && row.id !== focal.id) { unavailable++; continue; }
    const id = String(row.id || '');
    if (!/^\d{2,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    if (!sameAuthor(authorOf(row.author), author)) { otherAuthors++; continue; }
    const text = statusText(row);
    if (!text) { unavailable++; continue; }
    const separatorLength = posts.length ? 2 : 0;
    if (posts.length >= THREAD_LIMIT || characters + text.length + separatorLength > CONTENT_LIMIT) { partial = true; continue; }
    characters += text.length + separatorLength;
    media ||= !!(row.media?.photos?.length || row.media?.videos?.length || row.media?.all?.length);
    posts.push({ id, text, url: `https://x.com/i/status/${id}`, createdAt: typeof row.created_at === 'string' ? row.created_at : null, parentId: row.replying_to?.status ? String(row.replying_to.status) : null });
  }
  if (!posts.length || !posts.some(post => post.id === parsed.id)) throw new Error('リンク先の本文を読み込めませんでした。取得上限を超える場合は、本文を貼り付けてください。');
  posts.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  if (unavailable) warnings.push(`削除・非公開などで読めない投稿が${unavailable}件あります。`);
  if (partial) warnings.push(`取得上限（${THREAD_LIMIT}件・${CONTENT_LIMIT.toLocaleString()}文字）を超えたため、一部だけを読み込んでいます。`);
  if (media) warnings.push('画像内の文字・動画や音声の内容は読み取っていません。');
  const ids = new Set(posts.map(post => post.id));
  if (posts.some(post => post.parentId && !ids.has(post.parentId)) && !otherAuthors && !unavailable) {
    warnings.push('前の投稿を確認できていません。取得した範囲を確認してください。');
    partial = true;
  }
  const body = posts.map(post => post.text).join('\n\n');
  return { id: parsed.id, url: parsed.url, author, posts, body, provider: POST_PROVIDER, unavailable, partial: partial || unavailable > 0, warnings, otherAuthors, fetchedAt: new Date().toISOString() };
}

export async function readPostThread(value, { signal, fetcher = globalThis.fetch, onProgress } = {}) {
  const parsed = parsePostUrl(value);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 25000);
  try {
    onProgress?.('投稿と前後の連続投稿を探しています…');
    const response = await fetcher(THREAD_ENDPOINT + parsed.id, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error('投稿の取得が混み合っています。少し待ってからお試しください。');
      if ([401, 403].includes(response.status)) throw new Error('投稿を取得できませんでした。非公開やアクセス制限の場合は、本文を貼り付けてご利用ください。');
      throw new Error('投稿が見つからないか、取得サービスが応答していません。本文を貼り付けてご利用いただけます。');
    }
    if (Number(response.headers?.get('content-length')) > 3_000_000) throw new Error('投稿データが大きすぎます。必要な本文を貼り付けてご利用ください。');
    const raw = await response.text();
    if (raw.length > 3_000_000) throw new Error('投稿データが大きすぎます。必要な本文を貼り付けてご利用ください。');
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new Error('取得サービスの応答を読み取れませんでした。少し待ってからお試しください。'); }
    return normalizeThread(payload, parsed);
  } catch (error) {
    if (signal?.aborted) throw new DOMException('読み込みを中止しました。', 'AbortError');
    if (timedOut) throw new Error('読み込みに時間がかかっています。少し待ってからもう一度お試しください。');
    if (error instanceof TypeError) throw new Error('取得サービスに接続できませんでした。ネット接続を確認するか、本文を貼り付けてください。');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
