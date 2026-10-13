// Minimal MIME builder for a UTF-8 plain-text e-mail (no dependencies).

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** RFC 2047 encoded-word for header values with non-ASCII characters. */
export function encodeHeader(value) {
  const clean = String(value).replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${b64(clean)}?=`;
}

/** Display name + address, e.g. "VANA Website <info@vana-management.com>". */
export function mailbox(name, address) {
  return name ? `${encodeHeader(name)} <${address}>` : `<${address}>`;
}

export function buildMessage({ from, fromName, to, replyTo, subject, text, date = new Date(), id = crypto.randomUUID() }) {
  const domain = from.split('@')[1];
  const body = b64(text.replace(/\r?\n/g, '\r\n')).replace(/.{1,76}/g, '$&\r\n');
  return [
    `From: ${mailbox(fromName, from)}`,
    `To: <${to}>`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}
