-- Guard-rail tests. Run after migration + seed:
--   psql -v ON_ERROR_STOP=1 -f tests/db_guardrails_test.sql
SET search_path = ic, public;
\set QUIET on

CREATE OR REPLACE FUNCTION pg_temp.expect_error(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS  %', label; RETURN; END;
  RAISE EXCEPTION 'FAIL  % (no error raised)', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label; ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- Fixtures
INSERT INTO properties (property_id, internal_name, city_code, street_address) VALUES ('P-BER-002','Other unit','BER','x');
INSERT INTO property_kb_entries (property_id, category, key, language, value_text, visibility, source, validity, verified_at)
VALUES ('P-BER-002','WIFI','wifi_ssid','en','OTHER-SSID','PUBLIC_GUEST','test','VERIFIED',now());
INSERT INTO reservations (reservation_id, property_id, smoobu_apartment_id, arrival, departure, check_in_at, check_out_at, raw)
VALUES (9001,'P-BER-001',1,'2026-12-01','2026-12-03','2026-12-01 15:00+01','2026-12-03 11:00+01','{}');

-- 1. Activation blocked while compliance items are open
SELECT pg_temp.expect_error($$UPDATE properties SET op_status='ACTIVE' WHERE property_id='P-BER-001'$$,
  'property activation blocked with open compliance items');

-- 2. Idempotent webhook insert
INSERT INTO webhook_events (action, idempotency_key, payload, payload_sha256) VALUES ('newMessage','smoobu:newMessage:1','{}','x') ON CONFLICT DO NOTHING;
INSERT INTO webhook_events (action, idempotency_key, payload, payload_sha256) VALUES ('newMessage','smoobu:newMessage:1','{}','x') ON CONFLICT DO NOTHING;
SELECT pg_temp.expect((SELECT count(*) FROM webhook_events WHERE idempotency_key='smoobu:newMessage:1') = 1,
  'duplicate webhook stored once');

-- 3. AI may not auto-send restricted content
SELECT pg_temp.expect_error($$INSERT INTO outbound_messages (idempotency_key, reservation_id, property_id, origin, body, contains_restricted)
  VALUES ('t3',9001,'P-BER-001','AI_AUTO','code is ...',true)$$, 'restricted content blocked for AI_AUTO');

-- 4. Cross-property outbound blocked
SELECT pg_temp.expect_error($$INSERT INTO outbound_messages (idempotency_key, reservation_id, property_id, origin, body)
  VALUES ('t4',9001,'P-BER-002','AI_AUTO','hi')$$, 'outbound property must match reservation');

-- 5. Duplicate outbound (same idempotency key) blocked
INSERT INTO outbound_messages (idempotency_key, reservation_id, property_id, origin, body) VALUES ('reply:1',9001,'P-BER-001','AI_AUTO','hi');
SELECT pg_temp.expect_error($$INSERT INTO outbound_messages (idempotency_key, reservation_id, property_id, origin, body)
  VALUES ('reply:1',9001,'P-BER-001','AI_AUTO','hi again')$$, 'duplicate outbound blocked');

-- 6. AI KB never exposes secrets, unverified rows, or other properties
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM ai_kb_for_reservation(9001, '2026-12-01 16:00+01') WHERE key IN ('wifi_password','keybox_code')),
  'AI KB excludes RESTRICTED secrets');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM ai_kb_for_reservation(9001, '2026-12-01 16:00+01') WHERE value_text='OTHER-SSID'),
  'AI KB excludes other property data');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM ai_kb_for_reservation(9001, '2026-12-01 16:00+01') WHERE key='wifi_ssid'),
  'AI KB excludes UNVERIFIED facts');

-- 7. TIMED_GUEST facts respect release window
UPDATE property_kb_entries SET validity='VERIFIED', verified_at=now() WHERE property_id='P-BER-001' AND key='wifi_ssid';
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM ai_kb_for_reservation(9001, '2026-11-25 12:00+01') WHERE key='wifi_ssid'),
  'timed fact hidden before release window');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM ai_kb_for_reservation(9001, '2026-11-30 16:00+01') WHERE key='wifi_ssid'),
  'timed fact visible inside release window (24h before check-in)');

-- 8. Cancelled reservation gets no KB
UPDATE reservations SET status='CANCELLED' WHERE reservation_id=9001;
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM ai_kb_for_reservation(9001, '2026-12-01 16:00+01')),
  'cancelled reservation receives no KB');

-- 9. Ticket lifecycle enforced + cost approval required
INSERT INTO maintenance_tickets (ticket_id, property_id, category, description, estimated_cost_eur) VALUES ('T-TEST-1','P-BER-001','HEATING','test',150);
SELECT pg_temp.expect_error($$UPDATE maintenance_tickets SET status='RESOLVED' WHERE ticket_id='T-TEST-1'$$, 'ticket cannot skip states');
UPDATE maintenance_tickets SET status='ASSIGNED' WHERE ticket_id='T-TEST-1';
SELECT pg_temp.expect_error($$UPDATE maintenance_tickets SET status='IN_PROGRESS' WHERE ticket_id='T-TEST-1'$$, 'costed ticket needs approval before work');

-- 10. Lead codes are sequential IC-xxx
INSERT INTO leads DEFAULT VALUES;
SELECT pg_temp.expect((SELECT lead_code FROM leads ORDER BY first_seen LIMIT 1) ~ '^IC-[0-9]{3,}$', 'lead code format IC-001');

-- 11. Readiness requires verified cleaning
SELECT pg_temp.expect(NOT coalesce((SELECT is_ready FROM v_unit_readiness WHERE property_id='P-BER-001'), false), 'unit not Ready without verified cleaning');

\echo 'All guard-rail tests passed.'
