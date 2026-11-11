// ic-send-scheduled — sends ONE scheduled guest message (welcome, arrival info, key-box PIN,
// café tip, check-out reminder, review request) through Smoobu. Owner decision 11.11.2026:
// the trial is over, scheduled messages are sent for real.
//
// POST {"idempotency_key": "sched:<reservation_id>:<TEMPLATE>", "dry_run"?: true}   header x-ic-proxy-token
//   dry_run: runs every check (incl. the live Smoobu lookup) and stops before sending – health check.
//
// Safety:
//  * kill switch ic.settings LIVE_SENDING must be 'on'
//  * the text comes from the database row n8n recorded (never from the request); each row is sent once
//  * the row must be fresh (recorded < 3 h ago): nothing old is ever sent retroactively
//  * the booking is re-checked LIVE in Smoobu (exists, not cancelled/blocked, same apartment and dates)
//  * ACCESS_PIN: the PIN is read from Supabase secrets (IC_PIN_<PROPERTY>) and inserted here only;
//    it never passes through n8n, the database or any e-mail. Released only from 12:00 on arrival day
//    until departure.
//  * any unfilled placeholder or missing video link → not sent
import postgres from 'npm:postgres@3.4.4';
import { sign, safeEqual } from '../_shared/smoobu-sign.mjs';

const RELEASE_TIME = '12:00';
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
const keys = () => ({ apiKey: Deno.env.get('SMOOBU_API_KEY'), apiSecret: Deno.env.get('SMOOBU_API_SECRET') });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!safeEqual(req.headers.get('x-ic-proxy-token'), Deno.env.get('IC_PROXY_TOKEN'))) return json(401, { error: 'unauthorized' });
  let b: { idempotency_key?: string; dry_run?: boolean };
  try { b = await req.json(); } catch { return json(400, { error: 'invalid json' }); }
  const key = String(b.idempotency_key || '');
  const m = key.match(/^sched:(\d+):([A-Z0-9_]+)$/);
  if (!m) return json(200, { sent: false, reason: 'invalid request' });
  const template = m[2];
  const dry = b.dry_run === true;

  const live = await sql`SELECT value FROM ic.settings WHERE key = 'LIVE_SENDING'`;
  if (!dry && (!live[0] || live[0].value !== 'on')) return json(200, { sent: false, reason: 'live sending is off' });

  const rows = await sql`
    SELECT o.outbound_id, o.status::text AS ostatus, o.body, o.reservation_id, o.property_id,
           o.created_at > now() - interval '3 hours' AS fresh,
           r.status AS rstatus, r.arrival::text AS arrival, r.departure::text AS departure,
           p.smoobu_apartment_id::text AS apt,
           (now() AT TIME ZONE p.timezone)::date::text AS today,
           to_char(now() AT TIME ZONE p.timezone, 'HH24:MI') AS now_local
    FROM ic.outbound_messages o
    JOIN ic.reservations r ON r.reservation_id = o.reservation_id AND r.property_id = o.property_id
    JOIN ic.properties p ON p.property_id = o.property_id
    WHERE o.idempotency_key = ${key} AND o.origin = 'SCHEDULED' AND o.reservation_id = ${Number(m[1])}`;
  const r = rows[0];
  if (!r) return json(200, { sent: false, reason: 'not found' });
  if (r.ostatus === 'SENT') return json(200, { sent: true, already: true });
  if (r.ostatus !== 'DRAFT') return json(200, { sent: false, reason: 'status ' + r.ostatus });
  if (!r.fresh) return json(200, { sent: false, reason: 'too old – not sent retroactively' });
  if (!['CONFIRMED', 'MODIFIED'].includes(r.rstatus)) return json(200, { sent: false, reason: 'reservation ' + r.rstatus });
  if (r.today > r.departure) return json(200, { sent: false, reason: 'stay already ended' });

  let text = String(r.body || '').trim();
  if (!text || text.length > 4000) return json(200, { sent: false, reason: 'empty or too long text' });
  if (text.includes('[Video-Link fehlt]')) return json(200, { sent: false, reason: 'video link missing' });
  if (/zu bestätigen/i.test(text)) return json(200, { sent: false, reason: 'unconfirmed data in text' });

  let pin = '';
  if (template === 'ACCESS_PIN') {
    if (r.today < r.arrival || r.today >= r.departure) return json(200, { sent: false, reason: 'outside stay' });
    if (r.today === r.arrival && r.now_local < RELEASE_TIME) return json(200, { sent: false, reason: 'before ' + RELEASE_TIME });
    pin = Deno.env.get('IC_PIN_' + String(r.property_id).replaceAll('-', '_')) || '';
    if (!/^\d{3,8}$/.test(pin)) return json(200, { sent: false, reason: 'PIN not configured' });
    if (!text.includes('{{PIN}}')) return json(200, { sent: false, reason: 'PIN placeholder missing' });
    text = text.replaceAll('{{PIN}}', pin);
  }
  if (/\{\{[A-Z_]+\}\}/.test(text)) return json(200, { sent: false, reason: 'unfilled placeholder' });

  // live re-check of the booking in Smoobu (deleted / cancelled / moved bookings are never messaged)
  try {
    const g = await sign({ method: 'GET', path: '/api/reservations/' + r.reservation_id, ...keys() });
    const gr = await fetch(g.url, { headers: g.headers });
    if (gr.status !== 200) return json(200, { sent: false, reason: 'booking not found in Smoobu (HTTP ' + gr.status + ')' });
    const sb = await gr.json();
    const type = String(sb.type || '').toLowerCase();
    if (type.includes('cancel') || sb['is-blocked-booking']) return json(200, { sent: false, reason: 'booking cancelled/blocked in Smoobu' });
    if (String(sb.apartment && sb.apartment.id) !== r.apt) return json(200, { sent: false, reason: 'booking moved to another apartment' });
    if (sb.arrival !== r.arrival || sb.departure !== r.departure) return json(200, { sent: false, reason: 'dates changed in Smoobu – next sync will update' });
  } catch (e) {
    return json(200, { sent: false, reason: 'Smoobu check failed: ' + String(e).slice(0, 100) });
  }

  if (dry) return json(200, { sent: false, dry_run: true, reason: 'all checks passed', length: text.length });

  const claimed = await sql`UPDATE ic.outbound_messages SET status = 'QUEUED', attempts = attempts + 1, test_mode = false
    WHERE outbound_id = ${r.outbound_id} AND status = 'DRAFT' RETURNING outbound_id`;
  if (!claimed.length) return json(200, { sent: false, reason: 'already being processed' });

  let status = 0, resText = '';
  try {
    const body = JSON.stringify({ subject: 'ImmoCare4U', messageBody: text });
    const s = await sign({ method: 'POST', path: '/api/reservations/' + r.reservation_id + '/messages/send-message-to-guest', body, ...keys() });
    const res = await fetch(s.url, { method: 'POST', headers: s.headers, body: s.body });
    status = res.status; resText = await res.text();
  } catch (e) { resText = 'fetch error: ' + String(e); }
  const ok = status >= 200 && status < 300;
  if (pin) resText = resText.replaceAll(pin, '****');
  await sql`UPDATE ic.outbound_messages SET status = ${ok ? 'SENT' : 'FAILED'}::ic.outbound_status,
              sent_at = ${ok ? sql`now()` : null}, smoobu_response = ${sql.json({ status, body: resText.slice(0, 1000) })}
            WHERE outbound_id = ${r.outbound_id}`;
  await sql`INSERT INTO ic.audit_log (actor, action, entity, entity_id, details)
            VALUES ('edge:ic-send-scheduled', ${ok ? (pin ? 'PIN_RELEASED' : 'SCHEDULED_SENT') : 'SCHEDULED_FAILED'}, 'outbound', ${key},
                    ${sql.json({ reservation_id: r.reservation_id, template, http: status })})`;
  return json(200, { sent: ok, reason: ok ? 'sent via Smoobu' : 'Smoobu HTTP ' + status });
});
