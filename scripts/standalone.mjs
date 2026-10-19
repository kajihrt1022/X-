import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const output = resolve(process.argv[2] || 'exports/kotoba.html');
const result = await build({
  stdin: {
    contents: "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './src/App.jsx'; createRoot(document.getElementById('root')).render(React.createElement(App));",
    resolveDir: root.pathname,
    loader: 'jsx',
  },
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
});
// System fonts keep the portable edition small and independent of all networks.
const css = (await readFile(new URL('src/style.css', root), 'utf8')).replace(/^@import[^;]+;\s*/gm, '');
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#5b6745"><title>kotoba — リプライ作成ツール</title><style>${css}</style></head><body><div id="root"></div><script>globalThis.__KOTOBA_STANDALONE__=true;</script><script>${js}</script></body></html>`;
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, html);
console.log(`Standalone HTML saved: ${output} (${Buffer.byteLength(html)} bytes)`);
