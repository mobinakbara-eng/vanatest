-- Production only (needs pg_cron + pg_net, Supabase). Runs Edge Function ic-tick every 5 minutes.
-- The token is read from Supabase Vault (secret name 'ic_proxy_token'); it is never stored here.
--   create once:  SELECT vault.create_secret('<IC_PROXY_TOKEN>', 'ic_proxy_token');
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('ic-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ic-tick');
SELECT cron.schedule('ic-tick', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://bkqtruzcrypiudhgzmhs.supabase.co/functions/v1/ic-tick',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-ic-proxy-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ic_proxy_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$job$);
-- keep pg_cron / pg_net history small
SELECT cron.unschedule('ic-tick-cleanup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ic-tick-cleanup');
SELECT cron.schedule('ic-tick-cleanup', '17 3 * * *', $job$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  DELETE FROM ic.draft_triggers WHERE triggered_at < now() - interval '7 days';
$job$);
