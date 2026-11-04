-- Migration 004: email approval links (Approve / Edit / Take over) and revision chain.
BEGIN;
SET search_path = ic, public;
ALTER TABLE approvals
  ADD COLUMN link_token text NOT NULL DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  ADD COLUMN revision int NOT NULL DEFAULT 1,
  ADD COLUMN instruction text,
  ADD COLUMN parent_approval_id uuid REFERENCES approvals;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_link_token_uq ON approvals (link_token);
COMMIT;
