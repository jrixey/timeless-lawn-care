import type { TenantDb } from "@/lib/db/tenant";
import type { Job } from "@/lib/domain/types";

export interface EnqueueInput {
  agencyId: string;
  clientId: string | null;
  type: string;
  payload?: Record<string, unknown>;
  /** When the job becomes eligible to run (default: now). */
  runAt?: Date | string;
  /** Stable key; a second enqueue with the same (clientId, dedupeKey) is a no-op. */
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * Enqueue a job inside the current tenant transaction. De-duplicated on
 * (client_id, dedupe_key) so retries/duplicate triggers never double-schedule.
 * Returns the job if newly inserted, or null if a duplicate was suppressed.
 */
export async function enqueueJob(db: TenantDb, input: EnqueueInput): Promise<Job | null> {
  const runAt =
    input.runAt instanceof Date
      ? input.runAt.toISOString()
      : (input.runAt ?? new Date().toISOString());
  const { rows } = await db.query<Job>(
    `INSERT INTO jobs (agency_id, client_id, type, payload, run_at, dedupe_key, max_attempts)
     VALUES ($1,$2,$3,COALESCE($4,'{}'::jsonb),$5,$6,COALESCE($7,5))
     ON CONFLICT (client_id, dedupe_key) WHERE dedupe_key IS NOT NULL
     DO NOTHING
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.type,
      JSON.stringify(input.payload ?? {}),
      runAt,
      input.dedupeKey ?? null,
      input.maxAttempts ?? null,
    ],
  );
  return rows[0] ?? null;
}

/** Cancel pending jobs of given types for a client (e.g., on opt-out). */
export async function cancelPendingJobs(
  db: TenantDb,
  clientId: string,
  types: string[],
): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE jobs SET status = 'canceled'
       WHERE client_id = $1 AND status = 'pending' AND type = ANY($2)`,
    [clientId, types],
  );
  return rowCount ?? 0;
}

/** Cancel pending jobs tied to a specific contact (payload.contactId). */
export async function cancelPendingJobsForContact(
  db: TenantDb,
  clientId: string,
  contactId: string,
  types?: string[],
): Promise<number> {
  const params: unknown[] = [clientId, contactId];
  let typeFilter = "";
  if (types && types.length > 0) {
    params.push(types);
    typeFilter = `AND type = ANY($3)`;
  }
  const { rowCount } = await db.query(
    `UPDATE jobs SET status = 'canceled'
       WHERE client_id = $1 AND status = 'pending'
         AND payload->>'contactId' = $2 ${typeFilter}`,
    params,
  );
  return rowCount ?? 0;
}
