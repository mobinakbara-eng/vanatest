// ic-tick — the scheduler of ImmoCare4U (replaces the n8n "every 30 min" trigger).
// Called by pg_cron every 5 minutes (db/ops/ic_tick_cron.sql). Costs no n8n executions.
//
//   1. Smoobu sync (read-only): reservations, then messages
//        – reservations arriving within 7 days / in stay / departed yesterday: every tick
//        – all other reservations of the next 60 days: every 30 min
//   2. expire old approvals
//   3. level-6 replies whose stop window passed  → ic-send-approved
//   4. scheduled messages that are due           → render → record → ic-send-scheduled
//   5. guest messages that need an AI draft      → wake n8n WF-01 (only then!)
//   6. if anything was sent/failed               → n8n WF-01 e-mails one report
//
// All SQL and transformation code come from _shared/ic-generated.mjs, generated from the same
// tested sources as the n8n workflows (n8n/build-workflows.js).
import postgres from 'npm:postgres@3.4.4';
import { sign, safeEqual } from '../_shared/smoobu-sign.mjs';
import { SQL, normalizeBookings, messageRows, renderScheduled } from '../_shared/ic-generated.mjs';

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
const TOKEN = Deno.env.get('IC_PROXY_TOKEN')!;
const FN = Deno.env.get('SUPABASE_URL') + '/functions/v1/';
const N8N_WORK = 'https://mobinakbara.app.n8n.cloud/webhook/ic/wf01-work';
const LOCK = 4242001;

// postgres.js: send every parameter as text; the queries cast explicitly ($1::bigint, …)
const q = (query: string, params: unknown[] = []) =>
  sql.unsafe(query, params.map((v) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v))));

async function smoobu(path: string, query?: Record<string, unknown>) {
  const s = await sign({ method: 'GET', path, query, apiKey: Deno.env.get('SMOOBU_API_KEY'), apiSecret: Deno.env.get('SMOOBU_API_SECRET') });
  const r = await fetch(s.url, { headers: s.headers });
  return { statusCode: r.status, body: await r.json().catch(() => null) };
}
async function fn(name: string, body: unknown) {
  try {
    const r = await fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ic-proxy-token': TOKEN }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ reason: 'HTTP ' + r.status }));
  } catch (e) { return { reason: String(e).slice(0, 200) }; }
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!safeEqual(req.headers.get('x-ic-proxy-token'), TOKEN)) return json(401, { error: 'unauthorized' });

  const lock = await sql`SELECT pg_try_advisory_lock(${LOCK}) AS ok`;
  if (!lock[0].ok) return json(200, { skipped: 'previous tick still running' });

  const started = Date.now();
  const report = { scheduled: [] as unknown[], auto_failures: [] as unknown[], drafts: 0, errors: [] as string[], health: [] as unknown[] };
  const stats = { reservations: 0, fetchedMessages: 0, newMessages: 0, hostFromThreads: 0, autoSent: 0, scheduledSent: 0 };
  const fetched = new Set<number>();   // reservations whose messages were read in this tick
  const step = async (name: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) { report.errors.push(name + ': ' + String(e && (e as Error).message || e).slice(0, 300)); }
  };
  try {
    // 1) Smoobu sync
    await step('sync', async () => {
      const now = new Date();
      const resp = await smoobu('/api/reservations', { from: ymd(new Date(now.getTime() - 2 * 864e5)), to: ymd(new Date(now.getTime() + 60 * 864e5)), pageSize: 100, showCancellation: 'true' });
      const rows = normalizeBookings(resp);   // throws on HTTP error
      const near = ymd(new Date(now.getTime() + 7 * 864e5)), yesterday = ymd(new Date(now.getTime() - 864e5));
      const fullPass = now.getUTCMinutes() % 30 < 5;
      const specs: { reservationId: number; propertyId: string }[] = [];
      for (const r of rows) {
        const up = (await q(SQL.UPSERT_RESERVATION, r.p))[0];
        stats.reservations++;
        const [arrival, departure] = [String(r.p[4]), String(r.p[5])];
        const active = arrival <= near && departure >= yesterday;
        if (up && up.property_id && up.status !== 'CANCELLED' && (fullPass || active)) specs.push({ reservationId: Number(up.reservation_id), propertyId: up.property_id });
      }
      for (const spec of specs) {
        const m = await smoobu('/api/reservations/' + spec.reservationId + '/messages');
        if (m.statusCode === 200) fetched.add(spec.reservationId);
        for (const p of messageRows([m], [spec])) {   // throws on HTTP error
          stats.fetchedMessages++;
          const ins = await q(SQL.STORE_MESSAGE, p);
          if (ins.length) stats.newMessages++;
        }
      }
    });
    // 1b) Airbnb: messages the host (team or this system) sends do not appear in /reservations/{id}/messages,
    //     only in the conversation list. The latest message of a conversation that is NOT among the messages
    //     just read for that booking is therefore a host message → store it, so drafts/auto replies/health
    //     checks know the guest was already answered. Only for bookings read in THIS tick (no guessing).
    await step('threads', async () => {
      const t = await smoobu('/api/threads', { page_number: 1 });
      if (t.statusCode !== 200) throw new Error('threads HTTP ' + t.statusCode);
      for (const th of (t.body && t.body.threads) || []) {
        const rid = Number(th.booking && th.booking.id), lm = th.latest_message;
        if (!fetched.has(rid) || !lm || !lm.id || !lm.created_at) continue;
        const text = String(lm.text_content || String(lm.html_content || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const ins = await sql`INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, subject, body, sent_at)
          SELECT ${lm.id}, r.reservation_id, r.property_id, 'OUTBOUND', 'HOST', ${lm.subject || null}, ${text},
                 (${String(lm.created_at)}::timestamp AT TIME ZONE 'Europe/Berlin')
          FROM ic.reservations r WHERE r.reservation_id = ${rid} AND r.property_id IS NOT NULL
          ON CONFLICT (smoobu_message_id) DO NOTHING RETURNING message_pk`;
        if (ins.length) stats.hostFromThreads++;
      }
    });
    // 2) expire approvals
    await step('expire', async () => { await q(SQL.EXPIRE_APPROVALS); });
    // 3) level-6 replies after the stop window
    await step('auto replies', async () => {
      for (const a of await q(SQL.DUE_AUTO)) {
        const r = await fn('ic-send-approved', { approval_code: a.approval_code, link_token: a.link_token });
        if (r.sent) stats.autoSent++; else report.auto_failures.push({ approval_code: a.approval_code, reason: r.reason || r.error || 'unknown' });
      }
    });
    // 4) scheduled messages
    await step('scheduled', async () => {
      const due = await q(SQL.DUE_SCHEDULED);
      if (!due.length) return;
      const rows = [];
      for (const d of due) {
        const pin_check = await fn('ic-access-pin', { reservation_id: d.reservation_id, template: d.template_code, preview: true });
        rows.push({ ...d, pin_check });
      }
      for (const j of renderScheduled(rows)) {
        const rec = await q(SQL.RECORD_SCHEDULED, j.p);
        if (!rec.length) continue;   // already recorded (idempotent)
        const s = await fn('ic-send-scheduled', { idempotency_key: rec[0].idempotency_key });
        if (s.sent) stats.scheduledSent++;
        else await sql`UPDATE ic.outbound_messages SET status = 'BLOCKED',
                         smoobu_response = ${sql.json({ refused: String(s.reason || s.error || 'unknown').slice(0, 300) })}
                       WHERE idempotency_key = ${rec[0].idempotency_key} AND status = 'DRAFT'`;   // reason kept for the health check
        report.scheduled.push({ template_code: j.template_code, internal_name: j.internal_name, reservation_id: j.reservation_id,
          channel_name: j.channel_name, arrival: j.arrival, departure: j.departure, lang: j.lang, body: j.body, is_pin: j.is_pin,
          sent: !!s.sent, reason: s.reason || s.error || (s.sent ? '' : 'unknown') });
      }
    });
    // 5) drafts needed?
    await step('drafts', async () => { report.drafts = (await q(SQL.TRIGGER_DRAFTS)).length; });
    // 6) once a day (07:00–07:04 Berlin): automatic health check, e-mailed only if something is not OK
    await step('health', async () => {
      const hm = new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 5);
      if (hm >= '07:00' && hm < '07:05') {
        const rows = await sql`SELECT * FROM ic.health_check(24)`;
        report.health = rows.filter((r) => r.status === 'WARN' || r.status === 'FAIL');
      }
    });
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK})`;
  }

  const work = report.drafts > 0 || report.scheduled.length > 0 || report.auto_failures.length > 0 || report.errors.length > 0 || report.health.length > 0;
  let woke = false;
  if (work) {
    try {
      const r = await fetch(N8N_WORK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ic-webhook-token': Deno.env.get('IC_N8N_WEBHOOK_TOKEN') || '' }, body: JSON.stringify(report) });
      woke = r.ok;
      if (!r.ok) report.errors.push('n8n wake-up HTTP ' + r.status);
    } catch (e) { report.errors.push('n8n wake-up: ' + String(e).slice(0, 200)); }
  }
  const summary = { ...stats, drafts: report.drafts, scheduled: report.scheduled.length, autoFailures: report.auto_failures.length,
    errors: report.errors, n8nWoken: woke, ms: Date.now() - started };
  await sql`INSERT INTO ic.automation_runs (workflow, finished_at, status, summary)
            VALUES ('ic-tick', now(), ${report.errors.length ? 'PARTIAL' : 'SUCCESS'}, ${sql.json(summary)})`;
  return json(200, summary);
});
