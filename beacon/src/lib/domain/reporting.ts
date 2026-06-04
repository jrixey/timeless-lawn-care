import type { TenantDb } from "@/lib/db/tenant";

export interface ClientReport {
  client_id: string;
  client_name: string;
  leads: number;
  booked: number;
  won: number;
  conversations: number;
  outbound_messages: number;
  reviews_requested: number;
  appointments: number;
}

/** Per-client rollup. Agency scope ⇒ all clients; client scope ⇒ just theirs. */
export async function clientReports(db: TenantDb): Promise<ClientReport[]> {
  const { rows } = await db.query<ClientReport>(
    `SELECT
       c.id   AS client_id,
       c.name AS client_name,
       (SELECT count(*)::int FROM contacts ct WHERE ct.client_id = c.id) AS leads,
       (SELECT count(*)::int FROM contacts ct WHERE ct.client_id = c.id AND ct.stage = 'booked') AS booked,
       (SELECT count(*)::int FROM contacts ct WHERE ct.client_id = c.id AND ct.stage = 'won') AS won,
       (SELECT count(*)::int FROM conversations cv WHERE cv.client_id = c.id) AS conversations,
       (SELECT count(*)::int FROM messages m WHERE m.client_id = c.id AND m.direction = 'outbound') AS outbound_messages,
       (SELECT count(*)::int FROM reviews r WHERE r.client_id = c.id AND r.status = 'requested') AS reviews_requested,
       (SELECT count(*)::int FROM appointments a WHERE a.client_id = c.id) AS appointments
     FROM clients c
     ORDER BY c.name`,
  );
  return rows;
}

export interface PipelineCounts {
  new: number;
  contacted: number;
  qualified: number;
  booked: number;
  won: number;
  lost: number;
}

export async function pipelineCounts(db: TenantDb, clientId?: string): Promise<PipelineCounts> {
  const params: unknown[] = [];
  let filter = "";
  if (clientId) {
    params.push(clientId);
    filter = "WHERE client_id = $1";
  }
  const { rows } = await db.query<{ stage: string; n: number }>(
    `SELECT stage, count(*)::int AS n FROM contacts ${filter} GROUP BY stage`,
    params,
  );
  const counts: PipelineCounts = {
    new: 0,
    contacted: 0,
    qualified: 0,
    booked: 0,
    won: 0,
    lost: 0,
  };
  for (const r of rows) {
    if (r.stage in counts) counts[r.stage as keyof PipelineCounts] = r.n;
  }
  return counts;
}
