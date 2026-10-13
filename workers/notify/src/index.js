import { EmailMessage } from 'cloudflare:email';
import { buildMessage } from './mime.js';

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
  async fetch(request, env) {
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
      from: env.MAIL_FROM,
      fromName: env.MAIL_FROM_NAME,
      to: env.MAIL_TO,
      replyTo: a.email,
      subject: `Neue Anfrage: ${a.projektart || 'Projekt'} – ${a.name}`,
      text: composeText(a),
    });
    try {
      await env.MAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, raw));
    } catch (e) {
      console.error('sending failed', e && e.message);
      return new Response('send failed', { status: 502 });
    }
    return new Response(null, { status: 204 });
  },
};
