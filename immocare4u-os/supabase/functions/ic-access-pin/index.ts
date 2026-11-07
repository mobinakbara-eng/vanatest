// ic-access-pin — decides whether the key-box PIN of a reservation may be released.
// The PIN itself lives only in Supabase secrets (IC_PIN_<PROPERTY_ID with _>), never in
// the database, n8n, Git or the AI prompt.
//
// Request : POST {"reservation_id": 123, "preview": true}   header x-ic-proxy-token
// Response: {"ok": true|false, "reason": "...", "pin_configured": bool, "digits": n}
//           With preview=false AND secret IC_ALLOW_PIN_RELEASE=true the PIN is returned.
//           During the trial week IC_ALLOW_PIN_RELEASE is NOT set → the PIN never leaves.
//
// Entrance video (template ARRIVAL_2D / ACCESS_PIN): returns a signed URL (7 days) to the
// property's video in the PRIVATE Storage bucket "guest-media" – only for a confirmed
// reservation whose arrival is at most 3 days away and that has not ended. The link grants
// read access to that one file only; it exposes no key and no other data.
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
  const wantsVideo = body.template === 'ARRIVAL_2D' || body.template === 'ACCESS_PIN';
  // Only the access message needs a PIN, only arrival messages need the video.
  if (body.template && !wantsVideo) return json(200, { ok: true, not_pin: true });
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

  let video_url: string | null = null, video_reason = '';
  if (wantsVideo && r) {
    const daysToArrival = (Date.parse(r.arrival) - Date.parse(r.today)) / 864e5;
    if (!['CONFIRMED', 'MODIFIED'].includes(r.status)) video_reason = 'reservation status ' + r.status;
    else if (r.today >= r.departure) video_reason = 'stay ended';
    else if (daysToArrival > 3) video_reason = 'more than 3 days before arrival';
    else {
      const path = String(r.property_id) + '/eingang.mp4';
      const res = await fetch(Deno.env.get('SUPABASE_URL') + '/storage/v1/object/sign/guest-media/' + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 7 * 24 * 3600 }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.signedURL) video_url = Deno.env.get('SUPABASE_URL') + '/storage/v1' + j.signedURL;
      else video_reason = 'video not available (' + res.status + ')';
    }
  }
  if (body.template === 'ARRIVAL_2D') {
    return json(200, { ok: !!video_url, not_pin: true, video_url, reason: video_reason || (video_url ? 'video link created' : 'no reservation') });
  }

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
    video_url,
    ...(released ? { pin } : {}),
  });
});
