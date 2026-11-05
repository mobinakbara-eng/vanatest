// ic-access-pin — decides whether the key-box PIN of a reservation may be released.
// The PIN itself lives only in Supabase secrets (IC_PIN_<PROPERTY_ID with _>), never in
// the database, n8n, Git or the AI prompt.
//
// Request : POST {"reservation_id": 123, "preview": true}   header x-ic-proxy-token
// Response: {"ok": true|false, "reason": "...", "pin_configured": bool, "digits": n}
//           With preview=false AND secret IC_ALLOW_PIN_RELEASE=true the PIN is returned.
//           During the trial week IC_ALLOW_PIN_RELEASE is NOT set → the PIN never leaves.
//
// Release rules (all must hold):
//   reservation exists, status CONFIRMED/MODIFIED, mapped to a property
//   local date (property timezone) is between arrival and departure-1
//   on arrival day: local time >= release time (12:00, owner decision 2026-11-04)
import postgres from 'npm:postgres@3.4.4';
import { safeEqual } from '../_shared/smoobu-sign.mjs';

const RELEASE_TIME = '12:00';
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!safeEqual(req.headers.get('x-ic-proxy-token'), Deno.env.get('IC_PROXY_TOKEN'))) return json(401, { error: 'unauthorized' });
  let body: { reservation_id?: number; preview?: boolean; template?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'invalid json' }); }
  // Only the access message needs a PIN; everything else is answered without DB access.
  if (body.template && body.template !== 'ACCESS_PIN') return json(200, { ok: true, not_pin: true });
  const id = Number(body.reservation_id);
  if (!Number.isSafeInteger(id) || id <= 0) return json(400, { error: 'reservation_id required' });
  const preview = body.preview !== false;

  const rows = await sql`
    SELECT r.status, r.property_id, r.arrival::text AS arrival, r.departure::text AS departure,
           (now() AT TIME ZONE p.timezone)::date::text AS today,
           to_char(now() AT TIME ZONE p.timezone, 'HH24:MI') AS now_local
    FROM ic.reservations r JOIN ic.properties p USING (property_id)
    WHERE r.reservation_id = ${id}`;
  const r = rows[0];
  let reason = '';
  if (!r) reason = 'reservation not found or not mapped to a property';
  else if (!['CONFIRMED', 'MODIFIED'].includes(r.status)) reason = 'reservation status ' + r.status;
  else if (r.today < r.arrival || r.today >= r.departure) reason = 'outside stay (' + r.arrival + ' – ' + r.departure + ')';
  else if (r.today === r.arrival && r.now_local < RELEASE_TIME) reason = 'before release time ' + RELEASE_TIME;

  const pin = r ? Deno.env.get('IC_PIN_' + String(r.property_id).replaceAll('-', '_')) : undefined;
  const released = !reason && !!pin && !preview && Deno.env.get('IC_ALLOW_PIN_RELEASE') === 'true';

  await sql`INSERT INTO ic.audit_log (actor, action, entity, entity_id, details)
    VALUES ('edge:ic-access-pin', ${released ? 'PIN_RELEASED' : 'PIN_CHECK'}, 'reservation', ${String(id)},
            ${sql.json({ preview, allowed: !reason, reason, pin_configured: !!pin })})`;

  return json(200, {
    ok: !reason && !!pin,
    reason: reason || (pin ? 'allowed' : 'PIN not configured for ' + (r && r.property_id)),
    property_id: r && r.property_id,
    pin_configured: !!pin,
    digits: pin ? pin.length : 0,
    ...(released ? { pin } : {}),
  });
});
