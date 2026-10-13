// Validation of contact form submissions. Pure functions, no I/O.

export const PROJEKTARTEN = [
  "Sanierung",
  "Innenausbau",
  "Bad oder Küche",
  "Trockenbau",
  "Sanierung und Trockenbau",
  "Sonstiges",
] as const;

export interface Anfrage {
  name: string;
  email: string;
  telefon: string | null;
  ort: string | null;
  projektart: (typeof PROJEKTARTEN)[number];
  nachricht: string;
  datenschutz_akzeptiert: true;
}

export type FieldErrors = Partial<Record<keyof Anfrage, string>>;

export type ValidationResult =
  | { ok: true; value: Anfrage }
  | { ok: false; errors: FieldErrors };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TELEFON = /^[0-9+()/.\s-]*$/;
// Control characters except tab and newline
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trims, removes control characters and collapses whitespace (single-line fields). */
export function cleanLine(v: unknown): string {
  return typeof v === "string" ? v.replace(CONTROL, "").replace(/\s+/g, " ").trim() : "";
}

/** Like cleanLine but keeps line breaks (message field). */
export function cleanText(v: unknown): string {
  return typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : "";
}

export function validate(input: Record<string, unknown>): ValidationResult {
  const name = cleanLine(input.name);
  const email = cleanLine(input.email).toLowerCase();
  const telefon = cleanLine(input.telefon);
  const ort = cleanLine(input.ort);
  const projektart = cleanLine(input.projektart);
  const nachricht = cleanText(input.nachricht);
  const errors: FieldErrors = {};

  if (name.length < 2 || name.length > 120) errors.name = "Bitte geben Sie Ihren Namen ein.";
  if (!EMAIL.test(email) || email.length > 200) errors.email = "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  if (telefon.length > 40 || !TELEFON.test(telefon)) errors.telefon = "Bitte geben Sie eine gültige Telefonnummer ein.";
  if (ort.length > 120) errors.ort = "Bitte kürzen Sie die Ortsangabe.";
  if (!(PROJEKTARTEN as readonly string[]).includes(projektart)) errors.projektart = "Bitte wählen Sie die Art des Projekts.";
  if (nachricht.length < 10) errors.nachricht = "Bitte beschreiben Sie Ihr Projekt in mindestens 10 Zeichen.";
  else if (nachricht.length > 4000) errors.nachricht = "Ihre Nachricht ist zu lang (höchstens 4000 Zeichen).";
  if (input.datenschutz_akzeptiert !== true) {
    errors.datenschutz_akzeptiert = "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      email,
      telefon: telefon || null,
      ort: ort || null,
      projektart: projektart as Anfrage["projektart"],
      nachricht,
      datenschutz_akzeptiert: true,
    },
  };
}
