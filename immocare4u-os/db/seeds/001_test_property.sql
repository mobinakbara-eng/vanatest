-- Test property for Phase 1/2. All values are PLACEHOLDERS — replace with
-- real, verified data during onboarding (WF-15). No real secrets here:
-- restricted facts only carry a secret_ref.
SET search_path = ic, public;

INSERT INTO properties (property_id, smoobu_apartment_id, internal_name, city_code, street_address,
                        postal_code, floor, unit_number, op_status, default_language,
                        check_in_time, check_out_time, max_guests, lock_type, lock_provider)
VALUES ('P-BER-001', NULL, 'TEST – Berlin Unit 1', 'BER', '<<Straße Hausnr.>>', '<<PLZ>>', '<<Etage>>', '<<WE>>',
        'READY_FOR_TEST', 'de', '15:00', '11:00', 2, 'KEY_BOX_FIXED', NULL);

INSERT INTO property_compliance_items (property_id, item_code) VALUES
 ('P-BER-001','ZWECKENTFREMDUNG_PERMIT'),
 ('P-BER-001','REGISTRATION_NUMBER'),
 ('P-BER-001','SUBLET_PERMISSION'),
 ('P-BER-001','BRANDSCHUTZ'),
 ('P-BER-001','INSURANCE');

INSERT INTO property_kb_entries (property_id, category, key, language, value_text, secret_ref, visibility, release_offset_minutes, source, validity, verified_at) VALUES
 ('P-BER-001','CHECKIN','check_in_time','en','Check-in is possible from 3:00 pm.',NULL,'PUBLIC_GUEST',NULL,'Contract/House rules v1','VERIFIED',now()),
 ('P-BER-001','CHECKIN','check_in_time','de','Der Check-in ist ab 15:00 Uhr möglich.',NULL,'PUBLIC_GUEST',NULL,'Contract/House rules v1','VERIFIED',now()),
 ('P-BER-001','CHECKOUT','check_out_time','en','Check-out is by 11:00 am.',NULL,'PUBLIC_GUEST',NULL,'House rules v1','VERIFIED',now()),
 ('P-BER-001','CHECKOUT','check_out_time','de','Der Check-out ist bis 11:00 Uhr.',NULL,'PUBLIC_GUEST',NULL,'House rules v1','VERIFIED',now()),
 ('P-BER-001','WIFI','wifi_ssid','en','<<SSID>>',NULL,'TIMED_GUEST',-1440,'On-site check','UNVERIFIED',NULL),
 ('P-BER-001','WIFI','wifi_password','en',NULL,'vault://properties/P-BER-001/wifi_password','RESTRICTED',NULL,'On-site check','UNVERIFIED',NULL),
 ('P-BER-001','ENTRANCE','keybox_code','en',NULL,'vault://properties/P-BER-001/keybox_code','RESTRICTED',NULL,'Owner handover','UNVERIFIED',NULL),
 ('P-BER-001','EMERGENCY','emergency_numbers','en','In an emergency call 112 (fire/ambulance) or 110 (police).',NULL,'PUBLIC_GUEST',NULL,'Public info','VERIFIED',now()),
 ('P-BER-001','EMERGENCY','emergency_numbers','de','Im Notfall wählen Sie 112 (Feuerwehr/Rettungsdienst) oder 110 (Polizei).',NULL,'PUBLIC_GUEST',NULL,'Public info','VERIFIED',now());

INSERT INTO property_message_schedules (property_id, template_code, anchor, offset_minutes, enabled, requires_access_authorization) VALUES
 ('P-BER-001','WELCOME','BOOKING',5,false,false),
 ('P-BER-001','PRE_ARRIVAL_24H','CHECK_IN',-1440,false,false),
 ('P-BER-001','ARRIVAL_DAY','CHECK_IN',-360,false,false),
 ('P-BER-001','ENTRY_GUIDE','CHECK_IN',-120,false,false),
 ('P-BER-001','ACCESS_INFO','CHECK_IN',-60,false,true),
 ('P-BER-001','CHECKOUT_REMINDER','CHECK_OUT',-900,false,false),
 ('P-BER-001','FEEDBACK','CHECK_OUT',240,false,false);
