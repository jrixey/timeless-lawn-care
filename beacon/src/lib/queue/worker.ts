import { adminPool } from "@/lib/db/pool";
import { withTenant } from "@/lib/db/tenant";
import type { Adapters } from "@/lib/adapters";
import type { Job } from "@/lib/domain/types";
import { handleJob } from "@/lib/workflows/handlers";
import { redact } from "@/lib/log";

/** Reset jobs stuck in 'running' (e.g., a crashed worker) back to pending. */
export async function resetStaleJobs(staleSeconds = 120): Promise<number> {
  const { rowCount } = await adminPool().query(
    `UPDATE jobs SET status = 'pending', locked_at = NULL
       WHERE status = 'running' AND locked_at < now() - ($1 || ' seconds')::interval`,
    [staleSeconds],
  );
  return rowCount ?? 0;
}

/**
 * Atomically claim up to `limit` due jobs. Uses FOR UPDATE SKIP LOCKED so
 * multiple workers never grab the same job. Runs on the admin pool because the
 * queue is cross-tenant infrastructure (like migrations); each job is then
 * EXECUTED inside a tenant-scoped transaction.
 */
async function claim(now: Date, limit: number): Promise<Job[]> {
  const { rows } = await adminPool().query<Job>(
    `UPDATE jobs SET status = 'running', locked_at = now()
       WHERE id IN (
         SELECT id FROM jobs
           WHERE status = 'pending' AND run_at <= $1
           ORDER BY run_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $2
       )
     RETURNING *`,
    [now.toISOString(), limit],
  );
  return rows;
}

async function runOne(adapters: Adapters, job: Job, now: Date): Promise<void> {
  try {
    await withTenant({ agencyId: job.agency_id, clientId: job.client_id }, async (db) => {
      const result = await handleJob(db, adapters, job, now);
      if (result.status === "done") {
        await db.query("UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = $1", [job.id]);
      } else {
        await db.query(
          "UPDATE jobs SET status = 'pending', run_at = $2, locked_at = NULL WHERE id = $1",
          [job.id, result.runAt.toISOString()],
        );
      }
    });
  } catch (err) {
    const message = String(redact((err as Error).message ?? "error")).slice(0, 500);
    // Exponential backoff; give up after max_attempts.
    await adminPool().query(
      `UPDATE jobs SET
         attempts = attempts + 1,
         last_error = $2,
         locked_at = NULL,
         status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
         run_at = CASE WHEN attempts + 1 >= max_attempts
                       THEN run_at
                       ELSE now() + (power(2, attempts) * interval '15 seconds') END
       WHERE id = $1`,
      [job.id, message],
    );
  }
}

/** Claim and process one batch of due jobs. Returns the number processed. */
export async function processDueJobs(
  adapters: Adapters,
  now: Date = new Date(),
  limit = 20,
): Promise<number> {
  const jobs = await claim(now, limit);
  for (const job of jobs) {
    await runOne(adapters, job, now);
  }
  return jobs.length;
}
