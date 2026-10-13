import { EmailMessage } from 'cloudflare:email';
import { buildMessage } from './mime.js';
import { FORM_REPLY, MAIL_REPLY, addressFrom, firstContact, sendViaBrevo, shouldAutoReply } from './autoreply.js';

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function composeText(a) {
  return [
    'Neue Anfrage über das Kontaktformular auf vana-management.com',
    '',
    `Name:      ${a.name}`,
    `E-Mail:    ${a.email}`,
    `Telefon:   ${a.telefon || '–'}`,
    `Ort / PLZ: ${a.ort || '–'}`,
    `Projekt:   ${a.projektart}`,
    '',
    'Nachricht:',
    a.nachricht,
    '',
    '—',
    'Auf diese E-Mail antworten = direkt an die Kundin / den Kunden schreiben.',
  ].join('\n');
}

export default {
  // Mail to info@ (Email Routing rule → this Worker): forward it to the team inbox,
  // then confirm receipt to first-time senders.
  async email(message, env, ctx) {
    await message.forward(env.MAIL_TO);
    if (!env.BREVO_API_KEY) return;
    const from = addressFrom(message.headers.get('from'));
    if (!shouldAutoReply(message.headers, from, env.MAIL_FROM.split('@')[1])) return;
    ctx.waitUntil((async () => {
      try {
        if (!(await firstContact(env, from))) return;
        await sendViaBrevo(env, { to: from, ...MAIL_REPLY, inReplyTo: message.headers.get('message-id') || undefined });
      } catch (e) {
        console.error('auto-reply failed', e && e.message);
      }
    })());
  },

  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    const auth = request.headers.get('authorization') || '';
    if (!env.NOTIFY_SECRET || !timingSafeEqual(auth, `Bearer ${env.NOTIFY_SECRET}`)) {
      return new Response('unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }
    const a = {
      name: str(body.name, 120),
      email: str(body.email, 200),
      telefon: str(body.telefon, 40),
      ort: str(body.ort, 120),
      projektart: str(body.projektart, 60),
      nachricht: str(body.nachricht, 4000),
    };
    if (!a.name || !a.nachricht || !EMAIL_RE.test(a.email)) return new Response('invalid request', { status: 422 });

    const raw = buildMessage({
      from: env.NOTIFY_FROM,
      fromName: env.MAIL_FROM_NAME,
      to: env.MAIL_TO,
      // Addressed to info@ (delivered to the team inbox): Gmail's "reply from the
      // address the message was sent to" then answers the customer from info@.
      headerTo: env.MAIL_FROM,
      replyTo: a.email,
      subject: `Neue Anfrage: ${a.projektart || 'Projekt'} – ${a.name}`,
      text: composeText(a),
    });
    try {
      await env.MAIL.send(new EmailMessage(env.NOTIFY_FROM, env.MAIL_TO, raw));
    } catch (e) {
      console.error('sending failed', e && e.message);
      return new Response('send failed', { status: 502 });
    }
    // Confirmation for the visitor (every form request). Also marks the address as
    // known, so a later e-mail to info@ gets no second automatic reply.
    if (env.BREVO_API_KEY) {
      ctx.waitUntil((async () => {
        try {
          await sendViaBrevo(env, { to: a.email.toLowerCase(), ...FORM_REPLY });
          await env.SEEN.put('seen:' + a.email.toLowerCase(), new Date().toISOString());
        } catch (e) {
          console.error('form confirmation failed', e && e.message);
        }
      })());
    }
    return new Response(null, { status: 204 });
  },
};
