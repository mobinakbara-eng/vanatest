-- Migration 007: monitoring.
--   v_schedule_plan : every scheduled guest message with its due time (single source for sending
--                     AND for checking that nothing was missed)
--   health_check(h) : automatic checks of the last h hours, one row per check (OK / WARN / FAIL / INFO)
--   settings.LIVE_SINCE : go-live time; checks about sending start from here
BEGIN;
SET search_path = ic, public;

INSERT INTO settings (key, value, note)
VALUES ('LIVE_SINCE', '2026-11-11T19:34:25Z', 'go-live (owner 11.11.2026); sending checks start here')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW v_schedule_plan AS
SELECT d.*, x.due_at FROM (
  SELECT s.template_code, r.reservation_id, r.property_id, p.internal_name, p.street_address, p.postal_code,
         CASE WHEN lower(coalesce(r.raw->>'language','')) LIKE 'de%' THEN 'de' ELSE 'en' END AS lang,
         r.arrival::text AS arrival, r.departure::text AS departure, r.channel_name, r.check_in_at, r.check_out_at,
         c.booked_at,
         CASE s.anchor
           WHEN 'CHECK_IN'  THEN r.check_in_at
           WHEN 'CHECK_OUT' THEN r.check_out_at
           ELSE c.booked_at
         END + make_interval(mins => s.offset_minutes) AS planned_at
  FROM property_message_schedules s
  JOIN reservations r ON r.property_id = s.property_id
  JOIN properties p ON p.property_id = r.property_id
  CROSS JOIN LATERAL (SELECT CASE WHEN (r.raw->>'created-at') ~ '^\d{4}-\d\d-\d\d'
                                  THEN ((r.raw->>'created-at')::timestamp AT TIME ZONE p.timezone) END AS booked_at) c
  WHERE s.enabled AND r.status IN ('CONFIRMED','MODIFIED')
) d
-- last-minute bookings: arrival info and PIN are sent 10 min after booking if their normal time already passed
CROSS JOIN LATERAL (SELECT CASE WHEN d.template_code IN ('ARRIVAL_2D','ACCESS_PIN') AND d.booked_at IS NOT NULL
                                THEN GREATEST(d.planned_at, d.booked_at + interval '10 minutes') ELSE d.planned_at END AS due_at) x
WHERE (d.template_code = 'REVIEW_REQUEST' OR d.check_out_at IS NULL OR x.due_at < d.check_out_at)
  AND (d.template_code <> 'ARRIVAL_2D' OR d.check_in_at IS NULL OR x.due_at < d.check_in_at);

CREATE OR REPLACE FUNCTION health_check(p_hours int DEFAULT 24)
RETURNS TABLE (check_name text, status text, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ic, public AS $$
#variable_conflict use_column
DECLARE
  w      interval    := make_interval(hours => p_hours);
  live   timestamptz := coalesce((SELECT value::timestamptz FROM settings WHERE key = 'LIVE_SINCE'), now());
  since  timestamptz := greatest(now() - make_interval(hours => p_hours), live);
  v_ts   timestamptz;
  n      bigint;
  n2     bigint;
  t      text;
  berlin text := 'Europe/Berlin';
BEGIN
  -- 1. scheduler alive
  SELECT max(finished_at) INTO v_ts FROM automation_runs WHERE workflow = 'ic-tick';
  check_name := 'scheduler_running';
  status := CASE WHEN v_ts > now() - interval '15 minutes' THEN 'OK' ELSE 'FAIL' END;
  detail := 'last ic-tick ' || coalesce(to_char(v_ts AT TIME ZONE berlin, 'DD.MM. HH24:MI'), 'never');
  RETURN NEXT;

  -- 2. errors inside the scheduler
  SELECT count(*), string_agg(DISTINCT left(e, 150), ' | ') INTO n, t
  FROM automation_runs a CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(a.summary->'errors', '[]'::jsonb)) e
  WHERE a.workflow = 'ic-tick' AND a.finished_at > now() - w;
  SELECT count(*) INTO n2 FROM automation_runs WHERE workflow = 'ic-tick' AND finished_at > now() - w;
  check_name := 'scheduler_errors';
  status := CASE WHEN n = 0 THEN 'OK' WHEN n <= 3 THEN 'WARN' ELSE 'FAIL' END;
  detail := n2 || ' runs, ' || n || ' errors' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 3. pg_cron / pg_net (production only)
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM cron.job_run_details d JOIN cron.job j USING (jobid)
               WHERE j.jobname = 'ic-tick' AND d.status <> 'succeeded' AND d.start_time > now() - $1$q$ INTO n USING w;
    EXECUTE $q$SELECT count(*) FROM cron.job WHERE jobname = 'ic-tick' AND active$q$ INTO n2;
    check_name := 'cron_job';
    status := CASE WHEN n2 = 0 THEN 'FAIL' WHEN n > 0 THEN 'WARN' ELSE 'OK' END;
    detail := CASE WHEN n2 = 0 THEN 'pg_cron job ic-tick missing or inactive' ELSE n || ' failed cron runs' END;
    RETURN NEXT;
  END IF;
  IF to_regclass('net._http_response') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM net._http_response WHERE created > now() - $1 AND coalesce(status_code, 0) <> 200$q$ INTO n USING w;
    check_name := 'cron_http';
    status := CASE WHEN n = 0 THEN 'OK' WHEN n <= 3 THEN 'WARN' ELSE 'FAIL' END;
    detail := n || ' scheduler calls without HTTP 200';
    RETURN NEXT;
  END IF;

  -- 4. Smoobu sync fresh
  SELECT max(last_synced_at) INTO v_ts FROM reservations;
  check_name := 'smoobu_sync';
  status := CASE WHEN v_ts > now() - interval '20 minutes' THEN 'OK' ELSE 'FAIL' END;
  detail := 'last sync ' || coalesce(to_char(v_ts AT TIME ZONE berlin, 'DD.MM. HH24:MI'), 'never');
  RETURN NEXT;

  -- 5. scheduled messages that were due but never recorded
  SELECT count(*), string_agg(p.template_code || ' ' || p.reservation_id || ' (' || to_char(p.due_at AT TIME ZONE berlin, 'DD.MM. HH24:MI') || ')', ', ')
    INTO n, t
  FROM v_schedule_plan p
  WHERE p.due_at BETWEEN since AND now() - interval '20 minutes'
    AND NOT EXISTS (SELECT 1 FROM outbound_messages o WHERE o.idempotency_key = 'sched:' || p.reservation_id || ':' || p.template_code);
  check_name := 'scheduled_missed';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL' END;
  detail := n || ' due but not processed' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 6. scheduled messages processed but not sent
  SELECT count(*), string_agg(o.idempotency_key || ' ' || o.status || coalesce(' – ' || (o.smoobu_response->>'refused'), ''), ', ')
    INTO n, t
  FROM outbound_messages o
  WHERE o.origin = 'SCHEDULED' AND o.created_at >= since AND o.created_at < now() - interval '10 minutes'
    AND o.status <> 'SENT' AND o.idempotency_key NOT LIKE '%DRYRUN%';
  SELECT count(*) INTO n2 FROM outbound_messages WHERE origin = 'SCHEDULED' AND created_at >= since AND status = 'SENT';
  check_name := 'scheduled_sent';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL' END;
  detail := n2 || ' sent, ' || n || ' not sent' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 7. approved replies that did not reach the guest
  SELECT count(*), string_agg(a.approval_code || ' ' || o.status, ', ') INTO n, t
  FROM approvals a JOIN outbound_messages o ON o.outbound_id = a.outbound_id
  WHERE a.status = 'APPROVED' AND a.decided_at >= since AND a.decided_at < now() - interval '5 minutes' AND o.status <> 'SENT';
  SELECT count(*) INTO n2 FROM approvals a JOIN outbound_messages o ON o.outbound_id = a.outbound_id
  WHERE a.status = 'APPROVED' AND a.decided_at >= since AND o.status = 'SENT';
  check_name := 'replies_sent';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL' END;
  detail := n2 || ' replies sent, ' || n || ' approved but not sent' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 8. guest messages for which the AI never produced a draft
  SELECT count(*), string_agg(m.reservation_id || ' (' || to_char(m.sent_at AT TIME ZONE berlin, 'DD.MM. HH24:MI') || ')', ', ') INTO n, t
  FROM messages m
  WHERE m.direction = 'INBOUND' AND m.sent_at >= since AND m.sent_at < now() - interval '30 minutes'
    AND m.sent_at > now() - interval '48 hours' AND m.property_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM messages x WHERE x.reservation_id = m.reservation_id AND x.sent_at > m.sent_at)
    AND NOT EXISTS (SELECT 1 FROM outbound_messages o WHERE o.idempotency_key = 'draft:' || m.message_pk);
  check_name := 'drafts_created';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL' END;
  detail := n || ' guest messages without AI draft' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 9. drafts waiting for the manager
  SELECT count(*), string_agg(approval_code, ', ') INTO n, t FROM approvals
  WHERE status = 'PENDING' AND level <> 'AUTO' AND requested_at < now() - interval '3 hours';
  check_name := 'waiting_for_manager';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'WARN' END;
  detail := n || ' approvals open > 3 h' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 10. n8n errors (WF-14 dead letters)
  SELECT count(*), string_agg(DISTINCT workflow || ': ' || left(error, 100), ' | ') INTO n, t
  FROM dead_letter_events WHERE created_at > now() - w AND resolved_at IS NULL;
  check_name := 'n8n_errors';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'WARN' END;
  detail := n || ' n8n errors' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 11. no codes / passwords in guest-visible knowledge
  SELECT count(*), string_agg(property_id || ':' || key, ', ') INTO n, t FROM property_kb_entries
  WHERE visibility IN ('PUBLIC_GUEST', 'TIMED_GUEST') AND validity IN ('VERIFIED', 'UNVERIFIED')
    AND value_text ~* '(code|pin|passw|kennwort|passcode)[^\n]{0,40}\m\d{3,8}\M';
  check_name := 'kb_no_secrets';
  status := CASE WHEN n = 0 THEN 'OK' ELSE 'FAIL' END;
  detail := n || ' knowledge rows look like they contain a code' || coalesce(': ' || t, '');
  RETURN NEXT;

  -- 12. learning
  SELECT count(*) INTO n FROM audit_log WHERE action = 'KB_LEARNED' AND at > now() - w;
  SELECT count(*) INTO n2 FROM approvals WHERE status = 'APPROVED' AND decided_at > now() - w AND level <> 'AUTO';
  check_name := 'learning';
  status := 'INFO';
  detail := n2 || ' replies approved by the manager, ' || n || ' facts learned';
  RETURN NEXT;

  -- 13. sending switched on
  check_name := 'live_sending';
  status := CASE WHEN (SELECT value FROM settings WHERE key = 'LIVE_SENDING') = 'on' THEN 'OK' ELSE 'WARN' END;
  detail := 'LIVE_SENDING = ' || coalesce((SELECT value FROM settings WHERE key = 'LIVE_SENDING'), '?');
  RETURN NEXT;

  -- 14. data consistency
  SELECT count(*) INTO n FROM reservations WHERE property_id IS NULL AND departure >= current_date AND status IN ('CONFIRMED', 'MODIFIED');
  SELECT count(*) INTO n2 FROM outbound_messages WHERE status = 'QUEUED' AND created_at < now() - interval '10 minutes';
  check_name := 'data_consistency';
  status := CASE WHEN n2 > 0 THEN 'FAIL' WHEN n > 0 THEN 'WARN' ELSE 'OK' END;
  detail := n || ' upcoming bookings of unknown apartments, ' || n2 || ' messages stuck in sending';
  RETURN NEXT;

  -- 15. database size (Free plan: 500 MB)
  check_name := 'database_size';
  status := CASE WHEN pg_database_size(current_database()) > 350 * 1024 * 1024 THEN 'WARN' ELSE 'OK' END;
  detail := pg_size_pretty(pg_database_size(current_database()));
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION health_check(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health_check(int) TO ic_n8n;
COMMIT;
