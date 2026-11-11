// Runs WF-01 Code nodes in a sandbox with synthetic Smoobu data (no real guest data).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');
const wf = require('../n8n/workflows/WF-01-smoobu-readonly-sync.json');
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

// Since 11.11.2026 sync / scheduling / auto-send run in Supabase ic-tick, using the generated
// module with the same SQL and code. Legacy node names map onto it.
const G = require('../supabase/functions/_shared/ic-generated.mjs');
const LEGACY_SQL = { 'Due scheduled': G.SQL.DUE_SCHEDULED, 'Due auto replies': G.SQL.DUE_AUTO, 'Record scheduled': G.SQL.RECORD_SCHEDULED };
const by01 = (n) => LEGACY_SQL[n] || byName[n].parameters.query;
const LEGACY_RUN = {
  'Normalize reservations': (items) => G.normalizeBookings(items[0].json).map((json) => ({ json })),
  'Messages to rows': (items, outputs) => G.messageRows(items.map((i) => i.json), outputs['Spec messages'].map((i) => i.json)).map((p) => ({ json: { p } })),
  'Render scheduled': (items) => G.renderScheduled(items.map((i) => i.json)).map((json) => ({ json })),
};

function run(name, items, outputs = {}) {
  if (LEGACY_RUN[name]) return JSON.parse(JSON.stringify(LEGACY_RUN[name](items, outputs)));
  const sb = {
    $input: { first: () => items[0], all: () => items },
    $: (n) => ({ all: () => outputs[n], first: () => outputs[n][0] }),
    JSON, Date, Number, String, Object, require, Intl,
  };
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${byName[name].parameters.jsCode} })`, sb)()));
}

test('ic-tick: Smoobu is only read (GET), with a date window; writes only via the send functions', () => {
  const t = fs.readFileSync(path.join(__dirname, '../supabase/functions/ic-tick/index.ts'), 'utf8');
  assert.match(t, /sign\(\{ method: 'GET', path, query/);
  assert.doesNotMatch(t, /method: '(POST|PUT|PATCH|DELETE)', path/);
  assert.match(t, /from: ymd\(new Date\(now\.getTime\(\) - 2 \* 864e5\)\), to: ymd\(new Date\(now\.getTime\(\) \+ 60 \* 864e5\)\)/);
  assert.match(t, /fn\('ic-send-approved', \{ approval_code: a\.approval_code, link_token: a\.link_token \}\)/);
  assert.match(t, /fn\('ic-send-scheduled', \{ idempotency_key: rec\[0\]\.idempotency_key \}\)/);
  assert.match(t, /pg_try_advisory_lock/);   // no overlapping ticks
});

test('normalize skips blocked, maps status, strips PII', () => {
  const body = { bookings: [
    { id: 1, type: 'reservation', arrival: '2026-11-10', departure: '2026-11-12', apartment: { id: 2869006 }, channel: { name: 'Airbnb' }, email: 'x@y.z', phone: '1', 'guest-name': 'A B', firstname: 'A' },
    { id: 2, type: 'cancellation', arrival: '2026-11-10', departure: '2026-11-12', apartment: { id: 2869011 }, channel: { name: 'Booking.com' } },
    { id: 3, 'is-blocked-booking': true, arrival: '2026-11-10', departure: '2026-11-12', apartment: { id: 2869011 }, channel: { name: 'Blocked channel' } },
    { id: 4, arrival: '2026-11-10', departure: '2026-11-12', apartment: { id: 2869011 }, channel: { name: 'Blocked channel auto' } },
  ] };
  const out = run('Normalize reservations', [{ json: { statusCode: 200, body } }]);
  assert.deepEqual(out.map((o) => o.json.reservationId), [1, 2]);
  assert.equal(out[1].json.status, 'CANCELLED');
  const raw = JSON.parse(out[0].json.p[11]);
  for (const k of ['email', 'phone', 'guest-name', 'firstname']) assert.ok(!(k in raw), k);
});

test('normalize throws on proxy error so WF-14 logs it', () => {
  assert.throws(() => run('Normalize reservations', [{ json: { statusCode: 401, body: {} } }]));
});

test('ic-tick: messages of cancelled / unmapped bookings are never fetched; far-future ones only every 30 min', () => {
  const t = fs.readFileSync(path.join(__dirname, '../supabase/functions/ic-tick/index.ts'), 'utf8');
  assert.match(t, /up\.property_id && up\.status !== 'CANCELLED' && \(fullPass \|\| active\)/);
  assert.match(t, /getUTCMinutes\(\) % 30 < 5/);
});

test('messages to rows: type 1 = guest (classified), type 2 = host (not classified)', () => {
  const specs = [{ json: { reservationId: 1, propertyId: 'P-BER-001' } }];
  const out = run('Messages to rows', [{ json: { statusCode: 200, body: { messages: [
    { id: 10, type: 1, message: 'What is the Wi-Fi password?', createdAt: '2026-11-04 10:00:00' },
    { id: 11, type: 2, message: 'Hello, the network is ...' },
    { id: 12, type: 1, message: '<p>I want a full refund</p>' },
    { id: 13, type: 1, message: '   ' },
  ] } } }], { 'Spec messages': specs });
  assert.equal(out.length, 3);
  assert.deepEqual(out[0].json.p.slice(3, 5), ['INBOUND', 'GUEST']);
  assert.equal(out[0].json.p[8], 'AUTO');
  assert.deepEqual(out[1].json.p.slice(3, 5), ['OUTBOUND', 'HOST']);
  assert.equal(out[1].json.p[8], null);
  assert.equal(out[2].json.p[8], 'CRITICAL');
  assert.equal(out[2].json.p[6], 'I want a full refund');
});

test('WF-01 (n8n) only drafts and e-mails: no timer, no Smoobu access, no sending', () => {
  const urls = wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest').map((x) => x.parameters.url).sort();
  assert.deepEqual(urls, ['https://api.anthropic.com/v1/messages', 'https://bkqtruzcrypiudhgzmhs.supabase.co/functions/v1/ic-tick']);
  const triggers = wf.nodes.filter((x) => /Trigger|webhook/i.test(x.type));
  assert.deepEqual(triggers.map((x) => x.name).sort(), ['Hourly watchdog', 'Work webhook']);
  assert.equal(byName['Work webhook'].parameters.authentication, 'headerAuth');
  assert.equal(byName['Hourly watchdog'].parameters.rule.interval[0].expression, '7 8-22 * * *');
  // watchdog only acts when ic-tick is stale (query returns no row otherwise) and then heals by running ic-tick
  assert.match(byName['Tick health'].parameters.query, /HAVING coalesce\(max\(finished_at\), 'epoch'\) < now\(\) - interval '15 minutes'/);
  assert.deepEqual(wf.connections['Tick health'].main[0].map((c) => c.node), ['Run ic-tick now']);
});

test('no WF-01 code node writes to Smoobu', () => {
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(n.parameters.jsCode), n.name);
  }
});

// ---------------- drafting (WF-03 inline) + email + approval (WF-04) ----------------
const { execFileSync } = require('node:child_process');
const wf04 = require('../n8n/workflows/WF-04-email-approval.json');
const by4 = Object.fromEntries(wf04.nodes.map((n) => [n.name, n]));
const aiResp = (obj) => ({ json: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] } });
const src = (o = {}) => ({ json: { message_pk: 5, reservation_id: 9, property_id: 'P-BER-001', body: 'x', internal_name: 'Loft',
  rule_level: 'AUTO', rule_intent: 'WIFI', rule_flags: '', channel_name: 'Airbnb', arrival: '2026-11-03T00:00:00.000Z', departure: '2026-11-05T00:00:00.000Z',
  kb: [{ key: 'faq_wifi', lang: 'de', value: 'MagentaWLAN-X382', verified: false }], ...o } });
const base = { level: 6, intent: 'WIFI', confidence: 0.95, language: 'de', reply: 'Das WLAN heißt MagentaWLAN-X382.', used_kb_keys: ['faq_wifi'],
  needs_human: false, flags: [], guest_fa: 'وای‌فای چیست؟', reply_fa: 'اسم وای‌فای ...', reason_fa: 'سؤال رایج' };
const decide = (resp, s = src()) => { const [o] = run('Decide level & email', [resp], { 'Build AI request': [s] }); return { p: o.json.p, payload: JSON.parse(o.json.p[7]) }; };
const render = (payload) => {
  const sb = { $input: { all: () => [{ json: { payload, approval_code: 'AP-X1', link_token: 'tok123' } }] }, encodeURIComponent, String, JSON };
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${byName['Render email'].parameters.jsCode} })`, sb)()))[0].json;
};

test('decide: FAQ stays level 6, unverified KB recorded', () => {
  const { payload } = decide(aiResp(base));
  assert.equal(payload.level, 6);
  assert.deepEqual(payload.used_unverified, ['faq_wifi']);
  assert.equal(payload.arrival, '2026-11-03');
});

test('decide: rule CRITICAL wins over AI level 6', () => {
  assert.equal(decide(aiResp(base), src({ rule_level: 'CRITICAL', rule_intent: 'REFUND' })).payload.level, 2);
});

test('decide: codes are stripped from drafts and level raised', () => {
  const { payload, p } = decide(aiResp({ ...base, reply: 'Der Code für den Safe ist 1969.' }));
  assert.ok(!p[3].includes('1969'));
  assert.equal(payload.level, 2);
});

test('decide: invalid AI output → level 4, no crash', () => {
  assert.equal(decide({ json: { content: [{ type: 'text', text: 'not json' }] } }).payload.level, 4);
});

test('email: Persian layout, formatted dates, 3 buttons, escaped guest text', () => {
  const { payload } = decide(aiResp(base), src({ body: '<script>alert(1)</script>', rule_level: 'REVIEW', rule_intent: 'EARLY_CHECKIN' }));
  const e = render(payload);
  assert.match(e.html, /03\.11\.2026 از ساعت 15:00/); assert.match(e.html, /05\.11\.2026 تا ساعت 11:00/);
  assert.ok(!e.html.includes('<script>'));
  assert.match(e.html, /a=approve/); assert.match(e.html, /a=edit/); assert.match(e.html, /a=reject/);
  assert.match(e.html, /c=AP-X1&t=tok123/);
  assert.match(e.subject, /سطح 3/);
});

test('email: level 1–2 has no approve button (staff only)', () => {
  const { payload } = decide(aiResp(base), src({ rule_level: 'CRITICAL', rule_intent: 'REFUND' }));
  const e = render(payload);
  assert.ok(!/a=approve/.test(e.html));
  assert.match(e.html, /a=reject/);
});

test('approval page: GET only shows a form, never decides', () => {
  const page = (a, row) => JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${by4['Confirm page'].parameters.jsCode} })`, {
    $: () => ({ first: () => ({ json: { query: { c: 'AP-X1', t: 'tok', a } } }) }),
    $input: { first: () => ({ json: row }) }, String })()))[0].json.html;
  assert.match(page('approve', { approval_code: 'AP-X1', proposed_text: 'Hallo' }), /method="post"/);
  assert.match(page('edit', { approval_code: 'AP-X1', proposed_text: 'Hallo' }), /textarea name="instruction"/);
  assert.match(page('approve', {}), /معتبر نیست/);
  // GET branch contains no SQL that writes
  assert.match(by4['Load approval'].parameters.query, /^SELECT/);
});

test('drafting + approval SQL on the real schema (idempotent, one-time links, edit chain)', { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, () => {
  const PG = process.env.PG_TEST_URL;
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const sql = (q, p = []) => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|', '-c', q.replace(/\$(\d+)/g, (_, i) => lit(p[i - 1]))]).toString().trim();
  sql(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (7001,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
       INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES (7001001,7001,'P-BER-001','INBOUND','GUEST','Wifi?', now()) ON CONFLICT DO NOTHING;
       INSERT INTO ic.message_classifications (message_pk, level, intent, rule_level) SELECT message_pk,'AUTO','WIFI','AUTO' FROM ic.messages WHERE smoobu_message_id=7001001;`);
  assert.match(sql(byName['Pending drafts'].parameters.query), /Wifi\?/);
  const pk = Number(sql("SELECT message_pk FROM ic.messages WHERE smoobu_message_id=7001001"));
  const p = [pk, 7001, 'P-BER-001', 'Hallo', 'AP-T1', 'AUTO', 'L6 WIFI', '{"level":6}', 1, null, null];
  const [code, token, payload] = sql(byName['Record draft'].parameters.query, p).split('|');
  assert.equal(code, 'AP-T1'); assert.equal(token.length, 64); assert.match(payload, /"level"/);
  assert.equal(sql(byName['Record draft'].parameters.query, [...p.slice(0, 4), 'AP-T2', ...p.slice(5)]), '');   // idempotent
  assert.doesNotMatch(sql(byName['Pending drafts'].parameters.query), /Wifi\?/);
  // GET lookup: wrong token → nothing
  assert.equal(sql(by4['Load approval'].parameters.query, ['AP-T1', 'wrong']), '');
  assert.match(sql(by4['Load approval'].parameters.query, ['AP-T1', token]), /AP-T1\|PENDING\|Hallo/);
  // edit without instruction is refused
  assert.match(sql(by4['Decide approval'].parameters.query, ['AP-T1', token, 'edit', ' ']), /\|PENDING\|.*\|t$/);   // not applied
  // edit with instruction
  const row = sql(by4['Decide approval'].parameters.query, ['AP-T1', token, 'edit', 'kürzer bitte']);
  assert.match(row, /EDITED/); assert.ok(row.endsWith('|' + pk + '|f'));
  // second click on the same link does nothing
  assert.match(sql(by4['Decide approval'].parameters.query, ['AP-T1', token, 'approve', '']), /\|EDITED\|.*\|t$/);   // no change, reported as already
  // revision context + revision record
  assert.match(sql(by4['Revision context'].parameters.query, [pk]), /Wifi\?/);
  const parent = sql("SELECT approval_id FROM ic.approvals WHERE approval_code='AP-T1'");
  const [c2] = sql(by4['Record draft'].parameters.query, [pk, 7001, 'P-BER-001', 'Hallo (kurz)', 'AP-T3', 'AUTO', 'L6', '{}', 2, parent, 'kürzer bitte']).split('|');
  assert.equal(c2, 'AP-T3');
  assert.equal(sql("SELECT status FROM ic.outbound_messages WHERE idempotency_key='draft:'||" + pk), 'SUPPRESSED');
  assert.equal(sql("SELECT count(*) FROM ic.audit_log WHERE entity_id='AP-T1'"), '1');
});

// ---------------- scheduled messages (WF-05 inline) ----------------
const due = (o = {}) => ({ json: { template_code: 'ACCESS_PIN', reservation_id: 11, property_id: 'P-BER-001', internal_name: 'Loft',
  street_address: 'Geschwister-Scholl-Straße 5', postal_code: '10117', lang: 'de', arrival: '2026-11-10', departure: '2026-11-12', channel_name: 'Airbnb', ...o } });

test('scheduled: PIN text keeps {{PIN}} placeholder, never digits; missing video flagged', () => {
  const out = run('Render scheduled', [{ json: { ...due().json, pin_check: { ok: true } } }, { json: { ...due({ template_code: 'ARRIVAL_2D' }).json, pin_check: { not_pin: true } } }]);
  assert.match(out[0].json.body, /\{\{PIN\}\}/);
  assert.ok(!/\d{4}(?!\d)/.test(out[0].json.body.replace('10117', '').replace(/\d\d:\d\d/g, '')));
  assert.equal(out[0].json.p[4], true);                 // contains_restricted
  assert.equal(out[0].json.pin_ok, true);
  assert.ok(out[1].json.missing.some((m) => /ویدیو/.test(m)));
  assert.match(out[0].json.body, /obere, größere/); assert.match(out[0].json.body, /maps\/search/);
  assert.equal(out[1].json.lang, 'de');
});

const tickReport = (body) => JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${byName['Tick report'].parameters.jsCode} })`,
  { $: () => ({ first: () => ({ json: { body } }) }), String, JSON })()));
test('report: scheduled results (PIN masked), auto-send failures and tick errors become e-mails; nothing → no e-mail', () => {
  const rendered = run('Render scheduled', [{ json: { ...due().json, pin_check: { ok: true } } }, { json: { ...due({ reservation_id: 12, template_code: 'WELCOME' }).json, pin_check: {} } }]);
  const scheduled = rendered.map((r, i) => ({ ...r.json, sent: i === 0, reason: i ? 'booking cancelled/blocked in Smoobu' : '' }));
  const out = tickReport({ scheduled, auto_failures: [{ approval_code: 'AP-X', reason: 'Smoobu HTTP 500' }], errors: ['sync: HTTP 401'] });
  assert.equal(out.length, 3);
  assert.match(out[0].json.subject, /1 از 2/);
  assert.match(out[0].json.html, /••••/); assert.match(out[0].json.html, /booking cancelled/);
  assert.ok(!out[0].json.html.includes('{{PIN}}'));
  assert.match(out[1].json.html, /AP-X/); assert.match(out[2].json.html, /HTTP 401/);
  assert.deepEqual(tickReport({ drafts: 2, scheduled: [], auto_failures: [], errors: [] }), []);
});

test('draft trigger: each pending message wakes n8n once, again only after 15 min', { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, () => {
  const PG = process.env.PG_TEST_URL;
  const sql = (q) => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', q]).toString().trim();
  sql(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (8401,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
       INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES (8401001,8401,'P-BER-001','INBOUND','GUEST','Parking?', now()) ON CONFLICT DO NOTHING;
       INSERT INTO ic.message_classifications (message_pk, level, intent, rule_level) SELECT message_pk,'AUTO','PARKING','AUTO' FROM ic.messages WHERE smoobu_message_id=8401001;`);
  const pk = sql('SELECT message_pk FROM ic.messages WHERE smoobu_message_id=8401001');
  assert.ok(sql(G.SQL.TRIGGER_DRAFTS).split('\n').includes(pk));
  assert.ok(!sql(G.SQL.TRIGGER_DRAFTS).split('\n').includes(pk));        // not again within 15 min
  sql(`UPDATE ic.draft_triggers SET triggered_at = now() - interval '16 minutes' WHERE message_pk = ${pk}`);
  assert.ok(sql(G.SQL.TRIGGER_DRAFTS).split('\n').includes(pk));         // retried if still no draft
});

test('generated module is in sync with the n8n sources', () => {
  for (const k of ['DUE_SCHEDULED', 'DUE_AUTO', 'RECORD_SCHEDULED', 'UPSERT_RESERVATION', 'STORE_MESSAGE', 'EXPIRE_APPROVALS', 'TRIGGER_DRAFTS']) assert.ok(G.SQL[k], k);
  const pending = byName['Pending drafts'].parameters.query;
  const where = pending.slice(pending.indexOf("WHERE m.direction = 'INBOUND'"), pending.indexOf('ORDER BY'));
  assert.ok(G.SQL.TRIGGER_DRAFTS.includes(where.trim()));          // same pending rule in n8n and Supabase
});

test('scheduled SQL: due window, cancelled excluded, idempotent', { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, () => {
  const PG = process.env.PG_TEST_URL;
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const sql = (q, p = []) => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|', '-c', q.replace(/\$(\d+)/g, (_, i) => lit(p[i - 1]))]).toString().trim();
  sql(`INSERT INTO ic.property_message_schedules (property_id, template_code, anchor, offset_minutes, enabled) VALUES ('P-BER-001','ACCESS_PIN','CHECK_IN',-180,true) ON CONFLICT (property_id, template_code) DO UPDATE SET enabled=true, offset_minutes=-180, anchor='CHECK_IN';
       INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, check_in_at, check_out_at, status, raw) VALUES
         (8001,'P-BER-001',1,current_date,current_date+2, now() + interval '170 minutes', now() + interval '2 days','CONFIRMED','{"language":"en"}'),
         (8002,'P-BER-001',1,current_date,current_date+2, now() + interval '170 minutes', now() + interval '2 days','CANCELLED','{}'),
         (8003,'P-BER-001',1,current_date,current_date+2, now() + interval '5 hours', now() + interval '2 days','CONFIRMED','{}')
       ON CONFLICT DO NOTHING;`);
  const rows = sql(by01('Due scheduled'));
  assert.match(rows, /ACCESS_PIN\|8001\|/);
  assert.doesNotMatch(rows, /\|8002\|/);   // cancelled
  assert.doesNotMatch(rows, /\|8003\|/);   // not due yet
  assert.match(rows, /\|en\|/);
  const p = ['sched:8001:ACCESS_PIN', 8001, 'P-BER-001', 'Code: {{PIN}}', true];
  assert.equal(sql(by01('Record scheduled'), p), 'sched:8001:ACCESS_PIN');
  assert.equal(sql(by01('Record scheduled'), p), '');
  assert.doesNotMatch(sql(by01('Due scheduled')), /\|8001\|/);
});

test('AI request carries Berlin date and stay phase (regression: "enjoy your stay" on departure day)', () => {
  const mk = (sent) => run('Build AI request', [src({ sent_at: sent, convo: [{ direction: 'INBOUND', body: 'Wir haben den Schlüssel wieder zurück gehängt.' }] })])[0].json.ai;
  const u = (sent) => mk(sent).messages[0].content;
  assert.match(u('2026-11-05T09:20:00Z'), /STAY PHASE DEPARTURE_DAY/);
  assert.match(u('2026-11-04T10:00:00Z'), /STAY PHASE DURING_STAY/);
  assert.match(u('2026-11-03T10:00:00Z'), /STAY PHASE ARRIVAL_DAY/);
  assert.match(u('2026-11-01T10:00:00Z'), /STAY PHASE BEFORE_ARRIVAL/);
  assert.match(u('2026-11-06T10:00:00Z'), /STAY PHASE AFTER_DEPARTURE/);
  assert.match(u('2026-11-04T23:30:00Z'), /STAY PHASE DEPARTURE_DAY/);   // 00:30 Berlin = next day
  assert.match(mk('2026-11-05T09:20:00Z').system, /never wish a pleasant stay/);
});

test('AI request has exact stay times, hours to check-out and requires analysis', () => {
  const ai = run('Build AI request', [src({ sent_at: '2026-11-05T09:28:00Z', check_in_time: '15:00', check_out_time: '11:00', nights: 2, adults: 2, children: 1 })])[0].json.ai;
  const u = ai.messages[0].content;
  assert.match(u, /LAST GUEST MESSAGE SENT \(Berlin\): 2026-11-05 10:28/);
  assert.match(u, /check-in from 15:00 · departure 2026-11-05 check-out by 11:00 · 2 nights · guests: 2 adults, 1 children/);
  assert.match(u, /hours until check-out time: 0\.5/);
  assert.match(u, /NOW \(Berlin\): \d{4}-\d\d-\d\d \d\d:\d\d/);
  assert.ok(ai.output_config.format.schema.required.includes('analysis_fa'));
  assert.equal(ai.output_config.effort, 'high');
  assert.match(ai.system, /THINK BEFORE YOU WRITE/);
});

// ---------------- approval policy & privacy guard ----------------
test('policy: acknowledgement answerable from our data → level 6, sent automatically (send-now button only)', () => {
  const ack = { ...base, intent: 'KEY_RETURNED_CHECKOUT', reply: 'Vielen Dank und gute Heimreise!', used_kb_keys: [] };
  const { payload } = decide(aiResp(ack), src({ rule_level: 'REVIEW', rule_intent: 'UNKNOWN', rule_flags: 'NO_RULE_MATCH' }));
  assert.equal(payload.level, 6);
  const e = render(payload);
  assert.match(e.html, /ارسال فوری/); assert.doesNotMatch(e.html, /تأیید و ارسال/);
  assert.match(e.html, /a=edit/); assert.match(e.html, /a=reject/);
  assert.match(e.html, /حدود ۲۰ دقیقه/);
  assert.match(e.subject, /خودکار/);
});

test('policy: real decisions keep approval (early check-in = 3), missing fact → 4', () => {
  assert.equal(decide(aiResp(base), src({ rule_level: 'REVIEW', rule_intent: 'EARLY_CHECKIN' })).payload.level, 3);
  assert.equal(decide(aiResp({ ...base, needs_human: true })).payload.level, 4);
  assert.equal(decide(aiResp({ ...base, flags: ['MISSING_KB_FACT'] })).payload.level, 4);
  assert.equal(decide(aiResp(base), src({ rule_level: 'REVIEW', rule_intent: 'HEATING', rule_flags: 'MALFUNCTION' })).payload.level, 4);
});

test('privacy: reply mentioning another unit is blocked; contact data removed', () => {
  const s2 = src({ other_units: ['Stylisches City-Apartment im Herzen Berlins'] });
  const leak = decide(aiResp({ ...base, reply: 'Im Stylisches City-Apartment im Herzen Berlins wohnt gerade jemand.' }), s2);
  assert.equal(leak.payload.level, 2); assert.equal(leak.payload.reply, ''); assert.ok(leak.payload.flags.includes('LEAK_BLOCKED'));
  const id = decide(aiResp({ ...base, reply: 'Siehe P-BER-002.' }), s2);
  assert.ok(id.payload.flags.includes('LEAK_BLOCKED'));
  const c = decide(aiResp({ ...base, reply: 'Schreiben Sie an max@example.com oder +49 160 1234567.' }), s2);
  assert.ok(!/example\.com|1234567/.test(c.payload.reply)); assert.equal(c.payload.level, 4);
});

test('privacy rule is in the system prompt', () => {
  const ai = run('Build AI request', [src()])[0].json.ai;
  assert.match(ai.system, /PRIVACY – absolute/);
  assert.match(ai.system, /These need NO approval/);
});

// ---------------- regression 08.11.2026: double submit of the edit form ----------------
const resultPage = (row, send = {}) => JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${by4['Result page'].parameters.jsCode} })`,
  { $: () => ({ first: () => ({ json: row }) }), $input: { first: () => ({ json: send }) }, String, JSON })()))[0].json.html;

test('double submit: second click shows "already recorded", not an error', () => {
  assert.match(resultPage({ approval_code: 'AP-1', status: 'EDITED', already: false }), /در حال اصلاح/);
  const second = resultPage({ approval_code: 'AP-1', status: 'EDITED', already: true });
  assert.match(second, /قبلاً ثبت شده/); assert.doesNotMatch(second, /ثبت نشد/);
  assert.match(resultPage({}), /ثبت نشد/);
});

test('confirm page disables the button after the first submit', () => {
  const html = JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${by4['Confirm page'].parameters.jsCode} })`, {
    $: () => ({ first: () => ({ json: { query: { c: 'AP-1', t: 't', a: 'edit' } } }) }),
    $input: { first: () => ({ json: { approval_code: 'AP-1', proposed_text: 'x' } }) }, String })()))[0].json.html;
  assert.match(html, /dataset\.sent/); assert.match(html, /b\.disabled=true/);
});

test('only the first submission triggers the AI revision', () => {
  const cond = by4['Edit requested?'].parameters.conditions.conditions[0].leftValue;
  assert.match(cond, /already === false/);
});

test('a manager-corrected version (revision 2) is never auto-sent: it needs "approve & send"', () => {
  const { payload } = decide(aiResp(base));
  const r2 = render({ ...payload, revision: 2 }).html;
  assert.match(r2, /تأیید و ارسال/); assert.doesNotMatch(r2, /حدود ۲۰ دقیقه/);
  assert.match(by01('Due auto replies'), /a\.revision = 1/);
});

test('every Postgres node retries transient connection errors', () => {
  for (const w of [wf, wf04]) for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) {
    assert.equal(n.retryOnFail, true, n.name); assert.equal(n.maxTries, 3, n.name);
  }
});

test('double submit SQL: second identical submission returns the existing row with already=true', { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, () => {
  const PG = process.env.PG_TEST_URL;
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const sql = (q, p = []) => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|', '-c', q.replace(/\$(\d+)/g, (_, i) => lit(p[i - 1]))]).toString().trim();
  sql(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (9101,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
       INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES (9101001,9101,'P-BER-001','INBOUND','GUEST','Late checkout?', now()) ON CONFLICT DO NOTHING;`);
  const pk = Number(sql("SELECT message_pk FROM ic.messages WHERE smoobu_message_id=9101001"));
  const [code, token] = sql(byName['Record draft'].parameters.query, [pk, 9101, 'P-BER-001', 'Draft', 'AP-DBL1', 'REVIEW', 'L3', '{}', 1, null, null]).split('|');
  const first = sql(by4['Decide approval'].parameters.query, [code, token, 'edit', 'kürzer']);
  assert.match(first, /\|EDITED\|.*\|f$/);
  const second = sql(by4['Decide approval'].parameters.query, [code, token, 'edit', 'kürzer']);
  assert.match(second, /\|EDITED\|.*\|t$/);
  assert.equal(sql(by4['Decide approval'].parameters.query, [code, 'wrong', 'edit', 'x']), '');
});

// ---------------- owner decision 08.11.2026: approved replies are really sent ----------------
test('approve: result page reports sent / not sent honestly', () => {
  assert.match(resultPage({ approval_code: 'AP-1', status: 'APPROVED', already: false }, { sent: true }), /ارسال شد/);
  const failed = resultPage({ approval_code: 'AP-1', status: 'APPROVED', already: false }, { sent: false, reason: 'stay already ended' });
  assert.match(failed, /ارسال نشد/); assert.match(failed, /stay already ended/);
});

test('send step: only through ic-send-approved, text never taken from the request', () => {
  const n = by4['Send if approved'];
  assert.match(n.parameters.url, /\/ic-send-approved$/);
  assert.equal(n.credentials.httpHeaderAuth.name, 'IC Smoobu Proxy');
  assert.doesNotMatch(n.parameters.jsonBody, /proposed_text|final_text|messageBody/);
  assert.deepEqual(wf04.connections['Decide approval'].main[0].map((c) => c.node), ['Send if approved']);
});

test('level 1–4 are never auto-sent: only level AUTO approvals are picked up', () => {
  const q = by01('Due auto replies');
  assert.match(q, /a\.level = 'AUTO'/); assert.match(q, /LIVE_SENDING/); assert.match(q, /a\.status = 'PENDING'/);
});

// ---------------- learning loop 08.11.2026: approved answers become KB facts ----------------
const learnedKb = [{ key: 'learned_late_checkout', lang: 'en', value: 'Late check-out after 11:00 is not possible because the cleaning team arrives.', verified: true }];
const lateAi = { ...base, level: 6, intent: 'LATE_CHECKOUT', reply: 'Leider ist ein späterer Check-out nicht möglich.', used_kb_keys: ['learned_late_checkout'] };

test('learned rule: a decision question answered by a learned_* fact needs no approval', () => {
  const s = src({ rule_level: 'REVIEW', rule_intent: 'LATE_CHECKOUT', kb: learnedKb });
  const d = decide(aiResp(lateAi), s);
  assert.equal(d.payload.level, 6); assert.ok(d.payload.flags.includes('LEARNED_RULE'));
  // without a learned fact the decision stays level 3
  assert.equal(decide(aiResp({ ...lateAi, used_kb_keys: [] }), s).payload.level, 3);
  // an unverified learned_* row does not count
  assert.equal(decide(aiResp(lateAi), src({ rule_level: 'REVIEW', rule_intent: 'LATE_CHECKOUT', kb: [{ ...learnedKb[0], verified: false }] })).payload.level, 3);
  // critical topics are never lowered
  assert.equal(decide(aiResp(lateAi), src({ rule_level: 'CRITICAL', rule_intent: 'REFUND', kb: learnedKb })).payload.level, 2);
  assert.match(run('Build AI request', [src()])[0].json.ai.system, /learned_/);
});

const guard = (ai, s = {}) => JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${by4['Guard learned fact'].parameters.jsCode} })`, {
  $: () => ({ all: () => [{ json: { property_id: 'P-BER-001', internal_name: 'Loft', approval_code: 'AP-L1', other_units: ['City Apartment'], ...s } }] }),
  $input: { all: () => [aiResp(ai)] }, JSON, String })()));
const okFact = { learnable: true, key: 'Late Checkout', category: 'CHECKOUT', scope: 'THIS_UNIT', fact_en: 'Late check-out after 11:00 is not possible because the cleaning team arrives.', fact_fa: 'خروج دیر ممکن نیست', reason_fa: 'قانون کلی' };

test('learn guard: stores a clean general fact under learned_* for this apartment only', () => {
  const [o] = guard(okFact);
  assert.deepEqual(o.json.p, ['P-BER-001', 'CHECKOUT', 'learned_late_checkout', okFact.fact_en, 'Freigabe AP-L1', 'THIS_UNIT']);
  assert.equal(guard({ ...okFact, scope: 'ALL_UNITS' })[0].json.p[5], 'ALL_UNITS');
  // a "house rule" that names this apartment is kept for this apartment only
  assert.equal(guard({ ...okFact, scope: 'ALL_UNITS', fact_en: 'In the Loft check-out is at 11:00.' })[0].json.p[5], 'THIS_UNIT');
});

test('learn guard: rejects not-learnable, codes, contact data, other units and money concessions', () => {
  assert.equal(guard({ ...okFact, learnable: false }).length, 0);
  for (const f of ['The key box code is 1809.', 'Call the team at +49 160 1234567 any time.', 'Write to team@example.com for help.',
                   'The City Apartment has a bigger kitchen.', 'Guests get a refund if the heating fails.', 'See https://example.com/rules for details.'])
    assert.equal(guard({ ...okFact, fact_en: f }).length, 0, f);
  assert.equal(guard({ ...okFact, key: '***' }).length, 0);
});

test('learning runs only after a real, first approval with the checkbox; page offers the checkbox', () => {
  const cond = by4['Learn?'].parameters.conditions.conditions[0].leftValue;
  assert.match(cond, /APPROVED/); assert.match(cond, /already === false/); assert.match(cond, /learn/);
  assert.deepEqual(wf04.connections['Show result'].main[0].map((c) => c.node).sort(), ['Edit requested?', 'Learn?']);
  const html = JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${by4['Confirm page'].parameters.jsCode} })`, {
    $: () => ({ first: () => ({ json: { query: { c: 'AP-1', t: 't', a: 'approve' } } }) }),
    $input: { first: () => ({ json: { approval_code: 'AP-1', proposed_text: 'x' } }) }, String })()))[0].json.html;
  assert.match(html, /name="learn" value="1" checked/);
});

test('learning SQL on the real schema: chain of instructions, VERIFIED row, never overwrites manual facts', { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, () => {
  const PG = process.env.PG_TEST_URL;
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const sql = (q, p = []) => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|', '-c', q.replace(/\$(\d+)/g, (_, i) => lit(p[i - 1]))]).toString().trim();
  sql(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (9201,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
       INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES (9201001,9201,'P-BER-001','INBOUND','GUEST','Can we check out at 14:00?', now()) ON CONFLICT DO NOTHING;`);
  const pk = Number(sql("SELECT message_pk FROM ic.messages WHERE smoobu_message_id=9201001"));
  const [c1, t1] = sql(byName['Record draft'].parameters.query, [pk, 9201, 'P-BER-001', 'Draft 1', 'AP-LRN1', 'REVIEW', 'L3', '{}', 1, null, null]).split('|');
  sql(by4['Decide approval'].parameters.query, [c1, t1, 'edit', 'nach 11 geht nicht, Reinigung kommt']);
  const parent = sql(`SELECT approval_id FROM ic.approvals WHERE approval_code='${c1}'`);
  const [c2, t2] = sql(byName['Record draft'].parameters.query, [pk, 9201, 'P-BER-001', 'Sorry, check-out after 11 is not possible.', 'AP-LRN2', 'REVIEW', 'L3', '{}', 2, parent, 'nach 11 geht nicht, Reinigung kommt']).split('|');
  assert.equal(sql(by4['Learn context'].parameters.query, [c2, t2]), '');          // not approved yet → nothing to learn
  sql(by4['Decide approval'].parameters.query, [c2, t2, 'approve', '']);
  assert.equal(sql(by4['Learn context'].parameters.query, [c2, 'wrong']), '');     // token required
  const ctx = sql(by4['Learn context'].parameters.query, [c2, t2]);
  assert.match(ctx, /Can we check out at 14:00\?/); assert.match(ctx, /Reinigung kommt/); assert.match(ctx, /not possible/);
  const save = by4['Save learned fact'].parameters.query;
  assert.match(sql(save, ['P-BER-001', 'CHECKOUT', 'learned_late_checkout', 'Late check-out after 11:00 is not possible.', 'Freigabe AP-LRN2', 'THIS_UNIT']), /learned_late_checkout.*\|f$/);
  assert.match(sql(save, ['P-BER-001', 'CHECKOUT', 'learned_late_checkout', 'Late check-out after 11:00 is not possible (cleaning).', 'Freigabe AP-LRN2', 'THIS_UNIT']), /\|t$/);
  assert.equal(sql("SELECT validity||'|'||visibility FROM ic.property_kb_entries WHERE key='learned_late_checkout'"), 'VERIFIED|PUBLIC_GUEST');
  // a manual (non learned_*) fact is never overwritten
  sql("INSERT INTO ic.property_kb_entries (property_id, category, key, language, value_text, source) VALUES ('P-BER-001','WIFI','manual_fact','en','orig','test') ON CONFLICT DO NOTHING");
  assert.equal(sql(save, ['P-BER-001', 'WIFI', 'manual_fact', 'hacked', 'Freigabe X', 'THIS_UNIT']), '');
  assert.equal(sql("SELECT value_text FROM ic.property_kb_entries WHERE key='manual_fact'"), 'orig');
  // the next draft for this apartment sees the learned fact; the other apartment does not
  sql(`INSERT INTO ic.message_classifications (message_pk, level, intent, rule_level) VALUES (${pk},'REVIEW','LATE_CHECKOUT','REVIEW')`);
  assert.match(sql(by4['Revision context'].parameters.query, [pk]), /learned_late_checkout/);
  assert.equal(sql("SELECT count(*) FROM ic.property_kb_entries WHERE key='learned_late_checkout' AND property_id<>'P-BER-001'"), '0');
  assert.equal(sql("SELECT count(*) FROM ic.audit_log WHERE action='KB_LEARNED'"), '2');
  // a team policy (ALL_UNITS) is stored for every apartment
  const n = Number(sql('SELECT count(*) FROM ic.properties'));
  assert.equal(sql(save, ['P-BER-001', 'HOUSE_RULES', 'learned_quiet_hours', 'Quiet hours are from 22:00.', 'Freigabe AP-LRN3', 'ALL_UNITS']).split('\n').length, n);
  assert.equal(sql("SELECT count(DISTINCT property_id) FROM ic.property_kb_entries WHERE key='learned_quiet_hours'"), String(n));
});


// ---------------- go-live 11.11.2026 ----------------
const PGT = process.env.PG_TEST_URL;
const litT = (v) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const sqlT = (q, p = []) => execFileSync('psql', [PGT, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '|', '-c', q.replace(/\$(\d+)/g, (_, i) => litT(p[i - 1]))]).toString().trim();

test('café tip: partner offer text, map link, no placeholders left', () => {
  const [o] = run('Render scheduled', [due({ template_code: 'CAFE_TIP', lang: 'de', pin_check: { not_pin: true } })]);
  assert.match(o.json.body, /Einstein Kaffee am Aaron-Bernstein-Platz 2/); assert.match(o.json.body, /20 % Rabatt/);
  assert.match(o.json.body, /\nhttps:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Einstein/);
  assert.doesNotMatch(o.json.body, /\{\{/);
  const [e] = run('Render scheduled', [due({ template_code: 'CAFE_TIP', lang: 'en', pin_check: { not_pin: true } })]);
  assert.match(e.json.body, /20% discount/);
});

test('money guard: a verified partner offer may be mentioned, other discounts still blocked', () => {
  const kb = [{ key: 'offer_einstein_cafe', lang: 'en', value: '20% at Einstein Kaffee', verified: true }];
  const ok = decide(aiResp({ ...base, intent: 'LOCAL_TIPS', reply: 'For breakfast try Einstein Kaffee at Aaron-Bernstein-Platz 2 – you get a 20% discount as our guest.', used_kb_keys: ['offer_einstein_cafe'] }), src({ kb }));
  assert.equal(ok.payload.level, 6); assert.ok(!ok.payload.flags.includes('MONEY_WORDS'));
  const bad = decide(aiResp({ ...base, reply: 'Einstein Kaffee is nice. We give you a discount on your stay.', used_kb_keys: ['offer_einstein_cafe'] }), src({ kb }));
  assert.equal(bad.payload.level, 2);
  const noKb = decide(aiResp({ ...base, reply: 'Einstein Kaffee gives you a discount.', used_kb_keys: [] }), src());
  assert.equal(noKb.payload.level, 2);
});

test('scheduled SQL: last-minute booking still gets arrival info + PIN; café tip next morning; nothing old', { skip: !PGT && 'PG_TEST_URL not set' }, () => {
  sqlT(`INSERT INTO ic.property_message_schedules (property_id, template_code, anchor, offset_minutes, enabled) VALUES
          ('P-BER-001','ARRIVAL_2D','CHECK_IN',-2880,true), ('P-BER-001','CAFE_TIP','CHECK_IN',1080,true), ('P-BER-001','WELCOME','BOOKING',5,true)
        ON CONFLICT (property_id, template_code) DO UPDATE SET enabled = true;
        INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, check_in_at, check_out_at, status, raw) VALUES
          -- booked 20 min ago for check-in in 4 h: the 2-day message is late → due 10 min after booking
          (8101,'P-BER-001',1,current_date,current_date+2, now() + interval '4 hours', now() + interval '2 days','CONFIRMED',
             json_build_object('created-at', to_char((now() - interval '20 minutes') AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD HH24:MI:SS'))::jsonb),
          -- old booking: 2-day message was due 2 days ago → never sent retroactively
          (8102,'P-BER-001',1,current_date,current_date+2, now() - interval '1 minute', now() + interval '2 days','CONFIRMED','{"created-at":"2026-01-01 10:00:00"}'),
          -- checked in 18 h ago → café tip due now
          (8103,'P-BER-001',1,current_date-1,current_date+2, now() - interval '18 hours 5 minutes', now() + interval '2 days','CONFIRMED','{"created-at":"2026-01-01 10:00:00"}'),
          -- check-out already passed → no café tip although 18 h after check-in
          (8104,'P-BER-001',1,current_date-1,current_date, now() - interval '18 hours 5 minutes', now() - interval '1 hour','CONFIRMED','{"created-at":"2026-01-01 10:00:00"}')
        ON CONFLICT DO NOTHING;`);
  const rows = sqlT(by01('Due scheduled'));
  assert.match(rows, /ARRIVAL_2D\|8101\|/);
  assert.match(rows, /WELCOME\|8101\|/);
  assert.doesNotMatch(rows, /ARRIVAL_2D\|8102\|/);
  assert.match(rows, /CAFE_TIP\|8103\|/);
  assert.doesNotMatch(rows, /CAFE_TIP\|8104\|/);
});

test('drafts: only the latest guest message of a conversation gets a draft', { skip: !PGT && 'PG_TEST_URL not set' }, () => {
  sqlT(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (8201,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
        INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES
          (8201001,8201,'P-BER-001','INBOUND','GUEST','No towels here', now() - interval '3 minutes'),
          (8201002,8201,'P-BER-001','INBOUND','GUEST','Also dirty dishes', now() - interval '1 minute') ON CONFLICT DO NOTHING;
        INSERT INTO ic.message_classifications (message_pk, level, intent, rule_level) SELECT message_pk,'REVIEW','CLEANING_ISSUE','REVIEW' FROM ic.messages WHERE smoobu_message_id IN (8201001,8201002);`);
  const rows = sqlT(by01('Pending drafts'));
  assert.match(rows, /Also dirty dishes/);
  assert.doesNotMatch(rows.split('\n').filter((l) => /^\d+\|8201\|/.test(l)).map((l) => l.split('|')[3]).join(' '), /No towels here$/);
  assert.equal(rows.split('\n').filter((l) => /^\d+\|8201\|/.test(l)).length, 1);
});

test('auto replies: kill switch, stop window, edit/take-over respected, newer messages win', { skip: !PGT && 'PG_TEST_URL not set' }, () => {
  sqlT(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (8301,'P-BER-001',1,current_date,current_date+2,'{}'),(8302,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
        INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES
          (8301001,8301,'P-BER-001','INBOUND','GUEST','Wifi?', now() - interval '40 minutes'),
          (8302001,8302,'P-BER-001','INBOUND','GUEST','Parking?', now() - interval '40 minutes'),
          (8302002,8302,'P-BER-001','OUTBOUND','HOST','Answered by the team', now() - interval '20 minutes') ON CONFLICT DO NOTHING;`);
  const rec = (pk, res, code, lvl, ago) => {
    sqlT(byName['Record draft'].parameters.query, [pk, res, 'P-BER-001', 'Reply', code, lvl, 'r', '{}', 1, null, null]);
    sqlT(`UPDATE ic.approvals SET requested_at = now() - interval '${ago} minutes' WHERE approval_code = '${code}'`);
  };
  const pk = (id) => Number(sqlT(`SELECT message_pk FROM ic.messages WHERE smoobu_message_id=${id}`));
  rec(pk(8301001), 8301, 'AP-AUTO1', 'AUTO', 35);
  rec(pk(8302001), 8302, 'AP-AUTO2', 'AUTO', 35);
  sqlT("UPDATE ic.settings SET value='off' WHERE key='LIVE_SENDING'");
  assert.equal(sqlT(by01('Due auto replies')), '');                         // kill switch
  sqlT("UPDATE ic.settings SET value='on' WHERE key='LIVE_SENDING'");
  sqlT("UPDATE ic.properties SET ai_auto_reply_enabled = false WHERE property_id = 'P-BER-001'");
  assert.equal(sqlT(by01('Due auto replies')), '');                         // per-apartment switch off
  sqlT("UPDATE ic.properties SET ai_auto_reply_enabled = true WHERE property_id = 'P-BER-001'");
  const out = sqlT(by01('Due auto replies'));
  assert.match(out, /^AP-AUTO1\|[0-9a-f]{64}$/);                             // AP-AUTO2: team already answered
  assert.equal(sqlT("SELECT status||'|'||final_text FROM ic.approvals WHERE approval_code='AP-AUTO1'"), 'APPROVED|Reply');
  assert.equal(sqlT(by01('Due auto replies')), '');                          // once only
  // a fresh draft (< 10 min) waits for the stop window; a REVIEW draft is never auto-sent
  sqlT(`INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES (8301002,8301,'P-BER-001','INBOUND','GUEST','Thanks!', now()) ON CONFLICT DO NOTHING`);
  rec(pk(8301002), 8301, 'AP-AUTO3', 'AUTO', 2);
  assert.equal(sqlT(by01('Due auto replies')), '');
  sqlT("UPDATE ic.approvals SET requested_at = now() - interval '30 minutes', level = 'REVIEW' WHERE approval_code = 'AP-AUTO3'");
  assert.equal(sqlT(by01('Due auto replies')), '');
  sqlT("UPDATE ic.approvals SET level = 'AUTO', status = 'TAKEN_OVER' WHERE approval_code = 'AP-AUTO3'");
  assert.equal(sqlT(by01('Due auto replies')), '');
  sqlT("UPDATE ic.settings SET value='off' WHERE key='LIVE_SENDING'");
});

test('send functions: PIN only inside Supabase, kill switch, freshness and live Smoobu re-check', () => {
  const f = fs.readFileSync(path.join(__dirname, '../supabase/functions/ic-send-scheduled/index.ts'), 'utf8');
  for (const re of [/LIVE_SENDING/, /interval '3 hours'/, /\/api\/reservations\/' \+ r\.reservation_id/, /cancel/, /RELEASE_TIME/, /replaceAll\(pin, '\*\*\*\*'\)/, /\[Video-Link fehlt\]/, /\\{\\{\[A-Z_\]\+\\}\\}/])
    assert.match(f, re);
  assert.doesNotMatch(f, /json\(200, \{[^}]*pin[,:]/);       // the PIN is never returned
  const a = fs.readFileSync(path.join(__dirname, '../supabase/functions/ic-send-approved/index.ts'), 'utf8');
  assert.match(a, /catch \(e\)/);                             // network errors do not leave QUEUED rows
});


// ---------------- monitoring 11.11.2026 ----------------
test('health check: finds missed scheduled messages, codes in the KB, and is clean again after fixing', { skip: !PGT && 'PG_TEST_URL not set' }, () => {
  sqlT(`INSERT INTO ic.property_message_schedules (property_id, template_code, anchor, offset_minutes, enabled) VALUES ('P-BER-001','CAFE_TIP','CHECK_IN',1080,true)
          ON CONFLICT (property_id, template_code) DO UPDATE SET enabled = true;
        UPDATE ic.settings SET value = to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE key = 'LIVE_SINCE';
        INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, check_in_at, check_out_at, status, raw, last_synced_at) VALUES
          (8501,'P-BER-001',1,current_date-1,current_date+2, now() - interval '19 hours', now() + interval '2 days','CONFIRMED','{"created-at":"2026-01-01 10:00:00"}', now())
        ON CONFLICT DO NOTHING;`);
  const hc = () => Object.fromEntries(sqlT('SELECT check_name, status, detail FROM ic.health_check(24)').split('\n').map((l) => { const [c, st, d] = l.split('|'); return [c, { st, d }]; }));
  let h = hc();
  for (const k of ['scheduler_running', 'scheduler_errors', 'smoobu_sync', 'scheduled_missed', 'scheduled_sent', 'replies_sent', 'drafts_created', 'waiting_for_manager', 'n8n_errors', 'kb_no_secrets', 'learning', 'live_sending', 'data_consistency', 'database_size'])
    assert.ok(h[k], k);
  assert.equal(h.scheduler_running.st, 'FAIL');                       // no ic-tick has run in the test DB
  assert.equal(h.scheduled_missed.st, 'FAIL'); assert.match(h.scheduled_missed.d, /CAFE_TIP 8501/);
  sqlT(G.SQL.RECORD_SCHEDULED, ['sched:8501:CAFE_TIP', 8501, 'P-BER-001', 'Tipp', false]);
  const after = hc().scheduled_missed.d;
  assert.doesNotMatch(after, /CAFE_TIP 8501/); assert.match(after, /ACCESS_PIN 8501/);   // the PIN message is still reported as missed
  sqlT("INSERT INTO ic.property_kb_entries (property_id, category, key, language, value_text, source, validity) VALUES ('P-BER-001','ENTRANCE','bad_row','de','Der Code für die Box ist 1809','test','VERIFIED')");
  h = hc(); assert.equal(h.kb_no_secrets.st, 'FAIL'); assert.match(h.kb_no_secrets.d, /bad_row/);
  sqlT("DELETE FROM ic.property_kb_entries WHERE key = 'bad_row'");
  assert.equal(hc().kb_no_secrets.st, 'OK');
  sqlT(`INSERT INTO ic.automation_runs (workflow, finished_at, status, summary) VALUES ('ic-tick', now(), 'SUCCESS', '{"errors":[]}')`);
  assert.equal(hc().scheduler_running.st, 'OK');
});

test('report e-mail lists only checks that are not OK', () => {
  const out = tickReport({ health: [{ check_name: 'scheduler_running', status: 'OK', detail: 'x' }, { check_name: 'scheduled_missed', status: 'FAIL', detail: '1 due but not processed: CAFE_TIP 1' }] });
  assert.equal(out.length, 1); assert.match(out[0].json.subject, /بررسی روزانه/); assert.match(out[0].json.html, /scheduled_missed/);
  assert.doesNotMatch(out[0].json.html, /scheduler_running/);
  assert.deepEqual(tickReport({ health: [{ check_name: 'a', status: 'OK', detail: '' }, { check_name: 'b', status: 'INFO', detail: '' }] }), []);
});

test('ic-tick keeps the refusal reason and runs the daily health check once a day', () => {
  const t = fs.readFileSync(path.join(__dirname, '../supabase/functions/ic-tick/index.ts'), 'utf8');
  assert.match(t, /status = 'BLOCKED'/); assert.match(t, /refused:/);
  assert.match(t, /hm >= '07:00' && hm < '07:05'/); assert.match(t, /ic\.health_check\(24\)/);
});


test('prompt: greeting and signature in the guest language; complaints get an apology, no welcome, no doubt', () => {
  const sys = run('Build AI request', [src()])[0].json.ai.system;
  assert.match(sys, /INCLUDING greeting and signature/); assert.match(sys, /Zespół ImmoCare4U/);
  assert.match(sys, /11\. COMPLAINTS/); assert.match(sys, /never write that you are unsure/);
});
