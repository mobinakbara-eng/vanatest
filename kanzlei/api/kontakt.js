// Kontaktformular auf Vercel (Serverless-Funktion).
// Versand per E-Mail, sobald in Vercel diese Umgebungsvariablen gesetzt sind:
//   RESEND_API_KEY  – API-Schlüssel von resend.com
//   MAIL_TO         – Empfänger, z. B. kontakt@ra-erkan.de
//   MAIL_FROM       – Absender einer bei Resend verifizierten Domain, z. B. website@ra-erkan.de
// Ohne diese Angaben wird die Anfrage im Vercel-Log gespeichert (Projekt → Logs), damit nichts verloren geht.

const clean = (v, max) => String(v ?? '').replace(/[\r\0]/g, '').trim().slice(0, max);

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ ok: false })); }

  let body = req.body;
  if (typeof body === 'string') { try { body = Object.fromEntries(new URLSearchParams(body)); } catch { body = {}; } }
  body = body || {};

  if (body.website) { return res.end(JSON.stringify({ ok: true })); } // Honeypot: Bot

  const d = {
    name: clean(body.name, 120), email: clean(body.email, 200), phone: clean(body.phone, 60),
    area: clean(body.area, 60), reply: clean(body.reply, 30), message: clean(body.message, 5000),
  };
  const valid = d.name.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) && d.message.length >= 10 && body.privacy;
  if (!valid || /[\n\r]/.test(d.name + d.email)) { res.statusCode = 422; return res.end(JSON.stringify({ ok: false, error: 'validation' })); }

  const text = `Neue Anfrage über die Website\n\nName: ${d.name}\nE-Mail: ${d.email}\nTelefon: ${d.phone || '–'}\n` +
    `Rechtsgebiet: ${d.area || '–'}\nRückweg: ${d.reply || '–'}\n\nNachricht:\n${d.message}\n`;

  const { RESEND_API_KEY, MAIL_TO, MAIL_FROM } = process.env;
  if (RESEND_API_KEY && MAIL_TO && MAIL_FROM) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: MAIL_FROM, to: [MAIL_TO], reply_to: d.email, subject: `Anfrage: ${d.area || 'Website'} – ${d.name}`, text }),
      });
      if (!r.ok) throw new Error('resend ' + r.status);
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error('Mailversand fehlgeschlagen', e.message);
      res.statusCode = 502; return res.end(JSON.stringify({ ok: false }));
    }
  }
  console.log('KONTAKTANFRAGE ' + JSON.stringify(d));
  return res.end(JSON.stringify({ ok: true }));
};
