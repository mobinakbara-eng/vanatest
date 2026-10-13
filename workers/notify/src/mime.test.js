// node --test workers/notify/src/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, encodeHeader } from './mime.js';

const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));

test('plain ASCII headers stay readable, umlauts are encoded', () => {
  assert.equal(encodeHeader('Neue Anfrage'), 'Neue Anfrage');
  assert.match(encodeHeader('Trockenbau – Jürgen'), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
});

test('header values cannot inject extra headers', () => {
  assert.doesNotMatch(encodeHeader('a\r\nBcc: x@y.de'), /[\r\n]/);
});

test('builds a valid UTF-8 message with reply-to', () => {
  const raw = buildMessage({
    from: 'info@vana-management.com', fromName: 'VANA Website', to: 'a@example.com', replyTo: 'kunde@example.com',
    subject: 'Neue Anfrage: Trockenbau – Jürgen', text: 'Grüße\nZeile 2', id: 'abc',
  });
  const [head, body] = raw.split('\r\n\r\n');
  assert.match(head, /^From: VANA Website <info@vana-management.com>\r\n/);
  assert.match(head, /\r\nTo: <a@example.com>\r\n/);
  assert.match(head, /\r\nReply-To: <kunde@example.com>\r\n/);
  assert.match(head, /\r\nMessage-ID: <abc@vana-management.com>\r\n/);
  assert.match(head, /\r\nDate: \w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000\r\n/);
  assert.equal(decode(body), 'Grüße\r\nZeile 2');
  for (const line of body.split('\r\n')) assert.ok(line.length <= 76);
});

test('the visible To header can differ from the delivery address', () => {
  const raw = buildMessage({ from: 'info@vana-management.com', to: 'team@example.com', headerTo: 'info@vana-management.com', subject: 's', text: 't' });
  assert.match(raw, /\r\nTo: <info@vana-management.com>\r\n/);
});
