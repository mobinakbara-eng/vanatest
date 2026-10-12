// Supabase Edge Function "kontakt": receives the contact form of vana-management.de.
//
// Secrets (supabase secrets set ...):
//   ALLOWED_ORIGINS       required  comma-separated, e.g. https://vana-management.de,https://www.vana-management.de
//   RATE_LIMIT_SALT       required  long random string
//   RESEND_API_KEY        optional  e-mail notification for every new request
//   NOTIFY_TO             optional  recipient of the notification (default info@vana-management.de)
//   MAIL_FROM             optional  sender, e.g. "VANA Website <website@vana-management.de>"
//   TURNSTILE_SECRET_KEY  optional  enables Cloudflare Turnstile verification
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import type { Anfrage } from "./validate.ts";

const env = (k: string) => Deno.env.get(k)?.trim() ?? "";

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const resendKey = env("RESEND_API_KEY");
const turnstileSecret = env("TURNSTILE_SECRET_KEY");

async function notify(a: Anfrage) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("MAIL_FROM") || "VANA Website <website@vana-management.de>",
      to: env("NOTIFY_TO") || "info@vana-management.de",
      reply_to: a.email,
      subject: `Neue Anfrage: ${a.projektart} – ${a.name}`,
      text: [
        `Name: ${a.name}`,
        `E-Mail: ${a.email}`,
        `Telefon: ${a.telefon ?? "–"}`,
        `Ort / PLZ: ${a.ort ?? "–"}`,
        `Projekt: ${a.projektart}`,
        "",
        a.nachricht,
      ].join("\n"),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function verifyTurnstile(token: string, ip: string | null) {
  const form = new FormData();
  form.append("secret", turnstileSecret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = await res.json();
  return data.success === true;
}

const salt = env("RATE_LIMIT_SALT");
if (!salt) console.error("RATE_LIMIT_SALT is not set");

Deno.serve(
  createHandler({
    allowedOrigins: env("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean),
    salt,
    async rateLimit(ipHash) {
      const { data, error } = await supabase.rpc("anfrage_rate_limit", { p_ip_hash: ipHash });
      if (error) throw error;
      return data === true;
    },
    async insertAnfrage(anfrage) {
      const { error } = await supabase.from("anfragen").insert(anfrage);
      if (error) throw error;
    },
    notify: resendKey ? notify : undefined,
    verifyTurnstile: turnstileSecret ? verifyTurnstile : undefined,
  }),
);
