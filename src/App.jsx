import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Check, ChevronDown, ChevronRight, CircleHelp, Copy, Feather, Leaf, Lightbulb, Menu, MessageCircle, MessageSquare, Plus, RefreshCw, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { countText, generateLocal } from './generator.js';

const STANDALONE = globalThis.__KOTOBA_STANDALONE__ === true;
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const SAMPLE = '発信を続けるコツは、毎回「すごいこと」を書こうとしないこと。\n今日気づいたこと、失敗して学んだこと、誰かに伝えたい小さな発見。\nその積み重ねが、その人らしい発信になる。完璧な1本より、等身大の10本。';
const TONES = [{ id: 'natural', name: '自然で丁寧' }, { id: 'warm', name: 'やわらかめ' }, { id: 'brief', name: '短く端的' }];
const DIRECTIONS = [{ id: 'insight', name: '気づきを伝える', icon: Lightbulb }, { id: 'action', name: '試してみたい', icon: Leaf }, { id: 'question', name: '質問を添える', icon: MessageCircle }];
const KIND = { insight: '気づき・共感', action: '実践への一歩', question: '会話のきっかけ' };

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function ReplyIllustration() {
  return <svg className="reply-illustration" viewBox="0 0 260 178" fill="none" aria-hidden="true">
    <ellipse cx="133" cy="152" rx="84" ry="10" fill="#e8e9df" />
    <path d="M58 44a12 12 0 0 1 12-12h108a12 12 0 0 1 12 12v65a12 12 0 0 1-12 12h-58l-24 20v-20H70a12 12 0 0 1-12-12z" fill="#fff" stroke="#d4d9c9" strokeWidth="1.7" transform="rotate(-7 124 86)" />
    <path d="M84 58h75M84 73h58M84 88h36" stroke="#d7ddcd" strokeWidth="5" strokeLinecap="round" transform="rotate(-7 124 86)" />
    <path d="M123 88a10 10 0 0 1 10-10h67a10 10 0 0 1 10 10v43a10 10 0 0 1-10 10h-8v13l-18-13h-41a10 10 0 0 1-10-10z" fill="#65754d" transform="rotate(7 167 114)" />
    <path d="m144 109 9 9 22-22" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M211 62c-14-22 4-32 12-30 4 13 0 24-12 30Zm0 0c2-16-14-21-20-17-1 11 8 16 20 17Z" fill="#b6c3a0" />
    <path d="m211 62-7 16" stroke="#b6c3a0" strokeWidth="2" />
    <path d="m42 91 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#bdc9aa" />
    <circle cx="191" cy="26" r="3" fill="#c6cebb" />
  </svg>;
}

function ReplyCard({ reply, index, archive = false, saved, copied, onCopy, onSave, onDelete, onEdit }) {
  const isSaved = saved.some(item => item.text === reply.text);
  const over = countText(reply.text) > 280;
  return <article className={`reply-card ${index === 0 && !archive ? 'recommended-card' : ''}`}>
    <div className="reply-card-top"><span className={`kind-tag ${reply.kind}`}><span className="tag-dot" />{KIND[reply.kind] || KIND.insight}</span>{index === 0 && !archive && <span className="recommend"><Sparkles size={11} /> おすすめ</span>}<span className="card-number">0{index + 1}</span></div>
    <h3>{reply.title}</h3>
    {archive ? <p className="saved-text">{reply.text}</p> : <textarea className="reply-editor" aria-label={`案${index + 1}の本文`} value={reply.text} maxLength={1000} rows={Math.max(3, Math.ceil(reply.text.length / 24))} onChange={event => onEdit(reply.id, event.target.value)} />}
    {!archive && <p className="reply-note"><Lightbulb size={12} />{reply.note}</p>}
    {archive && <details className="source-details"><summary>元の投稿を見る</summary><p>{reply.post}</p></details>}
    <div className="reply-card-footer"><span className={over ? 'text-count over' : 'text-count'}>{countText(reply.text)}<span> / 280</span></span><div className="card-actions">
      <button type="button" className={`icon-button save-button ${isSaved ? 'is-saved' : ''}`} aria-label={archive ? '保存を削除' : isSaved ? `案${index + 1}の保存を解除` : `案${index + 1}を保存`} title={archive ? '保存を削除' : '保存'} onClick={() => archive ? onDelete(reply.id) : onSave(reply)}>{archive ? <Trash2 size={15} /> : <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />}</button>
      <button type="button" className={`copy-button ${copied === reply.id ? 'copied' : ''}`} disabled={over || !reply.text.trim()} onClick={() => onCopy(reply)}>{copied === reply.id ? <Check size={13} /> : <Copy size={13} />}{copied === reply.id ? 'コピー済み' : 'コピー'}</button>
    </div></div>
    {over && <p className="field-error">Xの文字数上限を超えています。280以内に整えてください。</p>}
  </article>;
}


function App() {
  const initialPrefs = useRef(readStorage('kotoba-preferences', {}));
  const [page, setPage] = useState('create');
  const [post, setPost] = useState('');
  const [author, setAuthor] = useState('');
  const [thought, setThought] = useState('');
  const [tone, setTone] = useState(initialPrefs.current.tone || 'natural');
  const [length, setLength] = useState(initialPrefs.current.length || 'medium');
  const [emoji, setEmoji] = useState(initialPrefs.current.emoji || false);
  const [directions, setDirections] = useState(['insight', 'action']);
  const [replies, setReplies] = useState([]);
  const [saved, setSaved] = useState(() => {
    const items = readStorage('kotoba-saved', []);
    return Array.isArray(items) ? items.filter(item => item && typeof item.text === 'string' && typeof item.title === 'string' && typeof item.id === 'string') : [];
  });
  const [mode, setMode] = useState(null);
  const [resultMode, setResultMode] = useState('local');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [filter, setFilter] = useState('');
  const [snapshot, setSnapshot] = useState('');
  const [variation, setVariation] = useState(0);
  const resultRef = useRef(null);
  const postRef = useRef(null);
  const requestRef = useRef(null);
  const modalRef = useRef(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (STANDALONE) { setMode('local'); return; }
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setMode(data.mode)).catch(error => { if (error.name !== 'AbortError') setMode('unavailable'); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timeout);
  }, [copied]);
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

  function navigate(next) { setPage(next); setMobileMenu(false); }
  function persistSaved(items) {
    try { localStorage.setItem('kotoba-saved', JSON.stringify(items)); setSaved(items); return true; }
    catch { setToast('保存できませんでした。ブラウザの保存容量・設定をご確認ください。'); return false; }
  }
  function toggleSave(reply) {
    const existing = saved.find(item => item.text === reply.text);
    const next = existing ? saved.filter(item => item.id !== existing.id) : [{ ...reply, id: uniqueId(), post: snapshot, createdAt: new Date().toISOString(), mode: resultMode }, ...saved];
    if (persistSaved(next)) setToast(existing ? '保存を解除しました' : 'リプライを保存しました');
  }
  async function copy(reply) {
    try {
      try { await navigator.clipboard.writeText(reply.text); }
      catch {
        const previous = document.activeElement;
        const input = document.createElement('textarea');
        input.value = reply.text;
        input.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.append(input);
        let success;
        try { input.select(); success = document.execCommand('copy'); }
        finally { input.remove(); previous?.focus(); }
        if (!success) throw new Error('Copy unavailable');
      }
      setCopied(reply.id); setToast('コピーしました。投稿前にあなたの言葉で確認しましょう。');
    }
    catch { setToast('コピーできませんでした。本文を選択してコピーしてください。'); }
  }
  function deleteReply(id) { if (persistSaved(saved.filter(item => item.id !== id))) setToast('保存を削除しました'); }
  function editReply(id, text) { setReplies(items => items.map(item => item.id === id ? { ...item, text } : item)); }
  const cardProps = { saved, copied, onCopy: copy, onSave: toggleSave, onDelete: deleteReply, onEdit: editReply };
  function inputData() { return { post, author, thought, tone, length, emoji, directions }; }
  async function generate(event) {
    event?.preventDefault();
    if (busy) return;
    if (!post.trim()) { setError('リプライしたい投稿の本文を入力してください。'); postRef.current?.focus(); return; }
    setError(''); setBusy(true);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    const requestedPost = post;
    try {
      let data;
      if (STANDALONE) {
        data = generateLocal({ ...inputData(), variation });
      } else {
        const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...inputData(), variation }), signal: controller.signal });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || '作成できませんでした。');
      }
      if (!Array.isArray(data.replies) || data.replies.length !== 3) throw new Error('案を読み取れませんでした。もう一度お試しください。');
      setReplies(data.replies.map(reply => ({ ...reply, id: uniqueId() })));
      setResultMode(data.mode); setSnapshot(requestedPost); setVariation(v => v + 1);
      if (window.innerWidth < 1100) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) { setError(error.name === 'AbortError' ? '接続がタイムアウトしました。もう一度お試しください。' : error.message || 'サーバーに接続できませんでした。起動状況を確認してください。'); }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  function useSample() { setPost(SAMPLE); setError(''); postRef.current?.focus(); }
  function savePreferences() {
    try { localStorage.setItem('kotoba-preferences', JSON.stringify({ tone, length, emoji })); setModal(null); setToast('いつもの文体を保存しました'); }
    catch { setToast('設定を保存できませんでした。ブラウザの保存設定をご確認ください。'); }
  }

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-backdrop" onClick={() => setMobileMenu(false)} aria-label="メニューを閉じる" />}
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('create'); }}><span className="brand-symbol"><MessageSquare size={21} strokeWidth={1.7} /><span /></span><span>kotoba<span className="brand-period">.</span></span></a>
      <div className="brand-subtitle">ことばで、つながる。</div>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="メインメニュー">
        <button className={`nav-item ${page === 'create' ? 'active' : ''}`} onClick={() => navigate('create')}><Feather size={18} /><span>リプライをつくる</span><ChevronRight size={14} /></button>
        <button className={`nav-item ${page === 'saved' ? 'active' : ''}`} onClick={() => navigate('saved')}><Bookmark size={17} /><span>保存したリプライ</span>{saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>
      </nav>
      <div className="sidebar-divider" />
      <button className="nav-item guide-nav" onClick={() => { setModal('guide'); setMobileMenu(false); }}><CircleHelp size={17} /><span>使い方のヒント</span><span className="tiny-arrow">↗</span></button>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><span className="note-leaf"><Leaf size={19} strokeWidth={1.4} /></span><p>大きなつながりも、<br />小さなひと言から。</p><span>あなたらしい会話を、少しずつ。</span></div>
        <button className="preferences" onClick={() => setModal('preferences')}><span className="profile-avatar">H<span /></span><span><strong>あなたのワークスペース</strong><small>いつもの文体を設定</small></span><Settings2 size={15} /></button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="メニューを開く"><Menu size={21} /></button><span className="breadcrumb">ワークスペース</span><ChevronRight size={13} /><span className="current-crumb">{page === 'create' ? 'リプライをつくる' : '保存したリプライ'}</span></div><button className="topbar-help" onClick={() => setModal('guide')}><CircleHelp size={15} /><span>使い方ガイド</span></button></header>
      <main>
        <section className="hero"><div><div className="eyebrow"><span /> MAKE A LITTLE CONNECTION</div><h1>{page === 'create' ? <>会話がはじまる、<br className="mobile-break" />あなたらしいリプライを<span className="olive-period">。</span></> : <>とっておきの言葉を、<br className="mobile-break" />ここに<span className="olive-period">。</span></>}</h1><p>{page === 'create' ? '「勉強になります」の、その先へ。小さな気づきを、つながる言葉に。' : '保存したリプライを見返して、あなたらしい言葉の引き出しに。'}</p></div><span className="hero-decoration" aria-hidden="true"><Feather size={38} strokeWidth={1} /><span>words connect us</span></span></section>
        {page === 'create' ? <>
          <div className="workflow"><span><b>01</b> 投稿を貼り付ける</span><span className="workflow-line" /><span><b>02</b> ニュアンスを選ぶ</span><span className="workflow-line" /><span><b>03</b> あなたの言葉に整える</span></div>
          <div className="studio-grid">
            <form className="compose-panel" onSubmit={generate}>
              <div className="panel-heading"><div><span className="section-icon"><MessageSquare size={17} /></span><h2>リプライのもと</h2></div><span className="step-label">STEP 01 — 02</span></div>
              <div className="compose-body">
                <div className="field-title"><label htmlFor="post">相手の投稿</label><span className="required">必須</span><button type="button" className="sample-button" onClick={useSample} disabled={busy}><Sparkles size={12} />サンプルを入れる</button></div>
                <div className={`post-input-wrap ${error && !post.trim() ? 'invalid' : ''}`}><textarea id="post" ref={postRef} value={post} onChange={event => { setPost(event.target.value); setError(''); }} maxLength={5000} placeholder={'リプライしたいXの投稿を、ここに貼り付けてください。\n\n気になったノウハウや、心に残った言葉など。'} disabled={busy} /><div className="post-input-footer"><span><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l8.2-9.4L.8 2h6.5l4.5 6.8L18.9 2ZM17.8 20h1.7L6.3 3.9H4.5L17.8 20Z" /></svg>投稿の本文を入力してください</span><span>{post.length.toLocaleString()} / 5,000</span></div></div>
                <div className="author-row"><label htmlFor="author">投稿者のお名前<span>任意</span></label><input id="author" value={author} maxLength={80} onChange={event => setAuthor(event.target.value)} placeholder="例：ヒロさん" disabled={busy} /></div>
                <div className="form-divider" />
                <fieldset disabled={busy}><legend><span className="field-label">どんな雰囲気で伝える？</span></legend><div className="tone-options">{TONES.map(item => <button type="button" key={item.id} className={tone === item.id ? 'selected' : ''} aria-pressed={tone === item.id} onClick={() => setTone(item.id)}>{tone === item.id && <Check size={13} />}{item.name}</button>)}</div></fieldset>
                <fieldset className="direction-field" disabled={busy}><legend><span className="field-label">伝えたいこと</span><span className="optional-label">複数選択OK</span></legend><div className="direction-options">{DIRECTIONS.map(({ id, name, icon: Icon }) => <button type="button" key={id} className={directions.includes(id) ? 'selected' : ''} aria-pressed={directions.includes(id)} onClick={() => setDirections(items => items.includes(id) ? items.length > 1 ? items.filter(item => item !== id) : items : [...items, id])}><Icon size={13} />{name}{directions.includes(id) ? <Check size={11} /> : <Plus size={11} />}</button>)}</div></fieldset>
                <div className="thought-field"><label htmlFor="thought">あなたの気づき・試したいこと<span className="optional-label">任意</span></label><textarea id="thought" value={thought} maxLength={300} onChange={event => setThought(event.target.value)} placeholder="例：まずは今日の小さな気づきから発信してみたい" rows={2} disabled={busy} /><p>ひと言添えると、もっとあなたらしく。</p></div>
                <div className="fine-options"><label htmlFor="length">文章の長さ <span className="select-wrap"><select id="length" aria-label="文章の長さ" value={length} onChange={event => setLength(event.target.value)} disabled={busy}><option value="short">短め</option><option value="medium">ほどよく</option><option value="long">しっかり</option></select><ChevronDown size={12} /></span></label><label className="emoji-toggle"><input type="checkbox" checked={emoji} onChange={event => setEmoji(event.target.checked)} disabled={busy} /><span className="toggle-track"><span /></span>絵文字を添える</label></div>
                {error && <p className="form-error" role="alert"><CircleHelp size={15} />{error}</p>}
                <button className="generate-button" type="submit" disabled={busy}><Sparkles size={17} className={busy ? 'spinning' : ''} />{busy ? '言葉を整えています…' : replies.length ? 'もう一度、リプライ案をつくる' : 'リプライ案をつくる'}{!busy && <ArrowRight size={17} />}</button>
                <p className="generation-mode"><span className={`status-dot ${mode === 'unavailable' ? 'offline' : ''}`} />{mode === 'ai' ? 'AIで、投稿の文脈に合わせて3案作成' : mode === 'local' ? 'APIキー不要 · 文章パターンから3案作成' : mode === 'unavailable' ? 'サーバーに接続できません。起動状況をご確認ください。' : '接続を確認しています…'}<button type="button" aria-label="生成方法について" onClick={() => setModal('about')}><CircleHelp size={12} /></button></p>
              </div>
            </form>
            <section className="results-panel" ref={resultRef} aria-busy={busy} aria-label="リプライの候補">
              <div className="results-heading"><div><span className="section-icon"><Sparkles size={17} /></span><h2>あなたのリプライ案</h2>{replies.length > 0 && <span className="result-count">3</span>}</div><span className="step-label">STEP 03</span></div>
              {replies.length === 0 ? <div className={`empty-results ${busy ? 'is-loading' : ''}`}><ReplyIllustration /><span className="empty-eyebrow">A GOOD CONVERSATION STARTS HERE</span><h3>{busy ? 'あなたの気づきを、言葉に。' : 'その気づきが、会話のはじまり。'}</h3><p>{busy ? <>投稿を読み取り、3つの角度から<br />リプライを整えています。</> : <>相手の投稿を入れて、ボタンを押すと<br />ニュアンスの異なる3つの案が届きます。</>}</p><div className="empty-tags"><span><Lightbulb size={12} /> 具体的な気づき</span><span><Leaf size={12} /> 自然なひと言</span><span><MessageCircle size={12} /> 返しやすさ</span></div><div className="empty-guide"><span>ちょっとしたコツ</span><p>うまい言葉より、「どこに心が動いたか」。<br />あなたが感じたことを、ひとつ添えてみてください。</p></div></div> : <div className={`reply-list ${busy ? 'refreshing' : ''}`}><p className="results-intro">{resultMode === 'ai' ? '投稿に合わせた3案です。' : '投稿の言葉を拾った、文章パターンによる3案です。'}<br />気に入った案を、あなたの言葉に整えてみてください。</p>{replies.map((reply, index) => <ReplyCard {...cardProps} key={reply.id} reply={reply} index={index} />)}<button className="regenerate-button" onClick={generate} disabled={busy}><RefreshCw size={13} className={busy ? 'spinning' : ''} />{busy ? '別の表現を考えています…' : '別の表現でもう一度つくる'}</button></div>}
              <div className="gentle-reminder"><span><Leaf size={14} /></span><p>返事をもらうことより、まずは誠実なひと言を。<br /><strong>送る前に、あなた自身の気持ちに合っているか確認しましょう。</strong></p></div>
            </section>
          </div>
          <div className="bottom-note"><span><MessageCircle size={15} /></span><p><strong>つながりは、一通のリプライから。</strong> 相手へのリスペクトと、あなたらしいひと言を大切に。</p><span className="bottom-flower" aria-hidden="true">✳</span></div>
        </> : <section className="saved-panel"><div className="saved-toolbar"><h2>保存したリプライ <span>{saved.length}</span></h2><input aria-label="保存したリプライを検索" value={filter} onChange={event => setFilter(event.target.value)} placeholder="言葉で検索する…" /></div>{saved.length === 0 ? <div className="archive-empty"><Bookmark size={32} strokeWidth={1} /><h3>残しておきたい言葉を、ここに。</h3><p>リプライ案のしおりマークを押すと保存できます。</p><button className="secondary-button" onClick={() => navigate('create')}><Plus size={15} />リプライをつくる</button></div> : <div className="saved-grid">{saved.filter(reply => (reply.text + reply.title + reply.post).includes(filter)).map((reply, index) => <ReplyCard {...cardProps} key={reply.id} reply={reply} index={index} archive />)}{saved.filter(reply => (reply.text + reply.title + reply.post).includes(filter)).length === 0 && <p className="no-results">この言葉を含むリプライはありません。</p>}</div>}<p className="storage-note">保存先はこのブラウザです。ブラウザのデータを削除すると、保存した内容も削除されます。</p></section>}
        <footer className="page-footer"><span>kotoba<span className="olive-period">.</span></span><p>ひと言に、あなたらしさを。</p><span>MADE FOR MEANINGFUL CONNECTIONS</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {modal && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={modalRef}><button className="modal-close icon-button" aria-label="閉じる" onClick={() => setModal(null)}><X size={20} /></button><span className="modal-icon">{modal === 'preferences' ? <Settings2 size={22} /> : modal === 'about' ? <Sparkles size={23} /> : <Leaf size={24} />}</span><h2 id="modal-title">{modal === 'preferences' ? 'いつもの文体を、覚えておく。' : modal === 'about' ? 'リプライ案のつくり方' : '心が伝わる、ひと言のヒント。'}</h2>{modal === 'preferences' ? <><p className="modal-description">次に開いたときも、この雰囲気で始められます。</p><label className="modal-label">いつもの雰囲気<select value={tone} onChange={event => setTone(event.target.value)}>{TONES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="modal-label">文章の長さ<select value={length} onChange={event => setLength(event.target.value)}><option value="short">短め</option><option value="medium">ほどよく</option><option value="long">しっかり</option></select></label><label className="modal-checkbox"><input type="checkbox" checked={emoji} onChange={event => setEmoji(event.target.checked)} />絵文字を添える</label><button className="generate-button" onClick={savePreferences}><Check size={16} />この文体を保存する</button></> : modal === 'about' ? <><div className="guide-item"><strong>文章パターンモード（標準）</strong><p>投稿から拾った言葉と、あらかじめ用意した表現を組み合わせます。APIキー不要で、生成時に外部のAIへ投稿を送信しません。文脈に合うか、送る前に確認してください。</p></div><div className="guide-item"><strong>AIモード（任意設定）</strong><p>サーバーに REPLY_API_KEY を設定すると、OpenAIで文脈に合わせて作成します。投稿と入力内容がOpenAIに送信され、APIの利用料金がかかります。設定手順はREADMEをご確認ください。</p></div><div className="privacy-note">Xへの自動投稿や、投稿URLの自動読み取りは行いません。本文を貼り付け、コピーしてご利用ください。</div></> : <><div className="guide-item"><span>01</span><div><strong>投稿の、ひとつの言葉に目を留める。</strong><p>「勉強になります」だけでなく、どの視点が響いたのかを添えると、読んだことが伝わります。</p></div></div><div className="guide-item"><span>02</span><div><strong>経験を盛らず、これからを伝える。</strong><p>「実践して成果が出ました」ではなく、「まずこれを意識してみたいです」。今の自分の言葉で十分です。</p></div></div><div className="guide-item"><span>03</span><div><strong>質問するなら、答えやすいものをひとつ。</strong><p>投稿にすでに書かれていることは聞かず、実践の一歩について尋ねてみましょう。質問を添えない案も選べます。</p></div></div><div className="privacy-note">返信を保証するものではありません。相手への敬意と、無理のない会話のペースを大切に。</div></>}</section></div>}
  </div>;
}

export default App;
