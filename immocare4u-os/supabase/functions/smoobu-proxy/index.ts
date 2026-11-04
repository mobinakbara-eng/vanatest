// smoobu-proxy — signs and forwards allow-listed Smoobu API calls for n8n.
// Secrets (Supabase → Edge Functions → Secrets):
//   SMOOBU_API_KEY, SMOOBU_API_SECRET   (entered by the owner, never seen by n8n or Claude)
//   IC_PROXY_TOKEN                      (shared with n8n Header Auth credential "IC Smoobu Proxy")
// READ-ONLY by owner decision (2026-11-04): only GET routes exist in the allow-list.
// Request:  POST {"method":"GET","path":"/api/reservations/123","query":{...},"body":{...}}
//           header x-ic-proxy-token: <IC_PROXY_TOKEN>
// Response: {"statusCode":200,"rateLimit":{...},"body":<smoobu json>}
import { sign, routeAllowed, safeEqual } from '../_shared/smoobu-sign.mjs';

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!safeEqual(req.headers.get('x-ic-proxy-token'), Deno.env.get('IC_PROXY_TOKEN'))) return json(401, { error: 'unauthorized' });

  let spec: { method?: string; path?: string; query?: Record<string, unknown>; body?: unknown };
  try { spec = await req.json(); } catch { return json(400, { error: 'invalid json' }); }
  const method = String(spec.method || 'GET').toUpperCase();
  const path = String(spec.path || '');
  const allowed = routeAllowed(method, path, {
    IC_ALLOW_SEND: Deno.env.get('IC_ALLOW_SEND') ?? '',
    IC_ALLOW_WEBHOOK_ADMIN: Deno.env.get('IC_ALLOW_WEBHOOK_ADMIN') ?? '',
  });
  if (!allowed.ok) return json(403, { error: allowed.reason, method, path });

  const apiKey = Deno.env.get('SMOOBU_API_KEY'), apiSecret = Deno.env.get('SMOOBU_API_SECRET');
  if (!apiKey || !apiSecret) return json(503, { error: 'SMOOBU_API_KEY / SMOOBU_API_SECRET not configured in Supabase secrets' });

  const s = await sign({ method, path, query: spec.query as Record<string, string>, body: spec.body ?? '', apiKey, apiSecret });
  const res = await fetch(s.url, { method, headers: s.headers, body: s.body || undefined });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return json(200, {
    statusCode: res.status,
    rateLimit: {
      limit: res.headers.get('x-ratelimit-limit'),
      remaining: res.headers.get('x-ratelimit-remaining'),
      retryAfter: res.headers.get('x-ratelimit-retry-after'),
    },
    body,
  });
});
