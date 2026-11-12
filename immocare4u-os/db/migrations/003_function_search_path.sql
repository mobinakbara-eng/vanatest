-- Migration 003: pin search_path on all ic functions so guard triggers work for every
-- caller regardless of the session search_path (found by WF-01 draft test, 2026-11-04).
BEGIN;
ALTER FUNCTION ic.set_updated_at() SET search_path = ic, public;
ALTER FUNCTION ic.check_ticket_transition() SET search_path = ic, public;
ALTER FUNCTION ic.check_property_activation() SET search_path = ic, public;
ALTER FUNCTION ic.check_outbound_guard() SET search_path = ic, public;
ALTER FUNCTION ic.ai_kb_for_reservation(bigint, timestamptz) SET search_path = ic, public;
COMMIT;
