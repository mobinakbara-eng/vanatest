-- Migration 002: approval/alert channels. Decision 2026-11-04: EMAIL primary (immocare4u.kontakt@gmail.com); WhatsApp kept as option.
BEGIN;
SET search_path = ic, public;
ALTER TABLE staff ADD COLUMN whatsapp_phone text UNIQUE CHECK (whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE approvals ADD COLUMN channel text NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('WHATSAPP','TELEGRAM','EMAIL'));
ALTER TABLE approvals ADD COLUMN channel_message_id text;   -- Gmail message id / WhatsApp wamid
UPDATE integrations SET status = 'PLANNED', notes = 'Replaced by EMAIL approvals' WHERE integration_code = 'TELEGRAM_BOT';
INSERT INTO integrations (integration_code, description, status, notes) VALUES
 ('EMAIL_APPROVALS','Gmail immocare4u.kontakt@gmail.com for approvals/alerts (signed one-time links, POST confirm)','PLANNED',NULL),
 ('WHATSAPP_CLOUD_API','Meta WhatsApp Business Cloud API (optional future channel)','PLANNED',NULL);
COMMIT;
