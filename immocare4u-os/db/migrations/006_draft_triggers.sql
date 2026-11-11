-- Migration 006: Supabase ic-tick wakes n8n only when a guest message needs an AI draft.
-- Each message is announced at most once every 15 min (no double Claude calls while n8n works).
BEGIN;
SET search_path = ic, public;
CREATE TABLE IF NOT EXISTS draft_triggers (
  message_pk   bigint PRIMARY KEY REFERENCES messages ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
