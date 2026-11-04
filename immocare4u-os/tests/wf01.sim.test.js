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
    JSON, Date, Number, String, Object, require,
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
  assert.deepEqual(others, ['https://api.anthropic.com/v1/messages']);
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest' && x.name.startsWith('Smoobu'))) {
    assert.match(n.parameters.url, /smoobu-proxy$/);
  }
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(n.parameters.jsCode), n.name);
  }
});

// ---------------- drafting (WF-03 inline) ----------------
const { execFileSync } = require('node:child_process');
const aiResp = (obj) => ({ json: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] } });
const src = (o = {}) => ({ json: { message_pk: 5, reservation_id: 9, property_id: 'P-BER-001', body: 'x', internal_name: 'Loft',
  rule_level: 'AUTO', rule_intent: 'WIFI', rule_flags: '', channel_name: 'Airbnb', arrival: '2026-11-10', departure: '2026-11-12',
  kb: [{ key: 'faq_wifi', lang: 'de', value: 'MagentaWLAN-X382', verified: false }], ...o } });
const base = { level: 6, intent: 'WIFI', confidence: 0.95, language: 'de', reply: 'Das WLAN heißt MagentaWLAN-X382.', used_kb_keys: ['faq_wifi'], needs_human: false, flags: [], summary_fa: 'سؤال درباره وای‌فای' };

test('decide: FAQ stays level 6 but flags unverified KB', () => {
  const [o] = run('Decide level & email', [aiResp(base)], { 'Build AI request': [src()] });
  assert.equal(o.json.level, 6);
  assert.match(o.json.html, /UNGEPRÜFTE/);
  assert.match(o.json.subject, /^\[IC\]\[L6\]/);
});

test('decide: rule CRITICAL wins over AI level 6', () => {
  const [o] = run('Decide level & email', [aiResp(base)], { 'Build AI request': [src({ rule_level: 'CRITICAL', rule_intent: 'REFUND' })] });
  assert.equal(o.json.level, 2);
});

test('decide: codes are stripped from drafts and level raised', () => {
  const [o] = run('Decide level & email', [aiResp({ ...base, reply: 'Der Code für den Safe ist 1969.' })], { 'Build AI request': [src()] });
  assert.ok(!o.json.html.includes('1969'));
  assert.equal(o.json.level, 2);
});

test('decide: invalid AI output → level 4, no crash, guest text escaped', () => {
  const [o] = run('Decide level & email', [{ json: { content: [{ type: 'text', text: 'not json' }] } }], { 'Build AI request': [src({ body: '<script>x</script>' })] });
  assert.equal(o.json.level, 4);
  assert.ok(!o.json.html.includes('<script>'));
});

test('drafting SQL runs on the real schema and is idempotent', { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, () => {
  const PG = process.env.PG_TEST_URL;
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  const sql = (q, p = []) => execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', q.replace(/\$(\d+)/g, (_, i) => lit(p[i - 1]))]).toString().trim();
  sql(`INSERT INTO ic.reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, raw) VALUES (7001,'P-BER-001',1,current_date,current_date+2,'{}') ON CONFLICT DO NOTHING;
       INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, body, sent_at) VALUES (7001001,7001,'P-BER-001','INBOUND','GUEST','Wifi?', now()) ON CONFLICT DO NOTHING;
       INSERT INTO ic.message_classifications (message_pk, level, intent, rule_level) SELECT message_pk,'AUTO','WIFI','AUTO' FROM ic.messages WHERE smoobu_message_id=7001001;`);
  const pending = sql(byName['Pending drafts'].parameters.query);
  assert.match(pending, /Wifi\?/);
  const pk = Number(sql("SELECT message_pk FROM ic.messages WHERE smoobu_message_id=7001001"));
  const p = [pk, 7001, 'P-BER-001', 'Hallo', 'AP-TEST1', 'AUTO', 'L6 WIFI'];
  assert.equal(sql(byName['Record draft'].parameters.query, p), 'AP-TEST1');
  assert.equal(sql(byName['Record draft'].parameters.query, [...p.slice(0, 4), 'AP-TEST2', ...p.slice(5)]), '');
  assert.doesNotMatch(sql(byName['Pending drafts'].parameters.query), /Wifi\?/);
});
