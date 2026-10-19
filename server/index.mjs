import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLocal, validateInput } from '../src/generator.js';
import { generateAI } from './ai.mjs';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const apiKey = process.env.REPLY_API_KEY;
const model = process.env.REPLY_MODEL || 'gpt-4.1-mini';
const mode = apiKey ? 'ai' : 'local';
const rates = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return json(res, 400, { error: 'リクエストを確認してください。' }); }
  if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', mode });
  if (pathname === '/api/generate' && req.method === 'POST') {
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'この画面からもう一度お試しください。' });
      } catch { return json(res, 403, { error: '接続元を確認してください。' }); }
    }
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON形式で送信してください。' });
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 400000) return json(res, 413, { error: '入力が長すぎます。' });
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let input;
      try { input = validateInput(JSON.parse(raw)); } catch (error) { return json(res, 400, { error: error instanceof SyntaxError ? '入力の形式を確認してください。' : error.message }); }
      if (apiKey) {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        const recent = (rates.get(key) || []).filter(t => now - t < 60000);
        if (recent.length >= 10) return json(res, 429, { error: '続けて作成する場合は、1分ほどお待ちください。' });
        rates.set(key, [...recent, now]);
      }
      return json(res, 200, apiKey ? await generateAI(input, { apiKey, model }) : generateLocal(input));
    } catch (error) {
      return json(res, 502, { error: error.name === 'TimeoutError' ? 'AIの応答に時間がかかっています。もう一度お試しください。' : error.message || '作成できませんでした。もう一度お試しください。' });
    }
  }
  if (pathname.startsWith('/api/')) return json(res, 404, { error: '該当する機能がありません。' });
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'この操作には対応していません。' });
  const target = resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + sep)) return json(res, 403, { error: 'アクセスできません。' });
  try {
    const path = pathname === '/' ? resolve(root, 'index.html') : target;
    const file = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch { json(res, 404, { error: 'ページが見つかりません。先に npm run build を実行してください。' }); }
});

server.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log(`kotoba server started (${mode} mode)`));
