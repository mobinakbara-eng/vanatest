#!/usr/bin/env node
/**
 * Generates importable n8n workflow JSON from templates + the tested libraries
 * in n8n/lib, so Code-node logic never drifts from the unit-tested source.
 *
 *   node n8n/build-workflows.js      → writes n8n/workflows/*.json
 *
 * Architecture (n8n Cloud Starter has no Variables/env):
 *   Smoobu API calls → Supabase Edge Function `smoobu-proxy` (holds SMOOBU_API_KEY/SECRET, signs HMAC)
 *   Smoobu webhooks  → Supabase Edge Function `smoobu-webhook` (checks URL token) → n8n WF-02
 * n8n credentials (names must match):
 *   "ImmoCare4U Postgres"  (Postgres, role n8n_app)
 *   "IC Smoobu Proxy"      (Header Auth: x-ic-proxy-token)
 *   "IC Webhook Gate"      (Header Auth: x-ic-webhook-token)
 */
const fs = require('fs');
const path = require('path');

const lib = (name) => fs.readFileSync(path.join(__dirname, 'lib', name), 'utf8')
  .replace(/\/\/ @export-start[\s\S]*?\/\/ @export-end\n?/, '');
const CLASSIFIER = lib('classifier.js');


const CRED_IDS = (() => { try { return JSON.parse(process.env.IC_N8N_CRED_IDS || '{}'); } catch { return {}; } })();
const cred = (type, name) => ({ [type]: { id: CRED_IDS[name] || 'REPLACE_WITH_CREDENTIAL_ID', name } });
const PG_CRED = cred('postgres', 'ImmoCare4U Postgres');
const PROXY_URL = process.env.IC_PROXY_URL || 'https://bkqtruzcrypiudhgzmhs.supabase.co/functions/v1/smoobu-proxy';

let pos = 0;
const node = (name, type, typeVersion, parameters, extra = {}) =>
  ({ id: cryptoId(name), name, type, typeVersion, position: [(pos++) * 260, extra.y || 300], parameters, ...strip(extra) });
function strip(o) { const { y, ...r } = o; return r; }
function cryptoId(s) { return require('crypto').createHash('md5').update(s).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'); }

const pg = (name, query, replacement, extra = {}) => node(name, 'n8n-nodes-base.postgres', 2.5, {
  operation: 'executeQuery', query, options: { queryReplacement: replacement },
}, { credentials: PG_CRED, ...extra });

// Calls the Supabase smoobu-proxy; it always answers {statusCode, rateLimit, body}.
const http = (name, extra = {}) => node(name, 'n8n-nodes-base.httpRequest', 4.2, {
  method: 'POST',
  url: PROXY_URL,
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.req) }}',
  options: { timeout: 20000 },
}, { credentials: cred('httpHeaderAuth', 'IC Smoobu Proxy'), retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, ...extra });

const code = (name, js, extra = {}) => node(name, 'n8n-nodes-base.code', 2, { jsCode: js }, extra);

const connect = (pairs) => {
  const c = {};
  for (const [from, to, out = 0] of pairs) {
    c[from] = c[from] || { main: [] };
    while (c[from].main.length <= out) c[from].main.push([]);
    c[from].main[out].push({ node: to, type: 'main', index: 0 });
  }
  return c;
};

const signerCode = (buildReq) => `return $input.all().map((item) => {
  const spec = (${buildReq})(item.json);
  return { json: { ...item.json, req: { method: spec.method || 'GET', path: spec.path, query: spec.query || null } } };
});`;

// ======================================================================
// WF-00 — Smoobu connectivity test (Phase 1 acceptance: HMAC auth works)
// ======================================================================
function wf00() {
  pos = 0;
  const nodes = [
    node('Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, {}),
    // Remote test trigger (protected by Header Auth) so WF-00 can be run without the UI.
    node('Test Webhook', 'n8n-nodes-base.webhook', 2, {
      httpMethod: 'POST', path: 'ic/wf00-test', authentication: 'headerAuth', responseMode: 'lastNode', options: {},
    }, { webhookId: cryptoId('ic-wf00-test'), credentials: cred('httpHeaderAuth', 'IC Webhook Gate'), y: 500 }),
    code('Request GET /api/apartments', signerCode(`() => ({ method: 'GET', path: '/api/apartments' })`)),
    http('Smoobu GET apartments'),
    code('Evaluate', `const r = $input.first().json;
const ok = r.statusCode === 200 && !r.error;
const apartments = ok ? (r.body.apartments || []) : [];
return [{ json: {
  check: 'SMOOBU_API_HMAC',
  passed: ok,
  statusCode: r.statusCode,
  rateLimitRemaining: r.rateLimit && r.rateLimit.remaining,
  proxyError: r.error || null,
  apartmentCount: apartments.length,
  apartments: apartments.map(a => ({ smoobu_apartment_id: a.id, name: a.name })),
  hint: ok ? 'Map each smoobu_apartment_id to a property_id in ic.properties' :
    'Check Supabase secrets SMOOBU_API_KEY/SMOOBU_API_SECRET and that the key has HMAC enabled'
}}];`),
    pg('Record result', `UPDATE ic.integrations SET status = CASE WHEN $1::boolean THEN 'EXISTING'::ic.impl_status ELSE status END,
  verified_at = CASE WHEN $1::boolean THEN now() ELSE verified_at END, notes = $2 WHERE integration_code = 'SMOOBU_API_HMAC'
RETURNING integration_code, status, verified_at, notes;`,
    `={{ [ $json.passed, 'WF-00 run ' + $now.toISO() + ' → HTTP ' + $json.statusCode + ', apartments: ' + $json.apartmentCount ] }}`),
  ];
  return {
    name: 'WF-00 — Smoobu Connectivity Test',
    nodes,
    connections: connect([
      ['Manual Trigger', 'Request GET /api/apartments'],
      ['Test Webhook', 'Request GET /api/apartments'],
      ['Request GET /api/apartments', 'Smoobu GET apartments'],
      ['Smoobu GET apartments', 'Evaluate'],
      ['Evaluate', 'Record result'],
    ]),
    settings: { executionOrder: 'v1' },
    meta: { status: 'REQUIRES_VERIFICATION', generatedBy: 'n8n/build-workflows.js' },
  };
}

// ======================================================================
// WF-02 — Guest Message & Reservation Webhook Receiver (Phase 1/2, TEST MODE)
//   receive → authenticate → idempotent inbox → 200 → fetch truth from Smoobu
//   → upsert reservation → (newMessage) store message + rule classification
//   Sends NOTHING to guests. Reply generation is WF-03.
// ======================================================================
function wf02() {
  pos = 0;
  const nodes = [
    node('Smoobu Webhook', 'n8n-nodes-base.webhook', 2, {
      httpMethod: 'POST', path: 'smoobu/inbound', authentication: 'headerAuth', responseMode: 'responseNode', options: {},
    }, { webhookId: cryptoId('smoobu-inbound'), credentials: cred('httpHeaderAuth', 'IC Webhook Gate') }),

    code('Authenticate & Key', `const crypto = require('crypto');
// Caller authenticity is enforced by the Webhook node (Header Auth "IC Webhook Gate"),
// which only the Supabase smoobu-webhook function knows. Here we validate the payload.
const item = $input.first().json;
const valid = true;
const body = item.body || {};
const action = String(body.action || '');
const data = body.data || {};
const known = ['newReservation','updateReservation','cancelReservation','deleteReservation','newMessage','onlineCheckInUpdate','updateRates'];
const raw = JSON.stringify(body);
const sha = crypto.createHash('sha256').update(raw).digest('hex');
// newMessage: message id is unique. Reservation events repeat per reservation → include payload hash.
const key = action === 'newMessage' ? 'smoobu:newMessage:' + data.id : 'smoobu:' + action + ':' + data.id + ':' + sha.slice(0, 16);
const reservationId = action === 'newMessage' ? (data.booking && data.booking.id) : data.id;
return [{ json: { valid: valid && known.includes(action) && !!data.id, action, data, raw, sha, key, reservationId,
  sender: data.sender || null } }];`),

    node('Valid?', 'n8n-nodes-base.if', 2, {
      conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 1 },
        conditions: [{ id: 'v', leftValue: '={{ $json.valid }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and' }, options: {},
    }),

    node('Respond 401', 'n8n-nodes-base.respondToWebhook', 1.1, {
      respondWith: 'json', responseBody: '={"ok":false}', options: { responseCode: 401 },
    }, { y: 500 }),

    pg('Inbox (idempotent)', `INSERT INTO ic.webhook_events (source, action, idempotency_key, payload, payload_sha256)
VALUES ('smoobu', $1, $2, $3::jsonb, $4)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING event_id;`,
    `={{ [ $json.action, $json.key, $json.raw, $json.sha ] }}`, { alwaysOutputData: true }),

    node('Respond 200', 'n8n-nodes-base.respondToWebhook', 1.1, {
      respondWith: 'json', responseBody: '={"ok":true}', options: { responseCode: 200 },
    }),

    node('New event?', 'n8n-nodes-base.if', 2, {
      conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 1 },
        conditions: [{ id: 'n', leftValue: '={{ $json.event_id }}', rightValue: '', operator: { type: 'number', operation: 'exists', singleValue: true } }],
        combinator: 'and' }, options: {},
    }),

    code('Request GET reservation', signerCode(`() => ({ method: 'GET', path: '/api/reservations/' + encodeURIComponent($('Authenticate & Key').first().json.reservationId) })`)),
    http('Smoobu GET reservation'),

    code('Normalize reservation', `const ev = $('Authenticate & Key').first().json;
const eventId = $('Inbox (idempotent)').first().json.event_id;
const r = $input.first().json;
let res = r.statusCode === 200 ? r.body : null;
if (!res && ev.action === 'newMessage') {
  throw new Error('Reservation ' + ev.reservationId + ' not retrievable (HTTP ' + r.statusCode + ')');
}
// Deleted reservations may 404 → fall back to webhook data
res = res || ev.data;
const statusMap = { cancelReservation: 'CANCELLED', deleteReservation: 'DELETED' };
let status = statusMap[ev.action] || (String(res.type || '').toLowerCase().includes('cancel') ? 'CANCELLED'
  : String(res.type || '').toLowerCase().includes('modification') ? 'MODIFIED' : 'CONFIRMED');
if (res['is-blocked-booking']) status = 'BLOCKED';
// Data minimisation: keep PII out of the raw copy
const PII = ['email','phone','address','guest-name','firstname','lastname','notice','assistantNotice'];
const raw = Object.fromEntries(Object.entries(res).filter(([k]) => !PII.includes(k)));
return [{ json: {
  eventId, action: ev.action,
  p: [ Number(res.id || ev.reservationId), Number((res.apartment && res.apartment.id) || 0),
       (res.channel && res.channel.name) || null, res['reference-id'] || null,
       res.arrival, res.departure, res.adults ?? null, res.children ?? null,
       status, !!res['is-blocked-booking'], res.price ?? null, JSON.stringify(raw) ]
}}];`),

    pg('Upsert reservation', `INSERT INTO ic.reservations AS r (reservation_id, property_id, smoobu_apartment_id, channel_name, reference_id,
  arrival, departure, check_in_at, check_out_at, adults, children, status, is_blocked_period, price_total, raw, last_synced_at)
SELECT $1::bigint, p.property_id, $2::bigint, $3, $4, $5::date, $6::date,
  CASE WHEN p.check_in_time  IS NOT NULL THEN ($5::date + p.check_in_time)  AT TIME ZONE p.timezone END,
  CASE WHEN p.check_out_time IS NOT NULL THEN ($6::date + p.check_out_time) AT TIME ZONE p.timezone END,
  $7::int, $8::int, $9, $10::boolean, $11::numeric, $12::jsonb, now()
FROM (SELECT 1) one LEFT JOIN ic.properties p ON p.smoobu_apartment_id = $2::bigint
ON CONFLICT (reservation_id) DO UPDATE SET
  property_id = EXCLUDED.property_id, channel_name = EXCLUDED.channel_name, reference_id = EXCLUDED.reference_id,
  arrival = EXCLUDED.arrival, departure = EXCLUDED.departure, check_in_at = EXCLUDED.check_in_at,
  check_out_at = EXCLUDED.check_out_at, adults = EXCLUDED.adults, children = EXCLUDED.children,
  status = EXCLUDED.status, is_blocked_period = EXCLUDED.is_blocked_period, price_total = EXCLUDED.price_total,
  raw = EXCLUDED.raw, last_synced_at = now()
RETURNING reservation_id, property_id, status;`, `={{ $json.p }}`),

    node('Is message?', 'n8n-nodes-base.if', 2, {
      conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 1 },
        conditions: [{ id: 'm', leftValue: "={{ $('Authenticate & Key').first().json.action }}", rightValue: 'newMessage', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and' }, options: {},
    }),

    code('Request GET messages', signerCode(`() => ({ method: 'GET', path: '/api/reservations/' + encodeURIComponent($('Authenticate & Key').first().json.reservationId) + '/messages' })`)),
    http('Smoobu GET messages'),

    code('Pick & classify message', `${CLASSIFIER}
const ev = $('Authenticate & Key').first().json;
const resv = $('Upsert reservation').first().json;
const r = $input.first().json;
if (r.statusCode !== 200) throw new Error('Messages fetch failed HTTP ' + r.statusCode);
const list = (r.body && (r.body.messages || r.body.data)) || [];
const msg = list.find(m => String(m.id) === String(ev.data.id));
if (!msg) throw new Error('Message ' + ev.data.id + ' not found in reservation ' + ev.reservationId);
const text = String(msg.message || msg.htmlMessage || '').replace(/<[^>]+>/g, ' ').trim();
// REQUIRES_VERIFICATION: Smoobu sender field / type mapping (webhook example shows sender:"guest")
const isGuest = String(ev.sender || '').toLowerCase() === 'guest';
const rule = isGuest ? classifyByRules(text) : null;
return [{ json: {
  p: [ Number(msg.id), Number(ev.reservationId), resv.property_id, isGuest ? 'INBOUND' : 'OUTBOUND',
       isGuest ? 'GUEST' : 'HOST', msg.subject || null, text, msg.createdAt || null,
       rule ? rule.level : null, rule ? rule.intent : null, rule ? '{' + rule.matchedRules.join(',') + '}' : null,
       rule ? rule.flags.join(',') : null ],
  unmappedProperty: !resv.property_id,
  level: rule && rule.level, intent: rule && rule.intent, flags: rule && rule.flags,
}}];`),

    pg('Store message + classification', `WITH m AS (
  INSERT INTO ic.messages (smoobu_message_id, reservation_id, property_id, direction, sender, subject, body, sent_at)
  VALUES ($1::bigint, $2::bigint, $3, $4::ic.msg_direction, $5, $6, $7, $8::timestamptz)
  ON CONFLICT (smoobu_message_id) DO NOTHING
  RETURNING message_pk
)
INSERT INTO ic.message_classifications (message_pk, level, intent, rule_level, matched_rules, reason)
SELECT message_pk,
       -- Unmapped property ⇒ never auto: force REVIEW at minimum
       CASE WHEN $3 IS NULL AND $9 = 'AUTO' THEN 'REVIEW' ELSE $9 END::ic.msg_level,
       $10, $9::ic.msg_level, $11::text[], coalesce($12, '') || CASE WHEN $3 IS NULL THEN ',UNMAPPED_PROPERTY' ELSE '' END
FROM m WHERE $9 IS NOT NULL
RETURNING message_pk, level, intent;`, `={{ $json.p }}`, { alwaysOutputData: true }),

    pg('Mark event DONE', `UPDATE ic.webhook_events SET process_status = 'DONE', processed_at = now(), attempts = attempts + 1
WHERE event_id = $1::bigint RETURNING event_id, process_status;`,
    `={{ [ $('Inbox (idempotent)').first().json.event_id ] }}`),
  ];

  return {
    name: 'WF-02 — Smoobu Webhook Receiver (TEST MODE)',
    nodes,
    connections: connect([
      ['Smoobu Webhook', 'Authenticate & Key'],
      ['Authenticate & Key', 'Valid?'],
      ['Valid?', 'Inbox (idempotent)', 0],
      ['Valid?', 'Respond 401', 1],
      ['Inbox (idempotent)', 'Respond 200'],
      ['Respond 200', 'New event?'],
      ['New event?', 'Request GET reservation', 0],
      ['Request GET reservation', 'Smoobu GET reservation'],
      ['Smoobu GET reservation', 'Normalize reservation'],
      ['Normalize reservation', 'Upsert reservation'],
      ['Upsert reservation', 'Is message?'],
      ['Is message?', 'Request GET messages', 0],
      ['Is message?', 'Mark event DONE', 1],
      ['Request GET messages', 'Smoobu GET messages'],
      ['Smoobu GET messages', 'Pick & classify message'],
      ['Pick & classify message', 'Store message + classification'],
      ['Store message + classification', 'Mark event DONE'],
    ]),
    // Failures go to WF-14 (set its workflow id after import), which writes ic.dead_letter_events.
    settings: { executionOrder: 'v1', errorWorkflow: 'REPLACE_WITH_WF14_ID', saveDataErrorExecution: 'all' },
    meta: { status: 'PLANNED', generatedBy: 'n8n/build-workflows.js' },
  };
}

// ======================================================================
// WF-14 (minimal) — Error handler → dead letter queue
// ======================================================================
function wf14() {
  pos = 0;
  return {
    name: 'WF-14 — Error Monitor (DLQ, minimal)',
    nodes: [
      node('Error Trigger', 'n8n-nodes-base.errorTrigger', 1, {}),
      pg('Write dead letter', `INSERT INTO ic.dead_letter_events (workflow, ref_table, ref_id, payload, error)
VALUES ($1, 'n8n_execution', $2, $3::jsonb, $4) RETURNING dlq_id;`,
      `={{ [ $json.workflow.name, String($json.execution.id), JSON.stringify({ url: $json.execution.url, lastNode: $json.execution.lastNodeExecuted }), String($json.execution.error && $json.execution.error.message) ] }}`),
      // Telegram alert node is added in Phase 2 once the bot credential exists.
    ],
    connections: connect([['Error Trigger', 'Write dead letter']]),
    settings: { executionOrder: 'v1' },
    meta: { status: 'PLANNED', generatedBy: 'n8n/build-workflows.js' },
  };
}

const outDir = path.join(__dirname, 'workflows');
fs.mkdirSync(outDir, { recursive: true });
for (const [file, wf] of [['WF-00-smoobu-connectivity-test.json', wf00()],
                          ['WF-02-smoobu-webhook-receiver.json', wf02()],
                          ['WF-14-error-monitor-minimal.json', wf14()]]) {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(wf, null, 2) + '\n');
  console.log('wrote', file, `(${wf.nodes.length} nodes)`);
}
