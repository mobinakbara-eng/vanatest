/* Site configuration (see README.md → "Backend").
   apiUrl: the Supabase Edge Function that receives the contact form,
           e.g. "https://abcdefghijklmnop.supabase.co/functions/v1/kontakt"
   turnstileSiteKey: optional Cloudflare Turnstile site key (spam protection).
   No secret keys belong in this file. */
window.VANA_CONFIG = {
  apiUrl: "https://dnamzzkduiougwwwiogo.supabase.co/functions/v1/kontakt",
  turnstileSiteKey: "",
  contactEmail: "info@vana-management.com"
};
