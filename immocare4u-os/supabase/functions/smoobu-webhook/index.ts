// smoobu-webhook — public entry point registered in Smoobu as the webhook URL:
//   https://<ref>.supabase.co/functions/v1/smoobu-webhook?token=<SMOOBU_WEBHOOK_TOKEN>
// Smoobu does not document signed webhook deliveries, so we check a secret URL token,
// then forward the raw body to the n8n webhook (WF-02) with a second secret header that
// the n8n Webhook node checks via its Header Auth credential "IC Webhook Gate".
// Secrets: SMOOBU_WEBHOOK_TOKEN, IC_N8N_WEBHOOK_URL, IC_N8N_WEBHOOK_TOKEN
import { safeEqual } from '../_shared/smoobu-sign.mjs';

const MAX_BODY = 256 * 1024;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  if (!safeEqual(url.searchParams.get('token'), Deno.env.get('SMOOBU_WEBHOOK_TOKEN'))) return new Response('unauthorized', { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response('payload too large', { status: 413 });
  try { JSON.parse(raw); } catch { return new Response('invalid json', { status: 400 }); }

  const target = Deno.env.get('IC_N8N_WEBHOOK_URL');
  if (!target) return new Response('not configured', { status: 503 });
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ic-webhook-token': Deno.env.get('IC_N8N_WEBHOOK_TOKEN') ?? '' },
    body: raw,
  });
  // Non-2xx makes Smoobu retry (REQ-VERIFY: Smoobu retry policy); WF-02 inbox is idempotent.
  return new Response(res.ok ? 'ok' : 'upstream error', { status: res.ok ? 200 : 502 });
});
