// Runs WF-01 Code nodes in a sandbox with synthetic Smoobu data (no real guest data).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const wf = require('../n8n/workflows/WF-01-smoobu-readonly-sync.json');
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

function run(name, items, outputs = {}) {
  const sb = {
    $input: { first: () => items[0], all: () => items },
    $: (n) => ({ all: () => outputs[n], first: () => outputs[n][0] }),
    JSON, Date, Number, String, Object, require, Intl,
  };
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){ ${byName[name].parameters.jsCode} })`, sb)()));
}

test('spec reservations is a read-only GET with a date window', () => {
  const [o] = run('Spec reservations', [{ json: {} }]);
  assert.equal(o.json.req.method, 'GET');
  assert.equal(o.json.req.path, '/api/reservations');
  assert.match(o.json.req.query.from, /^\d{4}-\d\d-\d\d$/);
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

test('messages: only active, mapped reservations are fetched', () => {
  const out = run('Spec messages', [
    { json: { reservation_id: '1', property_id: 'P-BER-001', status: 'CONFIRMED' } },
    { json: { reservation_id: '2', property_id: 'P-BER-001', status: 'CANCELLED' } },
    { json: { reservation_id: '3', property_id: null, status: 'CONFIRMED' } },
  ]);
  assert.deepEqual(out.map((o) => o.json.req.path), ['/api/reservations/1/messages']);
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

test('WF-01 uses only the read-only proxy', () => {
  const others = wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest' && !x.name.startsWith('Smoobu')).map((x) => x.parameters.url);
  assert.deepEqual(others.sort(), ['https://api.anthropic.com/v1/messages', 'https://bkqtruzcrypiudhgzmhs.supabase.co/functions/v1/ic-access-pin']);
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest' && x.name.startsWith('Smoobu'))) {
    assert.match(n.parameters.url, /smoobu-proxy$/);
  }
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
  assert.equal(sql(by4['Decide approval'].parameters.query, ['AP-T1', token, 'edit', ' ']), '');
  // edit with instruction
  const row = sql(by4['Decide approval'].parameters.query, ['AP-T1', token, 'edit', 'kürzer bitte']);
  assert.match(row, /EDITED/); assert.ok(row.endsWith('|' + pk));
  // second click on the same link does nothing
  assert.equal(sql(by4['Decide approval'].parameters.query, ['AP-T1', token, 'approve', '']), '');
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

test('scheduled: digest masks PIN and only lists newly recorded items', () => {
  const rendered = run('Render scheduled', [{ json: { ...due().json, pin_check: { ok: true } } }, { json: { ...due({ reservation_id: 12, template_code: 'WELCOME' }).json, pin_check: {} } }]);
  const out = run('Scheduled digest', [{ json: { idempotency_key: 'sched:11:ACCESS_PIN' } }, { json: {} }], { 'Render scheduled': rendered });
  assert.equal(out.length, 1);
  assert.match(out[0].json.subject, /\(1\)/);
  assert.match(out[0].json.html, /••••/);
  assert.ok(!out[0].json.html.includes('{{PIN}}'));
  assert.deepEqual(run('Scheduled digest', [{ json: {} }], { 'Render scheduled': rendered }), []);
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
  const rows = sql(byName['Due scheduled'].parameters.query);
  assert.match(rows, /ACCESS_PIN\|8001\|/);
  assert.doesNotMatch(rows, /\|8002\|/);   // cancelled
  assert.doesNotMatch(rows, /\|8003\|/);   // not due yet
  assert.match(rows, /\|en\|/);
  const p = ['sched:8001:ACCESS_PIN', 8001, 'P-BER-001', 'Code: {{PIN}}', true];
  assert.equal(sql(byName['Record scheduled'].parameters.query, p), 'sched:8001:ACCESS_PIN');
  assert.equal(sql(byName['Record scheduled'].parameters.query, p), '');
  assert.doesNotMatch(sql(byName['Due scheduled'].parameters.query), /\|8001\|/);
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
test('policy: acknowledgement answerable from our data → level 6, no approval button', () => {
  const ack = { ...base, intent: 'KEY_RETURNED_CHECKOUT', reply: 'Vielen Dank und gute Heimreise!', used_kb_keys: [] };
  const { payload } = decide(aiResp(ack), src({ rule_level: 'REVIEW', rule_intent: 'UNKNOWN', rule_flags: 'NO_RULE_MATCH' }));
  assert.equal(payload.level, 6);
  const e = render(payload);
  assert.ok(!/a=approve/.test(e.html));
  assert.match(e.html, /a=edit/);
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
