// Automatic confirmation e-mails to customers, sent through the Brevo API
// (Cloudflare can only send to verified addresses, customers are arbitrary).
// Plain text only: no tracking pixel, no links that could be rewritten.

const SIGNATURE = [
  'Mit freundlichen Grüßen',
  'VANA Management',
  '',
  '—',
  'VANA Management UG (haftungsbeschränkt)',
  'Web: www.vana-management.com',
  'E-Mail: info@vana-management.com',
  'Amtsgericht Berlin Charlottenburg HRB 281066 B',
  'Geschäftsführer: M. Sc. Vahid Naseri',
].join('\n');

// Deliberately contains nothing the visitor typed: the form must not become a way
// to send arbitrary text to arbitrary addresses.
export const FORM_REPLY = {
  subject: 'Ihre Anfrage bei VANA Management',
  text: [
    'Guten Tag,',
    '',
    'vielen Dank für Ihre Anfrage über unsere Website. Wir haben sie erhalten und melden uns so bald wie möglich per E-Mail bei Ihnen, um die Details zu besprechen und einen Besichtigungstermin zu vereinbaren.',
    '',
    'Wenn Sie noch etwas ergänzen möchten (zum Beispiel Fotos oder Grundrisse), antworten Sie einfach auf diese E-Mail.',
    '',
    SIGNATURE,
  ].join('\n'),
};

export const MAIL_REPLY = {
  subject: 'Eingangsbestätigung – VANA Management',
  text: [
    'Guten Tag,',
    '',
    'vielen Dank für Ihre Nachricht. Sie ist bei uns angekommen, und wir melden uns so bald wie möglich bei Ihnen.',
    '',
    'Dies ist eine automatische Bestätigung; Sie erhalten sie nur bei Ihrer ersten Nachricht an uns.',
    '',
    SIGNATURE,
  ].join('\n'),
};

const NO_REPLY_LOCAL = /(^|[._+-])(no-?reply|do-?not-?reply)([._+-]|$)|^(mailer-daemon|postmaster|bounces?|notifications?|abuse)([._+-]|$)/i;

/** Pulls the address out of a From header like `"Name" <a@b.de>` or `a@b.de`. */
export function addressFrom(header) {
  if (!header) return '';
  const m = header.match(/<([^<>\s]+@[^<>\s]+)>/) || header.match(/([^\s<>",;:]+@[^\s<>",;:]+)/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * RFC 3834: never auto-reply to automated mail, mailing lists, bounces,
 * no-reply senders or our own domain.
 */
export function shouldAutoReply(headers, from, ownDomain) {
  if (!from || !from.includes('@')) return false;
  const [local, domain] = from.split('@');
  if (domain === ownDomain || domain.endsWith('.' + ownDomain)) return false;
  if (NO_REPLY_LOCAL.test(local)) return false;
  const auto = (headers.get('auto-submitted') || 'no').toLowerCase();
  if (auto !== 'no') return false;
  if (/^(bulk|list|junk|auto_reply)$/i.test((headers.get('precedence') || '').trim())) return false;
  for (const h of ['list-id', 'list-unsubscribe', 'x-auto-response-suppress', 'feedback-id']) if (headers.get(h)) return false;
  return true;
}

export async function sendViaBrevo(env, { to, subject, text, inReplyTo }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'VANA Management', email: env.MAIL_FROM },
      replyTo: { email: env.MAIL_FROM, name: 'VANA Management' },
      to: [{ email: to }],
      subject,
      textContent: text,
      headers: { 'Auto-Submitted': 'auto-replied', ...(inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : {}) },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** True the first time we see this address (and remembers it). */
export async function firstContact(env, address) {
  const key = 'seen:' + address;
  if (await env.SEEN.get(key)) return false;
  await env.SEEN.put(key, new Date().toISOString());
  return true;
}
