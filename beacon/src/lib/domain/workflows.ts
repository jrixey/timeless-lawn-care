import type { TenantDb } from "@/lib/db/tenant";
import type { Workflow, WorkflowRun, WorkflowType } from "./types.js";

export async function getWorkflow(
  db: TenantDb,
  clientId: string,
  type: WorkflowType,
): Promise<Workflow | null> {
  const { rows } = await db.query<Workflow>(
    "SELECT * FROM workflows WHERE client_id = $1 AND type = $2",
    [clientId, type],
  );
  return rows[0] ?? null;
}

export async function listWorkflows(db: TenantDb, clientId?: string): Promise<Workflow[]> {
  const params: unknown[] = [];
  let filter = "";
  if (clientId) {
    params.push(clientId);
    filter = "WHERE client_id = $1";
  }
  const { rows } = await db.query<Workflow>(
    `SELECT * FROM workflows ${filter} ORDER BY type`,
    params,
  );
  return rows;
}

export async function upsertWorkflow(
  db: TenantDb,
  input: {
    agencyId: string;
    clientId: string;
    type: WorkflowType;
    enabled?: boolean;
    config?: Record<string, unknown>;
  },
): Promise<Workflow> {
  const { rows } = await db.query<Workflow>(
    `INSERT INTO workflows (agency_id, client_id, type, enabled, config)
     VALUES ($1,$2,$3,COALESCE($4,true),COALESCE($5,'{}'::jsonb))
     ON CONFLICT (client_id, type)
     DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.type,
      input.enabled ?? null,
      input.config ? JSON.stringify(input.config) : null,
    ],
  );
  return rows[0]!;
}

/**
 * Enroll a contact into a workflow. Idempotent: the partial unique index on
 * (workflow_id, contact_id) WHERE status='active' guarantees at most one active
 * run, so a concurrent/duplicate enroll returns the existing active run.
 */
export async function enrollRun(
  db: TenantDb,
  input: {
    agencyId: string;
    clientId: string;
    workflowId: string;
    contactId: string;
    context?: Record<string, unknown>;
  },
): Promise<WorkflowRun> {
  const { rows } = await db.query<WorkflowRun>(
    `INSERT INTO workflow_runs (agency_id, client_id, workflow_id, contact_id, context)
     VALUES ($1,$2,$3,$4,COALESCE($5,'{}'::jsonb))
     ON CONFLICT (workflow_id, contact_id) WHERE status = 'active'
     DO NOTHING
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.workflowId,
      input.contactId,
      input.context ? JSON.stringify(input.context) : null,
    ],
  );
  if (rows[0]) return rows[0];
  const existing = await db.query<WorkflowRun>(
    "SELECT * FROM workflow_runs WHERE workflow_id = $1 AND contact_id = $2 AND status = 'active'",
    [input.workflowId, input.contactId],
  );
  return existing.rows[0]!;
}

export async function advanceRun(
  db: TenantDb,
  id: string,
  step: number,
): Promise<void> {
  await db.query("UPDATE workflow_runs SET current_step = $2 WHERE id = $1", [id, step]);
}

export async function completeRun(db: TenantDb, id: string): Promise<void> {
  await db.query(
    "UPDATE workflow_runs SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'active'",
    [id],
  );
}

/** Cancel all active runs for a contact (e.g., on opt-out or successful booking). */
export async function cancelRunsForContact(
  db: TenantDb,
  contactId: string,
  onlyTypes?: WorkflowType[],
): Promise<number> {
  const params: unknown[] = [contactId];
  let typeFilter = "";
  if (onlyTypes && onlyTypes.length > 0) {
    params.push(onlyTypes);
    typeFilter = `AND workflow_id IN (SELECT id FROM workflows WHERE type = ANY($2))`;
  }
  const { rowCount } = await db.query(
    `UPDATE workflow_runs SET status = 'canceled', canceled_at = now()
     WHERE contact_id = $1 AND status = 'active' ${typeFilter}`,
    params,
  );
  return rowCount ?? 0;
}

export async function getActiveRun(
  db: TenantDb,
  id: string,
): Promise<WorkflowRun | null> {
  const { rows } = await db.query<WorkflowRun>(
    "SELECT * FROM workflow_runs WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}
