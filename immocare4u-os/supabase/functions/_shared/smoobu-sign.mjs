// Smoobu HMAC-SHA256 signing with WebCrypto (runs in Deno/Supabase Edge and Node >= 20).
// Same algorithm as n8n/lib/smoobu-hmac.js (cross-checked in tests/edge.test.mjs).
// Spec: https://docs.smoobu.com/ → Authentication → HMAC (read 2026-11-03).

const enc = new TextEncoder();

export function rfc3986(v) {
  return encodeURIComponent(String(v)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export function canonicalQuery(query) {
  if (!query) return '';
  const pairs = [];
  for (const [k, v] of Array.isArray(query) ? query : Object.entries(query)) {
    if (v === undefined || v === null) continue;
    for (const x of Array.isArray(v) ? v : [v]) pairs.push([rfc3986(k), rfc3986(x)]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export async function sign({ method = 'GET', path, query, body = '', apiKey, apiSecret, timestamp, nonce, baseUrl = 'https://login.smoobu.com' }) {
  if (!apiKey || !apiSecret) throw new Error('Smoobu API key/secret missing');
  if (!path || !path.startsWith('/')) throw new Error('path must start with /');
  const m = String(method).toUpperCase();
  const b = body === null || body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const q = canonicalQuery(query);
  const ts = timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const n = nonce || crypto.randomUUID();
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', enc.encode(b)));
  const canonical = [m, path, q, ts, n, bodyHash, apiKey].join('\n');
  const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = b64(await crypto.subtle.sign('HMAC', key, enc.encode(canonical)));
  const headers = { 'X-API-Key': apiKey, 'X-Timestamp': ts, 'X-Nonce': n, 'X-Signature': signature, Accept: 'application/json' };
  if (b) headers['Content-Type'] = 'application/json';
  return { url: baseUrl + path + (q ? '?' + q : ''), headers, body: b, canonical };
}

// Allow-list of Smoobu operations n8n may perform through the proxy.
// OWNER DECISION 2026-11-04: Smoobu access is READ-ONLY. The apartments are live;
// nothing may be written, added or sent. Write routes are deliberately absent —
// re-adding one requires a code change, review and redeploy (not just a flag).
export const ROUTES = [
  { method: 'GET', re: /^\/api\/apartments(\/\d+)?$/ },
  { method: 'GET', re: /^\/api\/reservations(\/\d+)?$/ },
  { method: 'GET', re: /^\/api\/reservations\/\d+\/messages$/ },
  { method: 'GET', re: /^\/api\/threads$/ },
  { method: 'GET', re: /^\/api\/users\/webhooks(\/\d+)?$/ },
];

export function routeAllowed(method, path, flags = {}) {
  const r = ROUTES.find((x) => x.method === String(method).toUpperCase() && x.re.test(path));
  if (!r) return { ok: false, reason: 'route not allowed' };
  if (r.flag && flags[r.flag] !== 'true') return { ok: false, reason: `${r.flag} is not enabled` };
  return { ok: true };
}

export function safeEqual(a, b) {
  const x = enc.encode(String(a || '')), y = enc.encode(String(b || ''));
  if (y.length < 32 || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
