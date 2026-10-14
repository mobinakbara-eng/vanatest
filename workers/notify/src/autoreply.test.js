import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORM_REPLY, MAIL_REPLY, addressFrom, shouldAutoReply } from './autoreply.js';

const H = (o = {}) => new Headers(o);

test('extracts the sender address', () => {
  assert.equal(addressFrom('"Max M." <Max@Example.de>'), 'max@example.de');
  assert.equal(addressFrom('max@example.de'), 'max@example.de');
  assert.equal(addressFrom(''), '');
});

test('replies to a normal person', () => {
  assert.equal(shouldAutoReply(H({ from: 'max@example.de' }), 'max@example.de', 'vana-management.com'), true);
});

test('never replies to automated mail, lists, no-reply senders or ourselves', () => {
  const own = 'vana-management.com';
  assert.equal(shouldAutoReply(H({ 'auto-submitted': 'auto-replied' }), 'max@example.de', own), false);
  assert.equal(shouldAutoReply(H({ precedence: 'bulk' }), 'max@example.de', own), false);
  assert.equal(shouldAutoReply(H({ 'list-id': '<x.example.de>' }), 'max@example.de', own), false);
  assert.equal(shouldAutoReply(H({ 'list-unsubscribe': '<mailto:u@x.de>' }), 'max@example.de', own), false);
  for (const a of ['noreply@x.de', 'no-reply@x.de', 'mailer-daemon@x.de', 'postmaster@x.de', 'forwarding-noreply@google.com', 'info@vana-management.com', 'team.noreply@x.de', 'bounces+123@x.de']) {
    assert.equal(shouldAutoReply(H(), a, own), false, a);
  }
});

test('form confirmation contains nothing the visitor typed', () => {
  assert.doesNotMatch(FORM_REPLY.text, /\$\{|undefined/);
  assert.match(FORM_REPLY.text, /Amtsgericht Berlin Charlottenburg HRB 281066 B\nGeschäftsführer: M\. Sc\. Vahid Naseri$/);
  assert.match(MAIL_REPLY.text, /Web: www\.vana-management\.com\nE-Mail: info@vana-management\.com/);
});
