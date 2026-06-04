-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_init: extensions, helpers, and all tables.
-- Every tenant-scoped table carries BOTH agency_id and client_id.
-- RLS is added in 0002_rls.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- Auto-maintain updated_at on UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Agencies (Beacon's direct customers) ────────────────────────────────────
CREATE TABLE agencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_agencies_updated BEFORE UPDATE ON agencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Clients (white-labeled sub-accounts = primary tenant scope) ──────────────
CREATE TABLE clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name           text NOT NULL,
  slug           text NOT NULL,
  industry       text NOT NULL DEFAULT 'hvac',
  phone          text,
  timezone       text NOT NULL DEFAULT 'America/New_York',
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_link    text,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','paused','archived')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, slug)
);
CREATE INDEX idx_clients_agency ON clients(agency_id);
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Users (agency staff + client staff) ─────────────────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL
                  CHECK (role IN ('agency_admin','agency_member','client_admin','client_member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_agency ON users(agency_id);
CREATE INDEX idx_users_client ON users(client_id);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Contacts (leads / customers) ─────────────────────────────────────────────
CREATE TABLE contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        text,
  phone       text,
  email       text,
  source      text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('web_form','missed_call','inbound_call','inbound_sms','manual','import')),
  stage       text NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new','contacted','qualified','booked','won','lost')),
  tags        jsonb NOT NULL DEFAULT '[]'::jsonb,
  opted_out   boolean NOT NULL DEFAULT false,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_client ON contacts(client_id);
CREATE INDEX idx_contacts_client_stage ON contacts(client_id, stage);
-- A phone number identifies a unique contact within a client.
CREATE UNIQUE INDEX idx_contacts_client_phone ON contacts(client_id, phone) WHERE phone IS NOT NULL;
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Conversations ────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','voice','email')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','snoozed','closed')),
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_inbox ON conversations(client_id, status, last_message_at DESC);
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id          uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction           text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel             text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','voice','email')),
  body                text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','sent','delivered','failed','received')),
  automated           boolean NOT NULL DEFAULT false,
  provider_message_id text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_client ON messages(client_id);
-- Idempotency: a given provider message id is recorded at most once per client.
CREATE UNIQUE INDEX idx_messages_provider ON messages(client_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ── Calls ────────────────────────────────────────────────────────────────────
CREATE TABLE calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id  uuid REFERENCES conversations(id) ON DELETE SET NULL,
  direction        text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number      text,
  to_number        text,
  status           text NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('ringing','in_progress','completed','missed','voicemail','failed')),
  recording_url    text,
  transcript       jsonb,
  outcome          jsonb,
  provider_call_id text,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_client ON calls(client_id);
CREATE UNIQUE INDEX idx_calls_provider ON calls(client_id, provider_call_id)
  WHERE provider_call_id IS NOT NULL;

-- ── Appointments ─────────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title             text NOT NULL DEFAULT 'Service appointment',
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'booked'
                      CHECK (status IN ('proposed','booked','canceled','completed','no_show')),
  location          text,
  notes             text,
  calendar_event_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_client ON appointments(client_id, starts_at);
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','requested','completed','declined')),
  rating         int CHECK (rating BETWEEN 1 AND 5),
  review_link    text,
  requested_at   timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_client ON reviews(client_id);
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Workflows (per-client automation definitions) ───────────────────────────
CREATE TABLE workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type        text NOT NULL
                CHECK (type IN ('instant_textback','lead_followup','review_request')),
  enabled     boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, type)
);
CREATE INDEX idx_workflows_client ON workflows(client_id);
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Workflow runs (a contact moving through a workflow) ──────────────────────
CREATE TABLE workflow_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id   uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','canceled')),
  current_step  int NOT NULL DEFAULT 0,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  canceled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_runs_client ON workflow_runs(client_id);
-- At most one active run of a given workflow per contact (idempotent enrollment).
CREATE UNIQUE INDEX idx_workflow_runs_active
  ON workflow_runs(workflow_id, contact_id) WHERE status = 'active';
CREATE TRIGGER trg_workflow_runs_updated BEFORE UPDATE ON workflow_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Jobs (simple Postgres-backed queue for timed workflow steps) ─────────────
CREATE TABLE jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  type          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed','canceled')),
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 5,
  dedupe_key    text,
  last_error    text,
  locked_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_due ON jobs(status, run_at) WHERE status = 'pending';
-- Dedupe is scoped per client so it can never probe across tenants.
CREATE UNIQUE INDEX idx_jobs_dedupe ON jobs(client_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
