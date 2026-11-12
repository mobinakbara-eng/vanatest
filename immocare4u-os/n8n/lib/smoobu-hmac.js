/**
 * Smoobu API HMAC-SHA256 request signing.
 *
 * Source: https://docs.smoobu.com/ (Authentication → HMAC), read 2026-11-03.
 *   Headers: X-API-Key, X-Timestamp (ISO-8601 UTC, ±5 min), X-Nonce (UUID v4, never reused),
 *            X-Signature = base64(HMAC_SHA256(apiSecret, canonical))
 *   canonical = METHOD \n PATH \n SORTED_QUERY \n TIMESTAMP \n NONCE \n BODY_SHA256_HEX \n API_KEY
 *   Query keys/values RFC 3986 encoded (space → %20), sorted alphabetically.
 *   The legacy `Api-Key` header is deprecated (end-of-life 2026-10-31 according to the docs).
 *
 * Status: REQUIRES_VERIFICATION — unit-tested against the documented algorithm,
 * not yet against the live API with a real key.
 *
 * Runs in Node.js and inside an n8n Code node (needs NODE_FUNCTION_ALLOW_BUILTIN=crypto).
 */

function smoobuRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** query: object {k: v | v[]} or array of [k, v]. Returns "a=1&b=2" (sorted by key, then value). */
function smoobuCanonicalQuery(query) {
  if (!query) return '';
  const pairs = [];
  const entries = Array.isArray(query) ? query : Object.entries(query);
  for (const [k, v] of entries) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => pairs.push([smoobuRfc3986(k), smoobuRfc3986(x)]));
    else pairs.push([smoobuRfc3986(k), smoobuRfc3986(v)]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

function smoobuTimestamp(date) {
  return (date || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {object} o
 * @param {string} o.method   GET|POST|PUT|PATCH|DELETE
 * @param {string} o.path     must include /api prefix, e.g. /api/reservations/123/messages
 * @param {object|Array} [o.query]
 * @param {string|object} [o.body]  serialised exactly as it will be sent
 * @param {string} o.apiKey
 * @param {string} o.apiSecret
 * @param {object} o.crypto   Node crypto module
 * @param {string} [o.timestamp] override for tests
 * @param {string} [o.nonce]     override for tests
 * @returns {{url:string, headers:object, body:string, canonical:string}}
 */
function smoobuSign(o) {
  const crypto = o.crypto;
  if (!o.apiKey || !o.apiSecret) throw new Error('Smoobu API key/secret missing');
  if (!o.path || !o.path.startsWith('/')) throw new Error('path must start with /');
  const method = String(o.method || 'GET').toUpperCase();
  const body = o.body === undefined || o.body === null ? ''
    : typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
  const query = smoobuCanonicalQuery(o.query);
  const timestamp = o.timestamp || smoobuTimestamp();
  const nonce = o.nonce || crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const canonical = [method, o.path, query, timestamp, nonce, bodyHash, o.apiKey].join('\n');
  const signature = crypto.createHmac('sha256', o.apiSecret).update(canonical, 'utf8').digest('base64');
  const headers = {
    'X-API-Key': o.apiKey,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
    'Accept': 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const base = o.baseUrl || 'https://login.smoobu.com';
  return { url: base + o.path + (query ? '?' + query : ''), headers, body, canonical };
}

// @export-start
if (typeof module !== 'undefined') module.exports = { smoobuSign, smoobuCanonicalQuery, smoobuRfc3986, smoobuTimestamp };
// @export-end
