-- Migration 008: kb_snapshot() – a restorable SQL backup of everything that cannot be re-synced from Smoobu:
--   knowledge base (incl. learned facts), apartments, message schedules, settings.
-- No guest data (reservations / messages come back from Smoobu) and no secrets (RESTRICTED rows / secret_ref skipped).
-- Restore: run the returned text in the Supabase SQL editor (idempotent: INSERT … ON CONFLICT DO UPDATE).
BEGIN;
SET search_path = ic, public;

CREATE OR REPLACE FUNCTION kb_snapshot() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ic, public AS $$
SELECT concat_ws(E'\n',
  '-- ImmoCare4U knowledge backup ' || to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') || ' (Europe/Berlin)',
  '-- ' || (SELECT count(*) FROM property_kb_entries WHERE visibility <> 'RESTRICTED' AND secret_ref IS NULL) || ' knowledge rows, '
        || (SELECT count(*) FROM properties) || ' apartments. Restore: run this file in the Supabase SQL editor.',
  'BEGIN;',
  (SELECT string_agg(format(
     'INSERT INTO ic.properties (property_id, internal_name, city_code, smoobu_apartment_id, street_address, postal_code, building, unit_number, timezone, op_status, default_language, check_in_time, check_out_time, max_guests, lock_type, ai_auto_reply_enabled) VALUES (%L, %L, %L, %s, %L, %L, %L, %L, %L, %L, %L, %L, %L, %s, %L, %L) ON CONFLICT (property_id) DO UPDATE SET internal_name = EXCLUDED.internal_name, smoobu_apartment_id = EXCLUDED.smoobu_apartment_id, street_address = EXCLUDED.street_address, postal_code = EXCLUDED.postal_code, check_in_time = EXCLUDED.check_in_time, check_out_time = EXCLUDED.check_out_time, max_guests = EXCLUDED.max_guests, ai_auto_reply_enabled = EXCLUDED.ai_auto_reply_enabled;',
     property_id, internal_name, city_code, coalesce(smoobu_apartment_id::text, 'NULL'), street_address, postal_code, building, unit_number, timezone, op_status, default_language, check_in_time, check_out_time, coalesce(max_guests::text, 'NULL'), lock_type, ai_auto_reply_enabled), E'\n' ORDER BY property_id)
   FROM properties),
  (SELECT string_agg(format(
     'INSERT INTO ic.property_kb_entries (property_id, category, key, language, value_text, visibility, release_offset_minutes, source, validity, verified_at) VALUES (%L, %L, %L, %L, %L, %L, %s, %L, %L, %L) ON CONFLICT (property_id, key, language) DO UPDATE SET category = EXCLUDED.category, value_text = EXCLUDED.value_text, visibility = EXCLUDED.visibility, release_offset_minutes = EXCLUDED.release_offset_minutes, source = EXCLUDED.source, validity = EXCLUDED.validity, verified_at = EXCLUDED.verified_at;',
     property_id, category, key, language, value_text, visibility, coalesce(release_offset_minutes::text, 'NULL'), source, validity, verified_at), E'\n' ORDER BY property_id, key, language)
   FROM property_kb_entries WHERE visibility <> 'RESTRICTED' AND secret_ref IS NULL AND value_text IS NOT NULL),
  (SELECT string_agg(format(
     'INSERT INTO ic.property_message_schedules (property_id, template_code, anchor, offset_minutes, enabled, requires_access_authorization) VALUES (%L, %L, %L, %s, %L, %L) ON CONFLICT (property_id, template_code) DO UPDATE SET anchor = EXCLUDED.anchor, offset_minutes = EXCLUDED.offset_minutes, enabled = EXCLUDED.enabled, requires_access_authorization = EXCLUDED.requires_access_authorization;',
     property_id, template_code, anchor, offset_minutes, enabled, requires_access_authorization), E'\n' ORDER BY property_id, template_code)
   FROM property_message_schedules),
  (SELECT string_agg(format(
     'INSERT INTO ic.settings (key, value, note) VALUES (%L, %L, %L) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note;',
     key, value, note), E'\n' ORDER BY key)
   FROM settings),
  'COMMIT;')
$$;
REVOKE ALL ON FUNCTION kb_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kb_snapshot() TO ic_n8n;
COMMIT;
