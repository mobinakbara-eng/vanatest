-- =====================================================================
-- ImmoCare4U OS — Migration 001: Foundation schema
-- Target: PostgreSQL >= 14
-- Status: PLANNED (tested locally against PostgreSQL 16; not yet deployed)
--
-- Design principles
--  * Every property-scoped table carries property_id (hard tenant boundary).
--  * Secrets (access codes, Wi-Fi passwords, API keys) are NEVER stored in
--    plaintext here. Restricted values live in a secret store; this DB keeps a
--    reference (secret_ref) plus release rules.
--  * All writes from webhooks are idempotent (unique idempotency keys).
--  * Every knowledge item has source, verified_at and validity status.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()
CREATE SCHEMA IF NOT EXISTS ic;
SET search_path = ic, public;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
CREATE TYPE impl_status        AS ENUM ('EXISTING','PLANNED','REQUIRES_VERIFICATION');
CREATE TYPE cooperation_model  AS ENUM ('A_MANAGEMENT','B_FIXED_RENT','C_REVENUE_SHARE','D_HYBRID','E_MODULAR');
CREATE TYPE property_op_status AS ENUM ('PROSPECT','ONBOARDING','LEGAL_REVIEW','READY_FOR_TEST','ACTIVE','PAUSED','OFFBOARDED');
CREATE TYPE data_validity      AS ENUM ('VERIFIED','UNVERIFIED','OUTDATED','REJECTED');
CREATE TYPE kb_visibility      AS ENUM ('PUBLIC_GUEST','TIMED_GUEST','INTERNAL','RESTRICTED');
CREATE TYPE msg_direction      AS ENUM ('INBOUND','OUTBOUND');
CREATE TYPE msg_level          AS ENUM ('AUTO','REVIEW','CRITICAL','EMERGENCY');
CREATE TYPE approval_status    AS ENUM ('PENDING','APPROVED','EDITED','REJECTED','TAKEN_OVER','EXPIRED','CANCELLED');
CREATE TYPE outbound_status    AS ENUM ('DRAFT','QUEUED','SENT','FAILED','BLOCKED','SUPPRESSED');
CREATE TYPE ticket_status      AS ENUM ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','VERIFIED','CLOSED');
CREATE TYPE task_status        AS ENUM ('PLANNED','ASSIGNED','IN_PROGRESS','DONE','VERIFIED','DELAYED','CANCELLED');
CREATE TYPE lead_status        AS ENUM ('NEW','UPDATED','KNOWN','UNAVAILABLE');
CREATE TYPE lead_grade         AS ENUM ('A','B','C');
CREATE TYPE priority_level     AS ENUM ('LOW','MEDIUM','HIGH','URGENT');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------
CREATE TABLE cities (
  city_code     text PRIMARY KEY,                 -- BER, CGN, DUS
  name          text NOT NULL,
  timezone      text NOT NULL DEFAULT 'Europe/Berlin',
  is_target     boolean NOT NULL DEFAULT true,     -- target market
  -- "has_active_units" is derived from properties, never set manually
  notes         text
);

CREATE TABLE partners (                            -- owners, Hausverwaltungen, agents
  partner_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_type  text NOT NULL CHECK (partner_type IN ('OWNER','HAUSVERWALTUNG','AGENT','DEVELOPER','OPERATOR','OTHER')),
  display_name  text NOT NULL,
  contact_email text,
  contact_phone text,
  external_contact_allowed boolean NOT NULL DEFAULT false,  -- outbound contact requires explicit approval anyway
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  property_id         text PRIMARY KEY CHECK (property_id ~ '^P-[A-Z]{3}-[0-9]{3,}$'), -- e.g. P-BER-001
  smoobu_apartment_id bigint UNIQUE,
  internal_name       text NOT NULL,
  city_code           text NOT NULL REFERENCES cities,
  street_address      text NOT NULL,
  postal_code         text,
  building            text,
  floor               text,
  unit_number         text,
  timezone            text NOT NULL DEFAULT 'Europe/Berlin',
  op_status           property_op_status NOT NULL DEFAULT 'PROSPECT',
  default_language    text NOT NULL DEFAULT 'de',
  check_in_time       time,
  check_out_time      time,
  max_guests          int,
  lock_type           text CHECK (lock_type IN ('SMART_LOCK','KEY_BOX_FIXED','KEY_HANDOVER','OTHER')),
  lock_provider       text,                         -- e.g. Nuki, igloohome (adapter name)
  lock_device_ref     text,                         -- provider device id (not secret)
  ai_auto_reply_enabled boolean NOT NULL DEFAULT false, -- off until property passes Phase 2 tests
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_properties_upd BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE property_contracts (
  contract_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         text NOT NULL REFERENCES properties,
  partner_id          uuid REFERENCES partners,
  model               cooperation_model NOT NULL,
  valid_from          date NOT NULL,
  valid_to            date,
  monthly_rent_eur    numeric(12,2),
  revenue_share_pct   numeric(5,2) CHECK (revenue_share_pct BETWEEN 0 AND 100),
  management_fee_pct  numeric(5,2) CHECK (management_fee_pct BETWEEN 0 AND 100),
  subletting_allowed  boolean,                      -- NULL = unknown => blocks activation
  short_term_use_allowed boolean,                   -- per contract
  obligations         text,
  restrictions        text,
  document_ref        text,                         -- link to stored contract (restricted)
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Legal / operational checklist. Activation is blocked until all REQUIRED items are VERIFIED.
CREATE TABLE property_compliance_items (
  item_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL REFERENCES properties,
  item_code     text NOT NULL,   -- ZWECKENTFREMDUNG_PERMIT, REGISTRATION_NUMBER, NUTZUNGSAENDERUNG, BRANDSCHUTZ, SUBLET_PERMISSION, INSURANCE, ...
  required      boolean NOT NULL DEFAULT true,
  status        data_validity NOT NULL DEFAULT 'UNVERIFIED',
  evidence_ref  text,
  verified_by   text,
  verified_at   timestamptz,
  expires_at    date,
  notes         text,
  UNIQUE (property_id, item_code)
);

-- Property Knowledge Base: one row per fact, per language.
CREATE TABLE property_kb_entries (
  kb_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL REFERENCES properties ON DELETE CASCADE,
  category      text NOT NULL,     -- WIFI, CHECKIN, CHECKOUT, PARKING, TRANSPORT, WASTE, KITCHEN, HEATING, APPLIANCE, HOUSE_RULES, EMERGENCY, ENTRANCE, LOCAL
  key           text NOT NULL,     -- e.g. wifi_ssid, heating_troubleshooting
  language      text NOT NULL DEFAULT 'en',
  value_text    text,              -- NULL when value is a secret (see secret_ref)
  secret_ref    text,              -- pointer into secret store, e.g. vault://properties/P-BER-001/wifi_password
  visibility    kb_visibility NOT NULL DEFAULT 'PUBLIC_GUEST',
  release_offset_minutes int,      -- for TIMED_GUEST: minutes relative to check-in (negative = before)
  source        text NOT NULL,     -- who/what provided it
  validity      data_validity NOT NULL DEFAULT 'UNVERIFIED',
  verified_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (value_text IS NOT NULL OR secret_ref IS NOT NULL),
  CHECK (visibility <> 'TIMED_GUEST' OR release_offset_minutes IS NOT NULL),
  UNIQUE (property_id, key, language)
);
CREATE TRIGGER trg_kb_upd BEFORE UPDATE ON property_kb_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE media_assets (
  asset_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL REFERENCES properties ON DELETE CASCADE,
  asset_type    text NOT NULL CHECK (asset_type IN ('ENTRANCE_VIDEO','UNIT_ROUTE_VIDEO','LOCK_VIDEO','AMENITY_VIDEO','HOUSE_MANUAL','PHOTO')),
  url           text NOT NULL,     -- signed / guest-guide URL, never public bucket listing
  language      text,
  visibility    kb_visibility NOT NULL DEFAULT 'TIMED_GUEST',
  validity      data_validity NOT NULL DEFAULT 'UNVERIFIED',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Per-property message schedule (offsets relative to check-in / check-out).
CREATE TABLE property_message_schedules (
  schedule_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL REFERENCES properties ON DELETE CASCADE,
  template_code text NOT NULL,     -- WELCOME, PRE_ARRIVAL_24H, ARRIVAL_DAY, ENTRY_GUIDE, ACCESS_INFO, CHECKOUT_REMINDER, FEEDBACK
  anchor        text NOT NULL CHECK (anchor IN ('BOOKING','CHECK_IN','CHECK_OUT')),
  offset_minutes int NOT NULL,
  enabled       boolean NOT NULL DEFAULT false,
  requires_access_authorization boolean NOT NULL DEFAULT false,
  UNIQUE (property_id, template_code)
);

-- ---------------------------------------------------------------------
-- Staff & roles (application-level RBAC, mirrored by DB roles below)
-- ---------------------------------------------------------------------
CREATE TABLE staff (
  staff_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('ADMIN','MANAGER','OPERATIONS','CLEANER','TECHNICIAN','ACQUISITION','VIEWER')),
  telegram_chat_id bigint UNIQUE,
  email         text,
  active        boolean NOT NULL DEFAULT true,
  approval_limit_eur numeric(12,2) NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- Reservations & guests (minimal PII, retention-managed)
-- ---------------------------------------------------------------------
CREATE TABLE guests (
  guest_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smoobu_guest_id bigint UNIQUE,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  language        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  erase_after     date              -- GDPR retention deadline
);

CREATE TABLE reservations (
  reservation_id        bigint PRIMARY KEY,           -- Smoobu reservation id
  property_id           text REFERENCES properties,   -- NULL => unmapped apartment => must escalate
  smoobu_apartment_id   bigint NOT NULL,
  guest_id              uuid REFERENCES guests,
  channel_name          text,                         -- Airbnb, Booking.com, Direct ...
  reference_id          text,                         -- channel booking reference
  arrival               date NOT NULL,
  departure             date NOT NULL,
  check_in_at           timestamptz,                  -- resolved with property timezone
  check_out_at          timestamptz,
  adults                int,
  children              int,
  status                text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','MODIFIED','CANCELLED','DELETED','BLOCKED')),
  is_blocked_period     boolean NOT NULL DEFAULT false,
  price_total           numeric(12,2),
  payment_status        text,                         -- REQUIRES_VERIFICATION: depends on channel data
  raw                   jsonb NOT NULL,
  last_synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (departure >= arrival)
);
CREATE INDEX ON reservations (property_id, arrival);
CREATE INDEX ON reservations (property_id, departure);
CREATE TRIGGER trg_res_upd BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Reliability: webhook inbox, dead letters, automation runs
-- ---------------------------------------------------------------------
CREATE TABLE webhook_events (
  event_id        bigserial PRIMARY KEY,
  source          text NOT NULL DEFAULT 'smoobu',
  action          text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,     -- e.g. smoobu:newMessage:1234
  payload         jsonb NOT NULL,
  payload_sha256  text NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  process_status  text NOT NULL DEFAULT 'RECEIVED' CHECK (process_status IN ('RECEIVED','PROCESSING','DONE','FAILED','IGNORED')),
  attempts        int NOT NULL DEFAULT 0,
  last_error      text
);
CREATE INDEX ON webhook_events (process_status, received_at);

CREATE TABLE dead_letter_events (
  dlq_id        bigserial PRIMARY KEY,
  workflow      text NOT NULL,
  ref_table     text,
  ref_id        text,
  payload       jsonb,
  error         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   text
);

CREATE TABLE automation_runs (
  run_id        bigserial PRIMARY KEY,
  workflow      text NOT NULL,          -- WF-01 ... WF-16
  n8n_execution_id text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  summary       jsonb
);

-- ---------------------------------------------------------------------
-- Guest communication
-- ---------------------------------------------------------------------
CREATE TABLE messages (
  message_pk        bigserial PRIMARY KEY,
  smoobu_message_id bigint UNIQUE,                 -- NULL for drafts not yet sent
  reservation_id    bigint NOT NULL REFERENCES reservations,
  property_id       text REFERENCES properties,
  direction         msg_direction NOT NULL,
  sender            text NOT NULL CHECK (sender IN ('GUEST','HOST','AI','MANAGER','SYSTEM')),
  subject           text,
  body              text NOT NULL,
  language          text,
  sent_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  erase_after       date
);
CREATE INDEX ON messages (reservation_id, sent_at);

CREATE TABLE message_classifications (
  classification_id bigserial PRIMARY KEY,
  message_pk      bigint NOT NULL REFERENCES messages ON DELETE CASCADE,
  level           msg_level NOT NULL,
  intent          text NOT NULL,         -- WIFI, CHECKOUT_TIME, ENTRY, HEATING, REFUND, ...
  rule_level      msg_level,             -- deterministic rule engine result
  ai_level        msg_level,             -- LLM result
  ai_confidence   numeric(4,3),
  matched_rules   text[],
  reason          text,
  classified_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbound_messages (
  outbound_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,   -- e.g. reply:<message_pk>  /  sched:<reservation_id>:ACCESS_INFO
  reservation_id  bigint NOT NULL REFERENCES reservations,
  property_id     text NOT NULL REFERENCES properties,
  in_reply_to     bigint REFERENCES messages,
  origin          text NOT NULL CHECK (origin IN ('AI_AUTO','AI_APPROVED','MANAGER','SCHEDULED')),
  body            text NOT NULL,
  contains_restricted boolean NOT NULL DEFAULT false,
  status          outbound_status NOT NULL DEFAULT 'DRAFT',
  test_mode       boolean NOT NULL DEFAULT true,  -- true => never sent to real guest
  smoobu_response jsonb,
  attempts        int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE TABLE approvals (
  approval_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_code   text NOT NULL UNIQUE,   -- short code shown in Telegram, e.g. AP-7F3K
  subject_type    text NOT NULL CHECK (subject_type IN ('GUEST_REPLY','REPAIR_ORDER','PURCHASE','ACCESS_CHANGE','LEAD_CONTACT','REFUND','OTHER')),
  outbound_id     uuid REFERENCES outbound_messages,
  property_id     text REFERENCES properties,
  level           msg_level,
  reason          text NOT NULL,
  proposed_text   text,
  final_text      text,
  status          approval_status NOT NULL DEFAULT 'PENDING',
  requested_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  decided_at      timestamptz,
  decided_by      uuid REFERENCES staff,
  reminders_sent  int NOT NULL DEFAULT 0,
  telegram_message_id bigint
);
CREATE INDEX ON approvals (status, expires_at);

-- ---------------------------------------------------------------------
-- Access control (codes are never stored in plaintext)
-- ---------------------------------------------------------------------
CREATE TABLE access_grants (
  grant_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  bigint NOT NULL REFERENCES reservations,
  property_id     text NOT NULL REFERENCES properties,
  method          text NOT NULL CHECK (method IN ('SMART_LOCK_CODE','KEY_BOX_FIXED','KEY_HANDOVER')),
  provider_grant_ref text,                  -- id returned by lock provider API
  secret_ref      text,                     -- where the code lives (vault/provider), not the code
  valid_from      timestamptz NOT NULL,
  valid_to        timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','CREATED','DELIVERED','REVOKED','FAILED','EXPIRED')),
  delivered_outbound_id uuid REFERENCES outbound_messages,
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  UNIQUE (reservation_id, method),
  CHECK (valid_to > valid_from)
);

-- ---------------------------------------------------------------------
-- Operations: cleaning, maintenance, inventory
-- ---------------------------------------------------------------------
CREATE TABLE cleaning_tasks (
  task_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     text NOT NULL REFERENCES properties,
  after_reservation_id  bigint REFERENCES reservations,
  before_reservation_id bigint REFERENCES reservations,
  scheduled_start timestamptz NOT NULL,
  deadline        timestamptz NOT NULL,
  assignee        uuid REFERENCES staff,
  checklist       jsonb NOT NULL DEFAULT '[]',
  status          task_status NOT NULL DEFAULT 'PLANNED',
  started_at      timestamptz,
  finished_at     timestamptz,
  verified_ready  boolean NOT NULL DEFAULT false,  -- only true => dashboard "Ready"
  photos          text[],
  issues_found    text,
  UNIQUE (property_id, after_reservation_id)
);

CREATE TABLE maintenance_tickets (
  ticket_id       text PRIMARY KEY DEFAULT ('T-' || to_char(now(),'YYMMDD') || '-' || substr(gen_random_uuid()::text,1,6)),
  property_id     text NOT NULL REFERENCES properties,
  reservation_id  bigint REFERENCES reservations,
  category        text NOT NULL CHECK (category IN ('PLUMBING','ELECTRICITY','HEATING','INTERNET','FURNITURE','CLEANING','SECURITY','GUEST_DAMAGE','GENERAL')),
  description     text NOT NULL,
  priority        priority_level NOT NULL DEFAULT 'MEDIUM',
  assignee        uuid REFERENCES staff,
  status          ticket_status NOT NULL DEFAULT 'OPEN',
  deadline        timestamptz,
  estimated_cost_eur numeric(12,2),
  actual_cost_eur numeric(12,2),
  cost_approval_id uuid REFERENCES approvals,
  attachments     text[],
  resolution_notes text,
  source_message_pk bigint REFERENCES messages,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ticket_upd BEFORE UPDATE ON maintenance_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce the lifecycle OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED→CLOSED (forward only, re-open to OPEN allowed)
CREATE OR REPLACE FUNCTION check_ticket_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ord text[] := ARRAY['OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','VERIFIED','CLOSED'];
BEGIN
  IF NEW.status = OLD.status OR NEW.status = 'OPEN' THEN RETURN NEW; END IF;
  IF array_position(ord, NEW.status::text) <> array_position(ord, OLD.status::text) + 1 THEN
    RAISE EXCEPTION 'Invalid ticket transition % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.estimated_cost_eur > 0 AND NEW.status = 'IN_PROGRESS' AND NEW.cost_approval_id IS NULL THEN
    RAISE EXCEPTION 'Ticket % has an estimated cost and needs an approval before work starts', NEW.ticket_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ticket_transition BEFORE UPDATE OF status ON maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION check_ticket_transition();

CREATE TABLE inventory_items (
  item_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL REFERENCES properties,
  name          text NOT NULL,
  quantity      int NOT NULL DEFAULT 0,
  min_quantity  int NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, name)
);

-- ---------------------------------------------------------------------
-- Finance (estimates and actuals are kept strictly apart)
-- ---------------------------------------------------------------------
CREATE TABLE financial_entries (
  entry_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL REFERENCES properties,
  reservation_id bigint REFERENCES reservations,
  period_month  date NOT NULL,              -- first day of month
  category      text NOT NULL CHECK (category IN ('BOOKING_REVENUE','PLATFORM_FEE','CLEANING','RENT','UTILITIES','MAINTENANCE','MANAGEMENT_FEE','REVENUE_SHARE','SUPPLIES','OTHER')),
  amount_eur    numeric(12,2) NOT NULL,     -- positive = income, negative = cost
  kind          text NOT NULL CHECK (kind IN ('ACTUAL','ESTIMATE')),
  source        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON financial_entries (property_id, period_month);

-- ---------------------------------------------------------------------
-- Acquisition (Growth Engine)
-- ---------------------------------------------------------------------
CREATE SEQUENCE lead_code_seq START 1;

CREATE TABLE leads (
  lead_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code      text NOT NULL UNIQUE DEFAULT ('IC-' || lpad(nextval('lead_code_seq')::text, 3, '0')),
  city_code      text REFERENCES cities,
  address_norm   text,                      -- normalised address used for fuzzy dedup
  property_type  text,
  area_sqm       numeric(8,2),
  rooms          numeric(4,1),
  rent_cold_eur  numeric(12,2),
  extra_costs_eur numeric(12,2),
  available_from date,
  legal_use_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (legal_use_status IN ('UNKNOWN','CLAIMED_BY_LISTING','DOCUMENT_PROVIDED','VERIFIED','NOT_PERMITTED')),
  grade          lead_grade,
  risk_level     priority_level,
  status         lead_status NOT NULL DEFAULT 'NEW',
  pipeline_stage text NOT NULL DEFAULT 'SCREENING' CHECK (pipeline_stage IN ('SCREENING','QUALIFIED','CONTACT_DRAFTED','AWAITING_APPROVAL','CONTACTED','NEGOTIATION','LEGAL_REVIEW','WON','LOST')),
  first_seen     timestamptz NOT NULL DEFAULT now(),
  last_seen      timestamptz NOT NULL DEFAULT now(),
  merged_into    uuid REFERENCES leads
);

CREATE TABLE lead_listings (                -- one lead can appear on several portals
  listing_pk     bigserial PRIMARY KEY,
  lead_id        uuid NOT NULL REFERENCES leads,
  source         text NOT NULL,             -- IMMOSCOUT24, IMMOWELT, KLEINANZEIGEN, ...
  listing_id     text,
  url            text NOT NULL,
  contact_public text,
  first_seen     timestamptz NOT NULL DEFAULT now(),
  last_seen      timestamptz NOT NULL DEFAULT now(),
  available      boolean NOT NULL DEFAULT true,
  UNIQUE (source, listing_id),
  UNIQUE (url)
);

CREATE TABLE lead_observations (            -- history of price/status changes
  obs_id     bigserial PRIMARY KEY,
  lead_id    uuid NOT NULL REFERENCES leads,
  observed_at timestamptz NOT NULL DEFAULT now(),
  field      text NOT NULL,
  old_value  text,
  new_value  text,
  source     text
);

CREATE TABLE lead_evaluations (
  eval_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES leads,
  assumptions    jsonb NOT NULL,            -- ADR, occupancy scenarios, fees, sources + dates
  scenarios      jsonb NOT NULL,            -- [{occupancy:0.6, revenue:..., cashflow:...}, ...]
  break_even_occupancy numeric(5,4),
  is_estimate    boolean NOT NULL DEFAULT true CHECK (is_estimate),  -- evaluations are always estimates
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Reporting & governance
-- ---------------------------------------------------------------------
CREATE TABLE report_recipients (
  recipient_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_scope  text NOT NULL CHECK (report_scope IN ('OBJECT_MONITOR','DAILY_OPS','WEEKLY_PERF','MONTHLY_MGMT')),
  email         text NOT NULL,
  role          text NOT NULL CHECK (role IN ('TO','CC')),
  approved_by   text NOT NULL,
  approved_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_scope, email)
);

CREATE TABLE kpi_definitions (
  kpi_code     text PRIMARY KEY,
  name         text NOT NULL,
  definition   text NOT NULL,
  formula_sql  text,
  data_source  text NOT NULL,
  period       text NOT NULL,
  baseline     numeric,
  target       numeric,
  status       impl_status NOT NULL DEFAULT 'PLANNED'
);

CREATE TABLE audit_log (
  audit_id    bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,            -- staff id, 'n8n:WF-03', 'ai-agent'
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  details     jsonb
);
CREATE INDEX ON audit_log (entity, entity_id);

-- Integration registry: makes EXISTING / PLANNED / REQUIRES_VERIFICATION explicit
CREATE TABLE integrations (
  integration_code text PRIMARY KEY,
  description      text NOT NULL,
  status           impl_status NOT NULL,
  verified_at      timestamptz,
  notes            text
);

-- ---------------------------------------------------------------------
-- Guard rails as database logic
-- ---------------------------------------------------------------------

-- 1) A property can only become ACTIVE when every required compliance item is VERIFIED
--    and an active contract exists with subletting/short-term use explicitly allowed.
CREATE OR REPLACE FUNCTION check_property_activation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE open_items int; ok_contract int;
BEGIN
  IF NEW.op_status = 'ACTIVE' AND (OLD.op_status IS DISTINCT FROM 'ACTIVE') THEN
    SELECT count(*) INTO open_items FROM property_compliance_items
      WHERE property_id = NEW.property_id AND required AND status <> 'VERIFIED';
    SELECT count(*) INTO ok_contract FROM property_contracts
      WHERE property_id = NEW.property_id
        AND valid_from <= current_date AND (valid_to IS NULL OR valid_to >= current_date)
        AND subletting_allowed IS TRUE AND short_term_use_allowed IS TRUE;
    IF open_items > 0 OR ok_contract = 0
       OR NOT EXISTS (SELECT 1 FROM property_compliance_items WHERE property_id = NEW.property_id) THEN
      RAISE EXCEPTION 'Property % cannot be activated: % open compliance items, % valid contracts',
        NEW.property_id, open_items, ok_contract;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_property_activation BEFORE UPDATE OF op_status ON properties
  FOR EACH ROW EXECUTE FUNCTION check_property_activation();

-- 2) Outbound messages with restricted content can never be AI_AUTO.
CREATE OR REPLACE FUNCTION check_outbound_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contains_restricted AND NEW.origin = 'AI_AUTO' THEN
    RAISE EXCEPTION 'Restricted content cannot be sent by AI_AUTO (outbound %)', NEW.outbound_id;
  END IF;
  -- property must match the reservation's property (cross-property leak protection)
  IF NOT EXISTS (SELECT 1 FROM reservations r WHERE r.reservation_id = NEW.reservation_id AND r.property_id = NEW.property_id) THEN
    RAISE EXCEPTION 'Outbound property % does not match reservation %', NEW.property_id, NEW.reservation_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_outbound_guard BEFORE INSERT OR UPDATE ON outbound_messages
  FOR EACH ROW EXECUTE FUNCTION check_outbound_guard();

-- 3) Knowledge visible to the AI agent: only VERIFIED, non-restricted rows, no secrets.
CREATE VIEW v_ai_property_kb AS
SELECT property_id, category, key, language, value_text, visibility, release_offset_minutes, verified_at
FROM property_kb_entries
WHERE validity = 'VERIFIED'
  AND visibility IN ('PUBLIC_GUEST','TIMED_GUEST')
  AND secret_ref IS NULL
  AND value_text IS NOT NULL;

-- 4) KB for one reservation, honouring the release time of TIMED_GUEST facts.
CREATE OR REPLACE FUNCTION ai_kb_for_reservation(p_reservation_id bigint, p_now timestamptz DEFAULT now())
RETURNS TABLE (category text, key text, language text, value_text text)
LANGUAGE sql STABLE AS $$
  SELECT k.category, k.key, k.language, k.value_text
  FROM reservations r
  JOIN v_ai_property_kb k ON k.property_id = r.property_id
  WHERE r.reservation_id = p_reservation_id
    AND r.status IN ('CONFIRMED','MODIFIED')
    AND (k.visibility = 'PUBLIC_GUEST'
         OR (r.check_in_at IS NOT NULL
             AND p_now >= r.check_in_at + make_interval(mins => k.release_offset_minutes)
             AND p_now <  coalesce(r.check_out_at, r.check_in_at + interval '30 days')))
$$;

-- 5) Dashboard readiness: a unit is "Ready" only with a verified cleaning task.
CREATE VIEW v_unit_readiness AS
SELECT p.property_id, p.internal_name,
       ct.task_id, ct.deadline, ct.status,
       (ct.verified_ready AND ct.status = 'VERIFIED') AS is_ready
FROM properties p
LEFT JOIN LATERAL (
  SELECT * FROM cleaning_tasks c WHERE c.property_id = p.property_id
  ORDER BY c.deadline DESC LIMIT 1) ct ON true;

-- ---------------------------------------------------------------------
-- Database roles (least privilege). Passwords are set outside migrations.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ic_n8n')      THEN CREATE ROLE ic_n8n NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ic_ai_reader') THEN CREATE ROLE ic_ai_reader NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ic_reporting') THEN CREATE ROLE ic_reporting NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA ic TO ic_n8n, ic_ai_reader, ic_reporting;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ic TO ic_n8n;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ic TO ic_n8n;
REVOKE UPDATE, DELETE ON audit_log FROM ic_n8n;               -- audit log is append-only
-- AI tooling may only read the filtered KB, never raw tables
GRANT SELECT ON v_ai_property_kb TO ic_ai_reader;
GRANT EXECUTE ON FUNCTION ai_kb_for_reservation(bigint, timestamptz) TO ic_ai_reader;
-- Reporting: aggregates only, no guest PII
GRANT SELECT ON properties, reservations, cleaning_tasks, maintenance_tickets, financial_entries,
               leads, lead_listings, approvals, automation_runs, v_unit_readiness, kpi_definitions TO ic_reporting;
REVOKE SELECT ON guests, messages, access_grants FROM ic_reporting;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
INSERT INTO cities (city_code, name, is_target, notes) VALUES
 ('BER','Berlin',true,'Primary market'),
 ('CGN','Köln',true,'Expansion target — no active units until contracts are registered'),
 ('DUS','Düsseldorf',true,'Expansion target — no active units until contracts are registered');

INSERT INTO report_recipients (report_scope, email, role, approved_by) VALUES
 ('OBJECT_MONITOR','aminhassanakbarabadi@gmail.com','TO','Master Prompt v1.0 (Nov 2026)'),
 ('OBJECT_MONITOR','danilomuller247@gmail.com','CC','Master Prompt v1.0 (Nov 2026)'),
 ('OBJECT_MONITOR','mobinakbara@gmail.com','CC','Master Prompt v1.0 (Nov 2026)');

INSERT INTO integrations (integration_code, description, status, notes) VALUES
 ('SMOOBU_API_HMAC','Smoobu REST API with HMAC-SHA256 (X-API-Key/X-Timestamp/X-Nonce/X-Signature)','REQUIRES_VERIFICATION','Legacy Api-Key header deprecated as of 2026-10-31 per docs.smoobu.com; test with real key'),
 ('SMOOBU_WEBHOOK','Smoobu webhooks (newReservation, updateReservation, cancelReservation, deleteReservation, newMessage, ...)','REQUIRES_VERIFICATION','Docs do not describe delivery signing — protect via secret URL token + reconciliation'),
 ('N8N','n8n instance (hosting, version, credentials)','REQUIRES_VERIFICATION','Audit current instance and existing workflows'),
 ('GOOGLE_SHEET_OBJEKTLISTE','Sheet 1Bjag5HOvOBt1A5OlaxK3RQfgkhSgPW89cRnhWe8A9_s','REQUIRES_VERIFICATION','Existing monitor — audit columns before import'),
 ('TELEGRAM_BOT','Manager approval bot','PLANNED',NULL),
 ('LLM','Guest-message classification and drafting','PLANNED',NULL),
 ('SMART_LOCK','Lock provider adapter','REQUIRES_VERIFICATION','Provider and API not yet selected/confirmed'),
 ('LISTING_SOURCES','ImmoScout24 / Immowelt / Kleinanzeigen access','REQUIRES_VERIFICATION','Only via ToS-compliant access (official API, alerts by email, licensed feeds)');

COMMIT;
