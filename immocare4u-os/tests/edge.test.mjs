// Cross-checks the Edge Function signer (WebCrypto) against the n8n signer (node:crypto).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { sign, routeAllowed, safeEqual } from '../supabase/functions/_shared/smoobu-sign.mjs';
const require = createRequire(import.meta.url);
const { smoobuSign } = require('../n8n/lib/smoobu-hmac.js');

const base = { apiKey: 'KEY123', apiSecret: 'SECRET456', timestamp: '2026-04-01T12:00:00Z', nonce: '550e8400-e29b-41d4-a716-446655440000' };

test('edge signer == n8n signer (GET with query)', async () => {
  const p = { ...base, method: 'GET', path: '/api/reservations', query: { to: '2026-04-10', from: '2026-04-01' } };
  const a = await sign(p), b = smoobuSign({ ...p, crypto });
  assert.equal(a.headers['X-Signature'], b.headers['X-Signature']);
  assert.equal(a.url, b.url);
});

test('edge signer == n8n signer (POST body, unicode)', async () => {
  const body = JSON.stringify({ subject: 'Grüße', messageBody: 'Schönen Aufenthalt ☀' });
  const p = { ...base, method: 'POST', path: '/api/reservations/1/messages/send-message-to-guest', body };
  assert.equal((await sign(p)).headers['X-Signature'], smoobuSign({ ...p, crypto }).headers['X-Signature']);
});

test('route allow-list', () => {
  assert.ok(routeAllowed('GET', '/api/reservations/123/messages').ok);
  assert.ok(routeAllowed('GET', '/api/apartments').ok);
  assert.equal(routeAllowed('DELETE', '/api/reservations/123').ok, false);
  assert.equal(routeAllowed('PUT', '/api/reservations/123').ok, false);
  assert.equal(routeAllowed('GET', '/api/reservations/../users').ok, false);
  // read-only: no write route exists, flags cannot enable one
  for (const flags of [{}, { IC_ALLOW_SEND: 'true', IC_ALLOW_WEBHOOK_ADMIN: 'true' }]) {
    assert.equal(routeAllowed('POST', '/api/reservations/1/messages/send-message-to-guest', flags).ok, false);
    assert.equal(routeAllowed('POST', '/api/users/webhooks', flags).ok, false);
    assert.equal(routeAllowed('POST', '/api/reservations', flags).ok, false);
    assert.equal(routeAllowed('PATCH', '/api/users/webhooks/1', flags).ok, false);
  }
});

test('safeEqual requires >= 32 chars and exact match', () => {
  const t = 'a'.repeat(40);
  assert.ok(safeEqual(t, t));
  assert.equal(safeEqual('a'.repeat(39), t), false);
  assert.equal(safeEqual('short', 'short'), false);
  assert.equal(safeEqual(null, t), false);
});
