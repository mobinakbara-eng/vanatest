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
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
    assert.match(n.parameters.url, /smoobu-proxy$/);
  }
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(n.parameters.jsCode), n.name);
  }
});
