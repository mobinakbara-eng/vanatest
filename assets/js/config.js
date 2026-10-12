/* Supabase connection for the contact form (see README.md, section "Supabase").
   The anon key is public by design: the database only lets it INSERT into "anfragen".
   Never put the service_role key here. */
window.VANA_CONFIG = {
  supabaseUrl: "",      // e.g. "https://abcdefghijklmnop.supabase.co"
  supabaseAnonKey: "",  // Project Settings -> API Keys -> anon / publishable key
  contactEmail: "info@vana-management.de"
};
