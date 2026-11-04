-- Migration 002: WhatsApp as approval/alert channel (decision 2026-11-04)
BEGIN;
SET search_path = ic, public;
ALTER TABLE staff ADD COLUMN whatsapp_phone text UNIQUE CHECK (whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE approvals ADD COLUMN channel text NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP','TELEGRAM','EMAIL'));
ALTER TABLE approvals ADD COLUMN channel_message_id text;   -- WhatsApp wamid
UPDATE integrations SET status = 'PLANNED', notes = 'Replaced by WHATSAPP_CLOUD_API' WHERE integration_code = 'TELEGRAM_BOT';
INSERT INTO integrations (integration_code, description, status, notes) VALUES
 ('WHATSAPP_CLOUD_API','Meta WhatsApp Business Cloud API for manager approvals and alerts','REQUIRES_VERIFICATION',
  'Needs Meta Business, dedicated number, approved utility templates (24h window)');
COMMIT;
