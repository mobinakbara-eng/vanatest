// TEMPORARY upload helper (deployed only while uploading entrance videos, then deleted).
// POST ?path=P-BER-001/eingang.mp4  body: mp4 bytes  header x-ic-proxy-token
import { safeEqual } from '../_shared/smoobu-sign.mjs';
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  if (!safeEqual(req.headers.get('x-ic-proxy-token'), Deno.env.get('IC_PROXY_TOKEN'))) return new Response('unauthorized', { status: 401 });
  const path = new URL(req.url).searchParams.get('path') || '';
  if (!/^P-[A-Z]{3}-\d{3}\/eingang\.mp4$/.test(path)) return new Response('bad path', { status: 400 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length < 1000 || body.length > 15 * 1024 * 1024) return new Response('bad size', { status: 400 });
  const res = await fetch(Deno.env.get('SUPABASE_URL') + '/storage/v1/object/guest-media/' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
    body,
  });
  return new Response(JSON.stringify({ status: res.status, body: await res.text(), bytes: body.length }), { headers: { 'Content-Type': 'application/json' } });
});
