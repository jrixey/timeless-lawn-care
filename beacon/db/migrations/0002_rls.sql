-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_rls: Row-Level Security. Enforced for the non-superuser `beacon_app`
-- runtime role. The `postgres` superuser (used only for migrations/seeding)
-- bypasses RLS unconditionally, which is what lets seeding write across tenants.
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns true iff a row's (agency_id, client_id) is inside the current session
-- scope set by `withTenant`. An empty/missing client scope ⇒ agency-wide access
-- (still strictly limited to one agency). A missing agency scope ⇒ NO access.
CREATE OR REPLACE FUNCTION app_in_scope(row_agency uuid, row_client uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT row_agency = nullif(current_setting('app.agency_id', true), '')::uuid
     AND (
       nullif(current_setting('app.client_id', true), '') IS NULL
       OR row_client = nullif(current_setting('app.client_id', true), '')::uuid
     );
$$;

-- ── agencies: only the current agency row is visible ────────────────────────
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_self ON agencies
  USING (id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.agency_id', true), '')::uuid);

-- ── clients: the client's own id IS the client scope ────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY client_tenant ON clients
  USING (app_in_scope(agency_id, id))
  WITH CHECK (app_in_scope(agency_id, id));

-- ── Standard tenant tables (agency_id + client_id) ──────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant ON users
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant ON contacts
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY conversations_tenant ON conversations
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY messages_tenant ON messages
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls FORCE ROW LEVEL SECURITY;
CREATE POLICY calls_tenant ON calls
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_tenant ON appointments
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY reviews_tenant ON reviews
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows FORCE ROW LEVEL SECURITY;
CREATE POLICY workflows_tenant ON workflows
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY workflow_runs_tenant ON workflow_runs
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

-- jobs.client_id may be NULL (agency-level jobs); app_in_scope handles that:
-- agency-level rows are visible only in an agency-wide scope.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY jobs_tenant ON jobs
  USING (app_in_scope(agency_id, client_id))
  WITH CHECK (app_in_scope(agency_id, client_id));

-- ── Privileges for the runtime role ─────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO beacon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO beacon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO beacon_app;
