import { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowRight, ArrowUpRight, Bookmark, Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, CircleHelp, Clock3, Copy, ExternalLink, Heart, History, Home, Layers3, Link2, LoaderCircle, Menu, MessageCircle, MessageSquare, Plus, RefreshCw, Search, Send, Settings, ShieldCheck, Smile, Sparkles, Sprout, Trash2, X, Zap } from 'lucide-react';
import { countText, ensureEmoji, generateLocal } from './generator.js';
import { buildChatGPTPrompt } from './reply-instructions.js';
import { CONTENT_LIMIT, parsePostUrl, readPostThread } from './post-reader.js';

const STANDALONE = globalThis.__KOTOBA_STANDALONE__ === true;
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const SAMPLE = '発信を続けるコツは、毎回「すごいこと」を書こうとしないこと。\n今日気づいたこと、失敗して学んだこと、誰かに伝えたい小さな発見。その積み重ねが、その人らしい発信になる。\n\n大事なのは、誰かの正解をなぞるより、自分の気づきを自分の言葉で伝えること。\n\n完璧な1本より、等身大の10本。まずは今日の小さな気づきを、一つだけ書いてみよう。';
const DIRECTIONS = [{ id: 'insight', name: '気づきを伝える' }, { id: 'action', name: '試してみたい' }, { id: 'question', name: '質問を添える' }];
const KINDS = { insight: { name: '丁寧・気づき', icon: Sparkles }, action: { name: '実践', icon: Sprout }, question: { name: '問いかけ', icon: MessageCircle }, empathy: { name: '共感', icon: Heart } };

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function savedItems() {
  const items = readStorage('kotoba-saved', []);
  return Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.title === 'string') : [];
}
function historyItems() {
  const items = readStorage('kotoba-history', []);
  return Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string' && typeof item.post === 'string' && Array.isArray(item.replies)).slice(0, 20) : [];
}
function dateLabel(date) {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? '' : new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
}

async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const previous = document.activeElement;
    const input = document.createElement('textarea');
    input.value = text;
    input.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.append(input);
    let success;
    try { input.select(); success = document.execCommand('copy'); }
    finally { input.remove(); previous?.focus(); }
    if (!success) throw new Error('Copy unavailable');
  }
}

function Brand({ small = false }) {
  return <span className={`brand ${small ? 'brand-small' : ''}`}><span className="brand-icon"><Send size={small ? 17 : 21} strokeWidth={2} fill="white" /></span><span>Reply Craft</span></span>;
}
function HeroArt() {
  return <svg className="hero-art" viewBox="0 0 330 146" fill="none" aria-hidden="true">
    <circle cx="218" cy="68" r="89" fill="#bedaff" fillOpacity=".45" />
    <path d="M91 35a10 10 0 0 1 10-10h107a10 10 0 0 1 10 10v45a10 10 0 0 1-10 10h-65l-16 12V90h-26a10 10 0 0 1-10-10z" fill="#fff" fillOpacity=".67" transform="rotate(8 154 62)" />
    <path d="M115 44h75M115 55h59M115 66h41" stroke="#aacdfb" strokeWidth="5" strokeLinecap="round" transform="rotate(8 154 62)" />
    <rect x="216" y="24" width="57" height="57" rx="16" fill="#153855" transform="rotate(-12 245 53)" />
    <path d="m234 39 23 29h-7l-23-29h7Zm22 0-24 29" stroke="white" strokeWidth="1.8" strokeLinejoin="round" transform="rotate(-12 245 53)" />
    <path d="M64 84a8 8 0 0 1 8-8h42a8 8 0 0 1 8 8v17a8 8 0 0 1-8 8h-9v9l-12-9H72a8 8 0 0 1-8-8z" fill="#96c4ff" transform="rotate(-8 93 96)" />
    <path d="M77 88h31M77 96h21" stroke="#d5e7ff" strokeWidth="3" strokeLinecap="round" transform="rotate(-8 93 96)" />
    <path d="M251 100a8 8 0 0 1 8-8h42a8 8 0 0 1 8 8v17a8 8 0 0 1-8 8h-9v9l-12-9h-21a8 8 0 0 1-8-8z" fill="#fff" fillOpacity=".8" />
    <path d="M264 103h30M264 112h19" stroke="#aacdfb" strokeWidth="3" strokeLinecap="round" />
    <path d="m51 33 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#73aaff" />
    <circle cx="290" cy="52" r="3" fill="#8ab8fb" />
  </svg>;
}
function EmptyArt() {
  return <svg className="empty-art" viewBox="0 0 240 160" fill="none" aria-hidden="true"><ellipse cx="119" cy="143" rx="79" ry="8" fill="#dfebfd" /><rect x="45" y="28" width="132" height="89" rx="12" fill="white" stroke="#c5daf9" strokeWidth="1.5" transform="rotate(-7 111 72)" /><path d="M66 54h78M66 68h62M66 82h39" stroke="#d5e6ff" strokeWidth="6" strokeLinecap="round" transform="rotate(-7 111 72)" /><rect x="118" y="78" width="79" height="57" rx="12" fill="url(#empty-blue)" transform="rotate(8 158 106)" /><path d="m139 102 8 8 19-18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="m186 31 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill="#97bdff" /><circle cx="34" cy="102" r="4" fill="#c6ddff" /><defs><linearGradient id="empty-blue" x1="118" y1="78" x2="197" y2="135"><stop stopColor="#38afff" /><stop offset="1" stopColor="#1760ff" /></linearGradient></defs></svg>;
}
function ReplyCard({ reply, index, archive = false, saved, copied, onCopy, onSave, onDelete, onEdit }) {
  const isSaved = saved.some(item => item.text === reply.text);
  const over = countText(reply.text) > 280;
  const kind = KINDS[reply.kind] || KINDS.insight;
  const Icon = kind.icon;
  return <article className={`reply-card ${index === 0 && !archive ? 'recommended-card' : ''}`}>
    <div className="reply-card-top"><span className={`kind-tag ${reply.kind}`}><Icon size={12} />{kind.name}</span>{index === 0 && !archive && <span className="recommend"><span>♛</span> おすすめ</span>}{archive && reply.createdAt && <time>{dateLabel(reply.createdAt)}</time>}</div>
    <h3>{reply.title}</h3>
    {archive ? <p className="saved-text">{reply.text}</p> : <textarea className="reply-editor" aria-label={`案${index + 1}の本文`} value={reply.text} maxLength={1000} rows={Math.max(3, Math.ceil(reply.text.length / 24))} onChange={event => onEdit(reply.id, event.target.value)} />}
    {reply.basis && <details className="reply-basis"><summary>この返信の根拠</summary><p>{reply.note}</p><blockquote>{reply.basis}</blockquote></details>}
    {archive && <details className="source-details"><summary>元の投稿を見る</summary><p>{reply.post}</p>{reply.sourceUrl && <a href={reply.sourceUrl} target="_blank" rel="noreferrer">Xで開く <ArrowUpRight size={11} /></a>}</details>}
    <div className="reply-card-footer"><span className={`text-count ${over ? 'over' : ''}`}>{countText(reply.text)}<span> / 280</span></span><div className="card-actions"><button type="button" className={`copy-button ${copied === reply.id ? 'copied' : ''}`} disabled={over || !reply.text.trim()} onClick={() => onCopy(reply)}>{copied === reply.id ? <CheckCheck size={15} /> : <Copy size={15} />}{copied === reply.id ? 'コピー済み' : 'コピー'}</button><button type="button" className={`icon-button save-button ${isSaved ? 'is-saved' : ''}`} aria-label={archive ? '保存を削除' : isSaved ? `案${index + 1}の保存を解除` : `案${index + 1}を保存`} onClick={() => archive ? onDelete(reply.id) : onSave(reply)}>{archive ? <Trash2 size={17} /> : <Heart size={19} fill={isSaved ? 'currentColor' : 'none'} />}</button></div></div>
    {over && <p className="field-error">Xの文字数上限を超えています。280以内に整えてください。</p>}
  </article>;
}

function App() {
  const initialPrefs = useRef(readStorage('kotoba-preferences', {}));
  const [page, setPage] = useState('home');
  const [inputMode, setInputMode] = useState('url');
  const [postUrl, setPostUrl] = useState('');
  const [source, setSource] = useState(null);
  const [post, setPost] = useState('');
  const [author, setAuthor] = useState('');
  const [thought, setThought] = useState('');
  const [length, setLength] = useState(['short', 'medium', 'long'].includes(initialPrefs.current?.length) ? initialPrefs.current.length : 'medium');
  const [directions, setDirections] = useState(['insight', 'action']);
  const [replies, setReplies] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [saved, setSaved] = useState(savedItems);
  const [history, setHistory] = useState(historyItems);
  const [mode, setMode] = useState(STANDALONE ? 'local' : null);
  const [resultMode, setResultMode] = useState('local');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [filter, setFilter] = useState('');
  const [snapshot, setSnapshot] = useState({ post: '', sourceUrl: '' });
  const [variation, setVariation] = useState(0);
  const [copied, setCopied] = useState(null);
  const resultRef = useRef(null);
  const postRef = useRef(null);
  const urlRef = useRef(null);
  const requestRef = useRef(null);
  const readerRef = useRef(null);
  const readSequence = useRef(0);
  const modalRef = useRef(null);
  const working = busy || importing;
  const createPage = page === 'home' || page === 'create';

  useEffect(() => {
    if (STANDALONE) return;
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setMode(data.mode)).catch(error => { if (error.name !== 'AbortError') setMode('unavailable'); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { requestRef.current?.abort(); readerRef.current?.abort(); }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { if (!copied) return; const timeout = setTimeout(() => setCopied(null), 2500); return () => clearTimeout(timeout); }, [copied]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    modalRef.current?.querySelector('button, input, select')?.focus();
    function onKey(event) {
      if (event.key === 'Escape') setModal(null);
      if (event.key === 'Tab') {
        const elements = modalRef.current?.querySelectorAll('button, input, select, [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [modal]);

  function navigate(next) { setPage(next); setFilter(''); setMobileMenu(false); }
  function persistSaved(items) {
    try { localStorage.setItem('kotoba-saved', JSON.stringify(items)); setSaved(items); return true; }
    catch { setToast('保存できませんでした。ブラウザの保存容量・設定をご確認ください。'); return false; }
  }
  function toggleSave(reply) {
    reply = { ...reply, text: ensureEmoji(reply.text) };
    editReply(reply.id, reply.text);
    const existing = saved.find(item => item.text === reply.text);
    const next = existing ? saved.filter(item => item.id !== existing.id) : [{ ...reply, id: uniqueId(), post: snapshot.post, sourceUrl: snapshot.sourceUrl, createdAt: new Date().toISOString(), mode: resultMode }, ...saved];
    if (persistSaved(next)) setToast(existing ? '保存を解除しました' : '返信を保存しました');
  }
  async function copy(reply) {
    const text = ensureEmoji(reply.text);
    try {
      await writeClipboard(text);
      editReply(reply.id, text); setCopied(reply.id); setToast('コピーしました。Xの返信欄に貼り付けて使えます。');
    } catch { setToast('コピーできませんでした。本文を選択してコピーしてください。'); }
  }
  function deleteReply(id) { if (persistSaved(saved.filter(item => item.id !== id))) setToast('保存を削除しました'); }
  function editReply(id, text) { setReplies(items => items.map(item => item.id === id ? { ...item, text } : item)); }
  function cancelImport() { readSequence.current++; readerRef.current?.abort(); setImporting(false); setProgress(''); }
  function changeUrl(value) { cancelImport(); setPostUrl(value); setSource(null); setError(''); }
  function chooseInputMode(value) { cancelImport(); setInputMode(value); setError(''); }
  async function importThread() {
    const parsed = parsePostUrl(postUrl);
    readerRef.current?.abort();
    const controller = new AbortController();
    readerRef.current = controller;
    const ticket = ++readSequence.current;
    setImporting(true); setError('');
    try {
      const result = await readPostThread(parsed.url, { signal: controller.signal, onProgress: setProgress });
      if (ticket !== readSequence.current) throw new DOMException('読み込みを中止しました。', 'AbortError');
      setSource(result); setPost(result.body); setAuthor(result.author.name);
      return result;
    } finally { if (ticket === readSequence.current) { setImporting(false); setProgress(''); } }
  }
  async function importOnly() {
    try { await importThread(); } catch (error) { if (error.name !== 'AbortError') setError(error.message); }
  }
  function addHistory(item) {
    const items = [item, ...history].slice(0, 20);
    try { localStorage.setItem('kotoba-history', JSON.stringify(items)); setHistory(items); }
    catch { setToast('返信を作成しました。履歴の保存容量が足りないため、履歴は保存できませんでした。'); }
  }
  function deleteHistory(id) {
    const items = history.filter(item => item.id !== id);
    try { localStorage.setItem('kotoba-history', JSON.stringify(items)); setHistory(items); setToast('履歴を削除しました'); }
    catch { setToast('履歴を削除できませんでした。ブラウザの保存設定をご確認ください。'); }
  }
  function restoreHistory(item) {
    setHandoff(null); setAnalysis(item.analysis || null);
    setPost(item.post); setAuthor(item.author || ''); setThought(item.thought || ''); setLength(item.length || 'medium'); setDirections(item.directions || ['insight', 'action']); setInputMode('text'); setSource(null); setPostUrl(item.sourceUrl || '');
    setReplies(item.replies.filter(reply => reply && typeof reply.text === 'string').map(reply => ({ ...reply, id: uniqueId() })));
    setSnapshot({ post: item.post, sourceUrl: item.sourceUrl || '' }); setResultMode(item.mode || 'local'); setError(''); navigate('create'); setToast('履歴の本文と返信案を読み込みました');
  }
  async function generate(event, patternOnly = false) {
    event?.preventDefault();
    if (working) return;
    setError(''); setBusy(true);
    const controller = new AbortController();
    requestRef.current = controller;
    let timeout;
    try {
      let body = post, recipient = author, imported = source;
      if (inputMode === 'url') {
        const parsed = parsePostUrl(postUrl);
        if (source?.id !== parsed.id) { imported = await importThread(); body = imported.body; recipient = imported.author.name; }
      }
      if (!body.trim()) { postRef.current?.focus(); throw new Error('リプライしたい投稿の本文を入力してください。'); }
      timeout = setTimeout(() => controller.abort(), 75000);
      const params = { post: body, author: recipient, thought, length, directions, variation };
      if (!patternOnly && mode !== 'ai') {
        const prompt = buildChatGPTPrompt(params, inputMode === 'url' ? imported : null);
        setHandoff({ prompt, postCount: inputMode === 'url' ? imported?.posts?.length || 1 : 1 });
        setReplies([]); setAnalysis(null); setSnapshot({ post: body, sourceUrl: imported?.url || '' });
        if (window.innerWidth < 1000) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        return;
      }
      let data;
      if (patternOnly) data = generateLocal(params);
      else {
        const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: controller.signal });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || '作成できませんでした。');
      }
      if (!patternOnly && data.mode !== 'ai') throw new Error('AIに接続できませんでした。ChatGPTでの作成を使うか、接続設定を確認してください。');
      if (!Array.isArray(data.replies) || data.replies.length !== 3) throw new Error('返信案を読み取れませんでした。もう一度お試しください。');
      const items = data.replies.map(reply => ({ ...reply, id: uniqueId() }));
      const sourceUrl = inputMode === 'url' ? imported?.url || '' : '';
      setHandoff(null); setAnalysis(data.analysis || null); setReplies(items); setResultMode(data.mode); setSnapshot({ post: body, sourceUrl }); setVariation(v => v + 1);
      addHistory({ id: uniqueId(), post: body, author: recipient, thought, length, directions, sourceUrl, postCount: inputMode === 'url' ? imported?.posts?.length || 1 : 1, replies: items, analysis: data.analysis || null, mode: data.mode, createdAt: new Date().toISOString() });
      if (window.innerWidth < 1000) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) {
      if (error.name !== 'AbortError') setError(error.message || '作成できませんでした。もう一度お試しください。');
      else if (controller.signal.aborted) setError('接続がタイムアウトしました。もう一度お試しください。');
    } finally { if (timeout) clearTimeout(timeout); setBusy(false); }
  }
  async function copyPrompt() {
    try {
      await writeClipboard(handoff.prompt);
      setToast('依頼文をコピーしました。ChatGPTに貼り付けて送信してください。');
    } catch { setToast('コピーできませんでした。依頼文を表示して、本文を選択してください。'); }
  }
  function useSample() { cancelImport(); setInputMode('text'); setPost(SAMPLE); setSource(null); setAuthor(''); setError(''); postRef.current?.focus(); }
  function savePreferences() {
    try { localStorage.setItem('kotoba-preferences', JSON.stringify({ length })); setModal(null); setToast('返信の設定を保存しました'); }
    catch { setToast('設定を保存できませんでした。ブラウザの保存設定をご確認ください。'); }
  }
  const cardProps = { saved, copied, onCopy: copy, onSave: toggleSave, onDelete: deleteReply, onEdit: editReply };
  const filteredSaved = saved.filter(reply => [reply.text, reply.title, reply.post].join(' ').includes(filter));
  const filteredHistory = history.filter(item => [item.post, item.author, item.sourceUrl].join(' ').includes(filter));
  const pageName = page === 'saved' ? '保存した返信' : page === 'history' ? '作成履歴' : page === 'create' ? '返信を作成' : 'ホーム';

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-backdrop" onClick={() => setMobileMenu(false)} aria-label="メニューを閉じる" />}
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <a href="#" className="brand-link" onClick={event => { event.preventDefault(); navigate('home'); }}><Brand /></a>
      <p className="brand-subtitle">いい返信で、つながりが広がる。</p>
      <span className="workspace-label">YOUR WORKSPACE</span>
      <nav aria-label="メインメニュー">
        <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => navigate('home')}><Home size={19} fill={page === 'home' ? 'currentColor' : 'none'} /><span>ホーム</span></button>
        <button className={`nav-item ${page === 'create' ? 'active' : ''}`} onClick={() => navigate('create')}><Send size={18} /><span>返信を作成</span></button>
        <button aria-label="保存したリプライ" className={`nav-item ${page === 'saved' ? 'active' : ''}`} onClick={() => navigate('saved')}><Heart size={19} /><span>保存した返信</span>{saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>
        <button className={`nav-item ${page === 'history' ? 'active' : ''}`} onClick={() => navigate('history')}><History size={19} /><span>履歴</span></button>
        <button className="nav-item" aria-label="返信の設定" onClick={() => { setModal('preferences'); setMobileMenu(false); }}><Settings size={19} /><span>設定</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="sidebar-note-icon"><Sparkles size={21} /></span><p>あなたらしい言葉で、<br />もっと心地よい<br /><strong>Xの会話を。</strong></p><span>Better replies. Brighter connections.</span><div className="wave wave-one" /><div className="wave wave-two" /></div><button className="help-link" onClick={() => setModal('guide')}><CircleHelp size={16} />使い方とヒント<ArrowUpRight size={13} /></button><div className="sidebar-footer"><span className="free-dot" />FREE WORKSPACE<span>v2.0</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="メニューを開く"><Menu size={22} /></button><span className="mobile-brand"><Brand small /></span><span className="desktop-crumb">ワークスペース <ChevronRight size={13} /> <strong>{pageName}</strong></span></div><div className="topbar-actions"><span className="free-badge"><span />無料で利用できます</span><button className="icon-button" aria-label="使い方ガイド" onClick={() => setModal('guide')}><CircleHelp size={19} /></button><button className="account-avatar" aria-label="返信の設定" onClick={() => setModal('preferences')}>H</button></div></header>
      <main>
        <section className="hero"><div className="hero-copy"><span className="hero-eyebrow"><span />YOUR WORDS, BETTER CONNECTIONS</span><h1>{createPage ? <>Xの投稿に、<span className="hero-title-end">ちょうどいい返信を。</span></> : page === 'saved' ? 'とっておきの返信を、いつでも。' : 'あの言葉を、もう一度。'}</h1><p>{createPage ? '投稿の流れをたどって、あなたらしい言葉に。' : page === 'saved' ? '気に入った言葉を集めて、あなたの引き出しに。' : 'これまでの投稿と返信案を、まとめて振り返れます。'}</p></div><HeroArt /></section>
        {createPage ? <>
          <div className="studio-grid">
            <form className="compose-panel" onSubmit={generate}>
              <div className="panel-heading"><h2><Link2 size={20} />元ポストを貼り付け</h2><button type="button" className="sample-button" aria-label="サンプルを入れる" onClick={useSample} disabled={working}><Sparkles size={12} />サンプルを使う</button></div>
              <div className="input-tabs" role="group" aria-label="投稿の入力方法"><button type="button" aria-pressed={inputMode === 'url'} className={inputMode === 'url' ? 'active' : ''} onClick={() => chooseInputMode('url')} disabled={working}><Link2 size={14} />リンクから読み込む</button><button type="button" aria-pressed={inputMode === 'text'} className={inputMode === 'text' ? 'active' : ''} onClick={() => chooseInputMode('text')} disabled={working}><AlignLeft size={14} />本文を貼り付ける</button></div>
              {inputMode === 'url' ? <div className="url-section"><label htmlFor="post-url" className="sr-only">ポストのリンク</label><div className={`url-input-wrap ${error && !source ? 'has-error' : ''}`}><Link2 size={16} /><input id="post-url" ref={urlRef} value={postUrl} onChange={event => changeUrl(event.target.value)} placeholder="https://x.com/…/status/…" type="text" inputMode="url" maxLength={500} autoComplete="off" spellCheck={false} disabled={working} /><button type="button" className="read-button" onClick={importOnly} disabled={working || !postUrl.trim()}>{importing ? <LoaderCircle size={13} className="spinning" /> : <ArrowRight size={14} />}{importing ? '取得中' : '読み込む'}</button></div><div className="url-caption"><span><Check size={12} />公開ポスト・連続投稿に対応</span><button type="button" onClick={() => setModal('reading')} aria-label="リンク読み取りについて"><CircleHelp size={13} /></button></div>
                {source ? <div className="thread-preview"><div className="thread-preview-header"><span className="post-avatar">{source.author.name?.slice(0, 1) || 'X'}</span><div><strong>{source.author.name}</strong><span>@{source.author.handle}</span></div><span className={`thread-count ${source.partial ? 'partial' : ''}`}><Layers3 size={12} />{source.posts.length}件{source.partial ? '・一部未取得' : 'を取得'}</span></div><ol className="thread-posts">{source.posts.map((item, index) => <li key={item.id}><div className="thread-position"><span>{index + 1}</span><i /></div><div className="thread-post-content"><div className="thread-post-label"><span>{index === 0 ? '最初に取得した投稿' : index === source.posts.length - 1 ? '最後に取得した投稿' : '続きの投稿'}</span>{item.id === source.id && <b>リンク先</b>}<a href={item.url} target="_blank" rel="noreferrer" aria-label={`${index + 1}件目の投稿をXで開く`}><ExternalLink size={12} /></a></div><p>{item.text}</p></div></li>)}</ol><div className="thread-summary"><CheckCheck size={13} />{source.posts.length}件・{source.body.length.toLocaleString()}文字を返信づくりに使用</div>{source.warnings.length > 0 && <div className="coverage-warning">{source.warnings.map(warning => <p key={warning}><CircleAlert size={12} />{warning}</p>)}</div>}<p className="coverage-caption">取得サービスから返された範囲です。すべての続きが含まれるか、送信前にご確認ください。</p><details className="edit-imported"><summary><AlignLeft size={12} />読み取った本文を編集・補足する</summary><label className="sr-only" htmlFor="imported-post">取得した投稿の本文</label><textarea id="imported-post" value={post} onChange={event => setPost(event.target.value)} maxLength={CONTENT_LIMIT} rows={6} disabled={working} /></details></div>
                : <div className={`url-empty ${importing ? 'loading' : ''}`}><span className="url-empty-icon">{importing ? <LoaderCircle size={22} className="spinning" /> : <Layers3 size={24} />}</span><strong>{importing ? '投稿の流れを読み込んでいます' : 'リンクひとつで、言葉の背景まで。'}</strong><p>{importing ? progress : <>途中のポストのリンクからも、<br />前後の連続投稿を探します。</>}</p>{importing && <button type="button" className="text-button" onClick={cancelImport}>読み込みを中止する</button>}</div>}
              </div> : <div className="text-section"><label htmlFor="post" className="sr-only">相手の投稿</label><div className="post-input-wrap"><textarea id="post" ref={postRef} value={post} onChange={event => { setPost(event.target.value); setError(''); }} maxLength={CONTENT_LIMIT} placeholder={'返信したいポストの本文を貼り付けてください。\n\n長いポストや連続投稿は、最初から最後までまとめて貼り付けられます。'} disabled={working} /><div className="post-input-footer"><span><MessageSquare size={11} />ポストの本文・連続投稿</span><span>{post.length.toLocaleString()} / {CONTENT_LIMIT.toLocaleString()}</span></div></div><div className="author-row"><label htmlFor="author">投稿者のお名前<span>任意</span></label><input id="author" value={author} maxLength={80} onChange={event => setAuthor(event.target.value)} placeholder="例：ヒロさん" disabled={working} /></div></div>}
              <details className="more-options"><summary><Settings size={14} />あなたらしさを、もう少し<ChevronDown size={13} /></summary><div><fieldset disabled={working}><legend className="field-label">伝えたいこと<span>複数選択OK</span></legend><div className="direction-options">{DIRECTIONS.map(item => <button type="button" key={item.id} aria-pressed={directions.includes(item.id)} className={directions.includes(item.id) ? 'selected' : ''} onClick={() => setDirections(items => items.includes(item.id) ? items.length > 1 ? items.filter(value => value !== item.id) : items : [...items, item.id])}>{directions.includes(item.id) ? <Check size={11} /> : <Plus size={11} />}{item.name}</button>)}</div></fieldset><label htmlFor="thought" className="field-label thought-label">あなたの気づき・試したいこと<span>任意</span></label><textarea id="thought" value={thought} onChange={event => setThought(event.target.value)} maxLength={300} rows={2} placeholder="例：まずは今日の小さな気づきを発信してみたい" disabled={working} /><div className="fine-options"><label htmlFor="length">文章の長さ <span className="select-wrap"><select id="length" aria-label="文章の長さ" value={length} onChange={event => setLength(event.target.value)} disabled={working}><option value="short">短め</option><option value="medium">ほどよく</option><option value="long">しっかり</option></select><ChevronDown size={12} /></span></label></div></div></details>
              {error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
              <button className="generate-button" type="submit" disabled={working}>{working ? <LoaderCircle size={19} className="spinning" /> : <Sparkles size={20} />}<span>{importing ? '投稿を読み込んでいます…' : busy ? (mode === 'ai' ? '全文の意味と根拠を確認しています…' : 'ChatGPTへの依頼を準備しています…') : '返信を生成'}</span>{!working && <ChevronRight size={20} />}</button>
              <p className="generation-mode">{mode === 'ai' ? <><Sparkles size={12} />AIが主張・結論・根拠を確認してから3案を作成</> : mode === 'unavailable' ? <><CircleAlert size={12} />サーバーに接続できません</> : mode ? <><Sparkles size={12} />全文をChatGPTに渡して内容を踏まえた3案へ</> : '接続を確認しています…'}<button type="button" aria-label="生成方法について" onClick={() => setModal('about')}><CircleHelp size={12} /></button></p>
              <details className="pattern-option"><summary>AIなしで下書きを作る</summary><p>定型文を使う簡易版です。投稿の意味を理解する機能はありません。</p><button type="button" className="secondary-button" disabled={working} onClick={event => generate(event, true)}>定型文で下書きを作る</button></details>
            </form>
            <section className="results-panel" ref={resultRef} aria-busy={working} aria-label="リプライの候補"><div className="results-heading"><h2>{handoff ? 'ChatGPTで返信を作成' : replies.length ? '生成された返信' : '返信の作成'}</h2><span>{handoff ? 'ChatGPTで作成' : replies.length ? '3件の提案' : 'あなたらしい言葉を、ここに'}</span></div>{handoff ? <div className="chatgpt-handoff"><span className="modal-icon"><Sparkles size={24} /></span><h3>全文の意味を踏まえた返信を、ChatGPTで。</h3><p>取得・補足した{handoff.postCount}件分の本文と、内容を読み取るための依頼文を準備しました。</p><ol><li>下のボタンで依頼文をコピー</li><li>ChatGPTを開いて貼り付け、送信</li></ol><p className="handoff-detail">主張・結論・注意点を整理してから、根拠のある返信を3案作ります。絵文字も各案に1つ以上添えます。</p><button type="button" className="generate-button" onClick={copyPrompt}><Copy size={17} />1. 依頼文をコピー</button><a className="secondary-button chatgpt-link" href="https://chatgpt.com/" target="_blank" rel="noreferrer">2. ChatGPTを開く<ExternalLink size={14} /></a><details className="prompt-details"><summary>依頼文を表示する</summary><textarea aria-label="ChatGPTへの依頼文" readOnly value={handoff.prompt} rows={10} /></details><p className="coverage-caption">この画面ではAI生成を行っていません。貼り付けて送信すると、本文がChatGPTに渡ります。ChatGPTの利用条件・回数制限が適用されます。</p></div> : replies.length ? <div className={`reply-list ${working ? 'refreshing' : ''}`}>{analysis && <div className="understanding-panel"><h3><Sparkles size={15} />理解した内容</h3><p>{analysis.summary}</p><dl><dt>主張</dt><dd>{analysis.mainPoint}</dd><dt>結論</dt><dd>{analysis.conclusion}</dd></dl>{analysis.cautions?.length > 0 && <ul>{analysis.cautions.map(item => <li key={item}>{item}</li>)}</ul>}</div>}{resultMode === 'local' && <p className="pattern-label">定型文の下書きです。AIによる内容理解は行っていません。</p>}{replies.map((reply, index) => <ReplyCard {...cardProps} key={reply.id} reply={reply} index={index} />)}<p className="edit-hint"><AlignLeft size={12} />本文はクリックして、自由に編集できます。</p><button type="button" className="regenerate-button" disabled={working} onClick={event => generate(event, resultMode === 'local')}><RefreshCw size={14} className={working ? 'spinning' : ''} />別の表現でつくり直す</button>{snapshot.sourceUrl && <a className="source-link" href={snapshot.sourceUrl} target="_blank" rel="noreferrer">返信するポストをXで開く<ArrowUpRight size={12} /></a>}</div> : <div className="empty-results"><EmptyArt /><span className="empty-eyebrow">GOOD WORDS. GOOD CONNECTIONS.</span><h3>伝えたい気持ちを、<br />もっと、いい言葉で。</h3><p>ポストのリンクを貼り付けたら<br />「返信を生成」を押すだけ。</p><div className="empty-tags"><span><Sparkles size={12} />具体的な気づき</span><span><Heart size={12} />自然な共感</span><span><MessageCircle size={12} />会話のきっかけ</span></div><div className="empty-tip"><LightbulbIcon /><p>「勉強になります」に、<br /><strong>どこが心に残ったか</strong>をひと言添えて。</p></div></div>}<div className="gentle-reminder"><ShieldCheck size={16} /><p>送る前に、あなたの気持ちと合っているか確認しましょう。<br /><span>体験や実績をつくり足さず、自然なひと言を大切に。</span></p></div></section>
          </div>
          <section className="benefits" aria-label="Reply Craftの特徴"><div><span><Zap size={21} fill="currentColor" /></span><div><strong>リンクひとつで、かんたん</strong><p>リンクを貼って、ボタンを押して、<br />あなたらしい返信へ。</p></div></div><div><span><Smile size={21} /></span><div><strong>あなたらしい返信</strong><p>気づきや試したいことを添えて、<br />自然な言葉に整えます。</p></div></div><div><span><ShieldCheck size={21} /></span><div><strong>保存はこのブラウザに</strong><p>気に入った言葉を保存して、<br />いつでも振り返れます。</p></div></div><div><span><MessageCircle size={21} /></span><div><strong>Xでのつながりを</strong><p>相手へのリスペクトを込めた、<br />小さな会話のきっかけに。</p></div></div></section>
        </> : page === 'saved' ? <section className="saved-panel"><div className="collection-toolbar"><h2><Heart size={18} />保存した返信<span>{saved.length}</span></h2><label className="search-box"><Search size={15} /><input aria-label="保存したリプライを検索" value={filter} onChange={event => setFilter(event.target.value)} placeholder="言葉で検索する…" /></label></div>{saved.length === 0 ? <div className="archive-empty"><Heart size={35} strokeWidth={1.3} /><h3>残しておきたい言葉を、ここに。</h3><p>返信案のハートを押すと保存できます。</p><button className="secondary-button" onClick={() => navigate('create')}><Plus size={15} />返信をつくる</button></div> : <div className="saved-grid">{filteredSaved.map((reply, index) => <ReplyCard {...cardProps} key={reply.id} reply={reply} index={index} archive />)}{filteredSaved.length === 0 && <p className="no-results">この言葉を含むリプライはありません。</p>}</div>}<p className="storage-note">保存先はこのブラウザです。ブラウザのデータを削除すると、保存した内容も削除されます。</p></section> : <section className="history-panel"><div className="collection-toolbar"><h2><History size={19} />作成履歴<span>{history.length}</span></h2><label className="search-box"><Search size={15} /><input aria-label="履歴を検索" value={filter} onChange={event => setFilter(event.target.value)} placeholder="本文・投稿者で検索…" /></label></div>{history.length === 0 ? <div className="archive-empty"><Clock3 size={35} strokeWidth={1.3} /><h3>ここから、言葉を積み重ねよう。</h3><p>作成した返信と元の投稿が、自動で履歴に残ります。</p><button className="secondary-button" onClick={() => navigate('create')}><Plus size={15} />返信をつくる</button></div> : <div className="history-list">{filteredHistory.map(item => <article className="history-card" key={item.id}><div className="history-card-top"><span><Clock3 size={13} />{dateLabel(item.createdAt)}</span><span>{item.postCount || 1}件の投稿・3件の返信</span><button className="icon-button" aria-label="この履歴を削除" onClick={() => deleteHistory(item.id)}><Trash2 size={15} /></button></div><p>{item.post}</p><div className="history-card-bottom"><span>{item.sourceUrl ? 'リンクから作成' : '本文から作成'}</span><button type="button" onClick={() => restoreHistory(item)}>この返信を開く<ArrowRight size={14} /></button></div></article>)}{filteredHistory.length === 0 && <p className="no-results">この言葉を含む履歴はありません。</p>}</div>}<p className="storage-note">履歴はこのブラウザに最新20件を保存します。保存した返信は履歴と別に残ります。</p></section>}
        <footer className="page-footer"><Brand small /><span>いい返信で、つながりが広がる。</span><button onClick={() => setModal('reading')}>データの取り扱い</button></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {modal && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={modalRef}><button className="modal-close icon-button" aria-label="閉じる" onClick={() => setModal(null)}><X size={20} /></button><span className="modal-icon">{modal === 'preferences' ? <Settings size={23} /> : modal === 'reading' ? <Link2 size={24} /> : <Sparkles size={24} />}</span><h2 id="modal-title">{modal === 'preferences' ? '返信の設定' : modal === 'reading' ? 'リンク読み取りとデータについて' : modal === 'about' ? '返信案のつくり方' : 'ひと言から、会話がはじまる。'}</h2>{modal === 'preferences' ? <><p className="modal-description">文章の長さを保存できます。絵文字は必ず1つ以上添えます。</p><label className="modal-label">文章の長さ<select value={length} onChange={event => setLength(event.target.value)}><option value="short">短め</option><option value="medium">ほどよく</option><option value="long">しっかり</option></select></label><button className="generate-button" onClick={savePreferences}><Check size={17} />設定を保存する</button></> : modal === 'reading' ? <><div className="guide-item"><strong>公開ポストと、同じ投稿者の連続投稿を取得</strong><p>ポストのIDを外部の非公式取得サービスFxEmbed（FxTwitter）へ送信して本文を取得します。途中のリンクから、前後の投稿をたどります。他ユーザーの返信は混ぜず、取得できた投稿を時系列順に表示します。Xのログイン情報やパスワードは不要です。</p></div><div className="guide-item"><strong>読み込めた範囲を確認できます</strong><p>非公開・削除・取得制限のある投稿や、画像内の文字、動画・音声の内容は取得できません。サービスがすべての続きを返す保証はありません。件数と本文を確認し、足りない内容は編集欄で補足してください。</p></div><div className="guide-item"><strong>保存と履歴は、このブラウザの中に</strong><p>保存した返信・履歴・文体設定はブラウザ内に保管します。別の端末とは同期しません。本文を貼り付けて文章パターンで生成する場合は、外部サービスへの通信は行いません。</p></div></> : modal === 'about' ? <><div className="guide-item"><strong>ChatGPTで内容を理解して返信（公開版）</strong><p>全文と、主張・結論・注意点を整理する依頼文を準備します。依頼文をコピーし、ChatGPTへ貼り付けて送信してください。このサイトでAI生成したようには表示しません。追加のAPI設定は不要で、ChatGPTの利用条件・回数制限が適用されます。</p></div><div className="guide-item"><strong>AIでの生成（サーバー版のみ）</strong><p>サーバーにAIのAPIキーを設定すると、この画面で生成できます。まず全文から主張・結論・根拠を整理し、次にその根拠に沿って3案を作成します。AI接続が失敗しても定型文には切り替えません。API利用料金がかかります。</p></div><div className="privacy-note">返信を保証するものではありません。相手への敬意を込めて、無理のないペースでご利用ください。</div></> : <><div className="guide-item"><span>01</span><div><strong>リンクを貼るだけで、投稿の流れを確認。</strong><p>XのポストURLを貼り付けて「読み込む」を押します。「返信を生成」から、そのまま読み取りと作成を続けることもできます。</p></div></div><div className="guide-item"><span>02</span><div><strong>選ばなくても、自然なひと言に。</strong><p>返信の雰囲気はおまかせで、絵文字を必ず1つ以上添えます。質問を添えたいときは「あなたらしさを、もう少し」を開いて選択してください。</p></div></div><div className="guide-item"><span>03</span><div><strong>ChatGPTで内容を確認して、返信へ。</strong><p>公開版は依頼文をコピーし、ChatGPTへ貼り付けて送信します。内容理解と返信3案を確認して使ってください。サーバーにAI設定がある場合はこの画面で生成・編集・保存できます。Xへの自動投稿は行いません。</p></div></div><button className="secondary-button" onClick={() => setModal('reading')}><Link2 size={14} />リンク読み取りについて</button></>}</section></div>}
  </div>;
}
function LightbulbIcon() { return <span className="tip-spark"><Sparkles size={18} /></span>; }
export default App;
