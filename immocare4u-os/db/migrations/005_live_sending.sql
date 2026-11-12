-- Migration 005: go-live (owner decision 11.11.2026: trial is over).
--   ic.settings.LIVE_SENDING = 'on'  → scheduled messages and level-6 replies are really sent
--                             'off' → kill switch: nothing is sent automatically
--                                      (replies the manager approves by e-mail are always sent)
--   CAFE_TIP: partner offer, first morning of the stay at 09:00 (check-in 15:00 + 18 h).
BEGIN;
SET search_path = ic, public;
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON settings TO ic_n8n;
INSERT INTO settings (key, value, note)
VALUES ('LIVE_SENDING', 'off', 'on = scheduled messages + level-6 replies are sent automatically; off = kill switch')
ON CONFLICT (key) DO NOTHING;

INSERT INTO property_message_schedules (property_id, template_code, anchor, offset_minutes, enabled)
SELECT property_id, 'CAFE_TIP', 'CHECK_IN', 1080, true FROM properties
ON CONFLICT (property_id, template_code) DO NOTHING;
COMMIT;
