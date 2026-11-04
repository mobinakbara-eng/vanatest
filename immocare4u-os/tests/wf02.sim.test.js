/**
 * Simulates WF-02 end-to-end without n8n:
 *  - Code nodes run in a vm sandbox with n8n-like globals ($input, $env, $, require)
 *  - Postgres nodes run their exact SQL against a real database via psql,
 *    with parameters formatted as literals (as n8n/pg-promise does)
 *  - Smoobu HTTP responses are mocked
 *
 * Requires: PG_TEST_URL (e.g. postgresql://postgres@/t2?host=/var/tmp/icpg&port=5499),
 * migration + seed applied. Skipped when PG_TEST_URL is unset.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const wf = require('../n8n/workflows/WF-02-smoobu-webhook-receiver.json');

const PG = process.env.PG_TEST_URL;
const TOKEN = 'x'.repeat(40);
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sql(nodeName, params) {
  let q = byName[nodeName].parameters.query;
  q = q.replace(/\$(\d+)/g, (_, i) => lit(params[Number(i) - 1]));
  const out = execFileSync('psql', [PG, '-v', 'ON_ERROR_STOP=1', '-qtA', '-F', '\t', '-c', q]).toString().trim();
  return out ? out.split('\n').map((l) => l.split('\t')) : [];
}

function runCode(nodeName, inputJson, outputs) {
  const sandbox = {
    $input: { first: () => ({ json: inputJson }), all: () => [{ json: inputJson }] },
    $vars: { SMOOBU_WEBHOOK_TOKEN: TOKEN, SMOOBU_API_KEY: 'k', SMOOBU_API_SECRET: 's' },
    $: (n) => ({ first: () => ({ json: outputs[n] }) }),
    require, Buffer, JSON, console,
  };
  const fn = vm.runInNewContext(`(function(){ ${byName[nodeName].parameters.jsCode} })`, sandbox);
  return fn()[0].json;
}

function evalParams(nodeName, json, outputs) {
  const expr = byName[nodeName].parameters.options.queryReplacement.replace(/^=\{\{([\s\S]*)\}\}$/, '$1');
  return vm.runInNewContext(expr, { $json: json, $: (n) => ({ first: () => ({ json: outputs[n] }) }) });
}

function simulate(body, mocks, query = {}) {
  const o = {};
  o['Authenticate & Key'] = runCode('Authenticate & Key', { body, query }, o);
  if (!o['Authenticate & Key'].valid) return { status: 401, o };
  const ins = sql('Inbox (idempotent)', evalParams('Inbox (idempotent)', o['Authenticate & Key'], o));
  o['Inbox (idempotent)'] = ins.length ? { event_id: Number(ins[0][0]) } : {};
  if (!ins.length) return { status: 200, duplicate: true, o };
  const specRes = runCode('Request GET reservation', o['Inbox (idempotent)'], o);
  assert.match(specRes.req.path, /^\/api\/reservations\/\d+$/);
  assert.equal(specRes.req.method, 'GET');
  o['Normalize reservation'] = runCode('Normalize reservation', mocks.reservation, o);
  const up = sql('Upsert reservation', o['Normalize reservation'].p);
  o['Upsert reservation'] = { reservation_id: up[0][0], property_id: up[0][1] || null, status: up[0][2] };
  if (o['Authenticate & Key'].action === 'newMessage') {
    const specMsg = runCode('Request GET messages', o['Upsert reservation'], o);
    assert.match(specMsg.req.path, /^\/api\/reservations\/\d+\/messages$/);
    o['Pick & classify message'] = runCode('Pick & classify message', mocks.messages, o);
    o['Store message + classification'] = sql('Store message + classification', o['Pick & classify message'].p);
  }
  sql('Mark event DONE', evalParams('Mark event DONE', {}, o));
  return { status: 200, o };
}

const reservation = (id, apt, extra = {}) => ({ statusCode: 200, body: {
  id, 'reference-id': 'HM' + id, type: 'reservation', arrival: '2026-12-10', departure: '2026-12-12',
  apartment: { id: apt, name: 'Test' }, channel: { id: 1, name: 'Airbnb' }, 'guest-name': 'Max Mustermann',
  email: 'max@example.com', phone: '+49 000', adults: 2, children: 0, price: 240, 'is-blocked-booking': false, ...extra } });

test('WF-02 simulation', { skip: !PG && 'PG_TEST_URL not set' }, async (t) => {
  execFileSync('psql', [PG, '-qc', "UPDATE ic.properties SET smoobu_apartment_id = 777001 WHERE property_id = 'P-BER-001'"]);

  await t.test('webhook node enforces header auth; unknown action rejected', () => {
    const wh = byName['Smoobu Webhook'];
    assert.equal(wh.parameters.authentication, 'headerAuth');
    assert.equal(wh.credentials.httpHeaderAuth.name, 'IC Webhook Gate');
    assert.equal(simulate({ action: 'dropDatabase', data: { id: 1 } }, {}).status, 401);
  });

  await t.test('all Smoobu calls go through the authenticated proxy', () => {
    const https = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    assert.ok(https.length >= 2);
    for (const n of https) {
      assert.match(n.parameters.url, /\/functions\/v1\/smoobu-proxy$/);
      assert.equal(n.credentials.httpHeaderAuth.name, 'IC Smoobu Proxy');
    }
    assert.ok(!JSON.stringify(wf).includes('SMOOBU_API_SECRET'));
  });

  await t.test('newMessage → reservation upserted, message stored, classified, PII stripped', () => {
    const body = { action: 'newMessage', user: 7, data: { id: 50001, sender: 'guest', booking: { id: 880001 } } };
    const r = simulate(body, { reservation: reservation(880001, 777001),
      messages: { statusCode: 200, body: { messages: [{ id: 50001, subject: 'Q', message: 'What is the Wi-Fi password?' }] } } });
    assert.equal(r.status, 200);
    assert.equal(r.o['Upsert reservation'].property_id, 'P-BER-001');
    assert.deepEqual(r.o['Store message + classification'][0].slice(1), ['AUTO', 'WIFI']);
    const row = execFileSync('psql', [PG, '-qtA', '-c', "SELECT raw ? 'email', raw ? 'guest-name', to_char(check_in_at AT TIME ZONE 'Europe/Berlin','HH24:MI') FROM ic.reservations WHERE reservation_id=880001"]).toString().trim();
    assert.equal(row, 'f|f|15:00');
  });

  await t.test('duplicate webhook is processed once', () => {
    const body = { action: 'newMessage', user: 7, data: { id: 50001, sender: 'guest', booking: { id: 880001 } } };
    const r = simulate(body, {});
    assert.equal(r.duplicate, true);
    const n = execFileSync('psql', [PG, '-qtA', '-c', 'SELECT count(*) FROM ic.messages WHERE smoobu_message_id=50001']).toString().trim();
    assert.equal(n, '1');
  });

  await t.test('refund message on unmapped apartment → CRITICAL, flagged UNMAPPED_PROPERTY', () => {
    const body = { action: 'newMessage', user: 7, data: { id: 50002, sender: 'guest', booking: { id: 880002 } } };
    const r = simulate(body, { reservation: reservation(880002, 999999),
      messages: { statusCode: 200, body: { messages: [{ id: 50002, message: 'I want a full refund.' }] } } });
    assert.equal(r.o['Upsert reservation'].property_id, null);
    const reason = execFileSync('psql', [PG, '-qtA', '-c', "SELECT level||'|'||reason FROM ic.message_classifications c JOIN ic.messages m USING (message_pk) WHERE m.smoobu_message_id=50002"]).toString().trim();
    assert.equal(reason, 'CRITICAL|,UNMAPPED_PROPERTY');
  });

  await t.test('unmapped apartment + AUTO intent is forced to REVIEW', () => {
    const body = { action: 'newMessage', user: 7, data: { id: 50003, sender: 'guest', booking: { id: 880002 } } };
    simulate(body, { reservation: reservation(880002, 999999),
      messages: { statusCode: 200, body: { messages: [{ id: 50003, message: 'What time is check-out?' }] } } });
    const lvl = execFileSync('psql', [PG, '-qtA', '-c', "SELECT level FROM ic.message_classifications c JOIN ic.messages m USING (message_pk) WHERE m.smoobu_message_id=50003"]).toString().trim();
    assert.equal(lvl, 'REVIEW');
  });

  await t.test('cancelReservation (404 on fetch) → status CANCELLED from webhook data', () => {
    const body = { action: 'cancelReservation', user: 7, data: { id: 880001, arrival: '2026-12-10', departure: '2026-12-12', apartment: { id: 777001 } } };
    const r = simulate(body, { reservation: { statusCode: 404, body: {} } });
    assert.equal(r.o['Upsert reservation'].status, 'CANCELLED');
  });

  await t.test('host message stored as OUTBOUND without classification', () => {
    const body = { action: 'newMessage', user: 7, data: { id: 50004, sender: 'host', booking: { id: 880001 } } };
    simulate(body, { reservation: reservation(880001, 777001),
      messages: { statusCode: 200, body: { messages: [{ id: 50004, message: 'Hi, I will call you.' }] } } });
    const row = execFileSync('psql', [PG, '-qtA', '-c', "SELECT direction||'|'||(SELECT count(*) FROM ic.message_classifications c WHERE c.message_pk=m.message_pk) FROM ic.messages m WHERE smoobu_message_id=50004"]).toString().trim();
    assert.equal(row, 'OUTBOUND|0');
  });
});
