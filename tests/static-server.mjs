// Minimal static server for local preview and tests. Applies the headers from _headers
// (including the Content-Security-Policy) so CSP problems show up before deploying.
//   node tests/static-server.mjs            -> http://localhost:4173
//   EXTRA_CONNECT_SRC=http://localhost:54329 node tests/static-server.mjs   (tests: allow the mock API)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('../public', import.meta.url).pathname);
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};

// Parse _headers: "/path/*" lines followed by indented "Name: value" lines
async function loadHeaders() {
  const rules = [];
  let current = null;
  for (const line of (await readFile(join(ROOT, '_headers'), 'utf8')).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { current = { pattern: line.trim(), headers: {} }; rules.push(current); continue; }
    const i = line.indexOf(':');
    if (current && i > 0) current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}
const matches = (pattern, path) => pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;

const rules = await loadHeaders();
const extra = process.env.EXTRA_CONNECT_SRC;

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) file = null;

  let status = 200;
  try {
    if (!file || !(await stat(file)).isFile()) throw new Error();
  } catch {
    status = 404; file = join(ROOT, '404.html');
  }
  const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
  for (const r of rules) if (matches(r.pattern, path)) Object.assign(headers, r.headers);
  if (extra && headers['Content-Security-Policy']) {
    headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace('connect-src', `connect-src ${extra}`);
  }
  res.writeHead(status, headers);
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`VANA site on http://localhost:${PORT}`));
