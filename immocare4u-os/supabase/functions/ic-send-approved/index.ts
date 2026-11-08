// ic-send-approved — the ONLY path that writes guest messages to Smoobu.
// Owner decision 08.11.2026: during the trial, a reply may be sent to the guest only after
// the manager explicitly pressed "Approve & send". Automatic (level 6) replies are NOT sent.
//
// POST {"approval_code": "AP-XXXXX", "link_token": "<64 hex>"}   header x-ic-proxy-token
// The text is read from the database (approvals.final_text), never from the request,
// so n8n cannot send arbitrary content. Each approval is sent at most once.
import postgres from 'npm:postgres@3.4.4';
import { sign, safeEqual } from '../_shared/smoobu-sign.mjs';

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!safeEqual(req.headers.get('x-ic-proxy-token'), Deno.env.get('IC_PROXY_TOKEN'))) return json(401, { error: 'unauthorized' });
  let b: { approval_code?: string; link_token?: string };
  try { b = await req.json(); } catch { return json(400, { error: 'invalid json' }); }
  const code = String(b.approval_code || ''), token = String(b.link_token || '');
  if (!/^AP-[A-Z0-9]{5}$/.test(code) || !/^[0-9a-f]{64}$/.test(token)) return json(200, { sent: false, reason: 'invalid request' });

  const rows = await sql`
    SELECT a.status::text AS astatus, a.subject_type, a.final_text, o.outbound_id, o.status::text AS ostatus,
           o.reservation_id, o.property_id, r.status AS rstatus, r.departure::text AS departure,
           (now() AT TIME ZONE 'Europe/Berlin')::date::text AS today
    FROM ic.approvals a
    JOIN ic.outbound_messages o ON o.outbound_id = a.outbound_id
    JOIN ic.reservations r ON r.reservation_id = o.reservation_id AND r.property_id = o.property_id
    WHERE a.approval_code = ${code} AND a.link_token = ${token}`;
  const r = rows[0];
  if (!r) return json(200, { sent: false, reason: 'approval not found' });
  if (r.astatus !== 'APPROVED') return json(200, { sent: false, reason: 'not approved (' + r.astatus + ')' });
  if (r.subject_type !== 'GUEST_REPLY') return json(200, { sent: false, reason: 'not a guest reply' });
  if (r.ostatus === 'SENT') return json(200, { sent: true, already: true });
  if (!['CONFIRMED', 'MODIFIED'].includes(r.rstatus)) return json(200, { sent: false, reason: 'reservation ' + r.rstatus });
  if (r.today > r.departure) return json(200, { sent: false, reason: 'stay already ended' });
  const text = String(r.final_text || '').trim();
  if (!text || text.length > 4000) return json(200, { sent: false, reason: 'empty or too long text' });
  if (/(code|pin|passwort|password|safe|box)[^\n]{0,40}\b\d{3,8}\b/i.test(text)) return json(200, { sent: false, reason: 'text contains a code – blocked' });

  // claim exactly once
  const claimed = await sql`UPDATE ic.outbound_messages SET status = 'QUEUED', origin = 'AI_APPROVED', attempts = attempts + 1
    WHERE outbound_id = ${r.outbound_id} AND status = 'DRAFT' RETURNING outbound_id`;
  if (!claimed.length) return json(200, { sent: false, reason: 'already being processed' });

  const body = JSON.stringify({ subject: 'ImmoCare4U', messageBody: text });
  const s = await sign({ method: 'POST', path: '/api/reservations/' + r.reservation_id + '/messages/send-message-to-guest', body,
                         apiKey: Deno.env.get('SMOOBU_API_KEY'), apiSecret: Deno.env.get('SMOOBU_API_SECRET') });
  const res = await fetch(s.url, { method: 'POST', headers: s.headers, body: s.body });
  const resText = await res.text();
  const ok = res.status >= 200 && res.status < 300;
  await sql`UPDATE ic.outbound_messages SET status = ${ok ? 'SENT' : 'FAILED'}::ic.outbound_status,
              sent_at = ${ok ? sql`now()` : null}, test_mode = false,
              smoobu_response = ${sql.json({ status: res.status, body: resText.slice(0, 2000) })}
            WHERE outbound_id = ${r.outbound_id}`;
  await sql`INSERT INTO ic.audit_log (actor, action, entity, entity_id, details)
            VALUES ('edge:ic-send-approved', ${ok ? 'GUEST_MESSAGE_SENT' : 'GUEST_MESSAGE_FAILED'}, 'approval', ${code},
                    ${sql.json({ reservation_id: r.reservation_id, http: res.status })})`;
  return json(200, { sent: ok, reason: ok ? 'sent via Smoobu' : 'Smoobu HTTP ' + res.status, smoobu_status: res.status });
});
