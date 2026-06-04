import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { appPool } from "@/lib/db/pool";

/**
 * The tenant scope every runtime query runs under.
 * - `agencyId` is always required.
 * - `clientId` omitted ⇒ agency-wide access across that agency's clients
 *   (still strictly isolated to the agency).
 * - `role` is informational for app logic; RLS isolation does not depend on it.
 */
export interface TenantScope {
  agencyId: string;
  clientId?: string | null;
  role?: "agency_admin" | "agency_member" | "client_admin" | "client_member";
}

export interface TenantDb {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(label: string, value: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}: not a UUID`);
  }
}

/**
 * Run `fn` inside a transaction whose Postgres session is scoped to the given
 * tenant. We `SET LOCAL` the `app.agency_id` / `app.client_id` settings that
 * the RLS policies key off of. Because the app pool connects as the
 * non-superuser `beacon_app` role, RLS is enforced for every statement here.
 *
 * Using `set_config(..., true)` (the `true` = local to transaction) guarantees
 * the scope cannot leak to the next user of the pooled connection.
 */
export async function withTenant<T>(
  scope: TenantScope,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  assertUuid("agencyId", scope.agencyId);
  if (scope.clientId != null) assertUuid("clientId", scope.clientId);

  const client: PoolClient = await appPool().connect();
  try {
    await client.query("BEGIN");
    // Parameterized set_config so values can never be injected into SQL text.
    await client.query("SELECT set_config('app.agency_id', $1, true)", [scope.agencyId]);
    await client.query("SELECT set_config('app.client_id', $1, true)", [scope.clientId ?? ""]);

    const db: TenantDb = {
      query: (text, params) => client.query(text, params as unknown[] | undefined),
    };
    const result = await fn(db);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  } finally {
    client.release();
  }
}
