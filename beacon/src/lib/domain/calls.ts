import type { TenantDb } from "@/lib/db/tenant";

export interface Call {
  id: string;
  agency_id: string;
  client_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  status: "ringing" | "in_progress" | "completed" | "missed" | "voicemail" | "failed";
  recording_url: string | null;
  transcript: unknown;
  outcome: unknown;
  provider_call_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export async function findCallByProviderId(
  db: TenantDb,
  providerCallId: string,
): Promise<Call | null> {
  const { rows } = await db.query<Call>(
    "SELECT * FROM calls WHERE provider_call_id = $1",
    [providerCallId],
  );
  return rows[0] ?? null;
}

export async function createCall(
  db: TenantDb,
  input: {
    agencyId: string;
    clientId: string;
    contactId?: string | null;
    conversationId?: string | null;
    direction: "inbound" | "outbound";
    fromNumber?: string | null;
    toNumber?: string | null;
    status: Call["status"];
    providerCallId?: string | null;
    transcript?: unknown;
    outcome?: unknown;
  },
): Promise<Call> {
  const { rows } = await db.query<Call>(
    `INSERT INTO calls
       (agency_id, client_id, contact_id, conversation_id, direction, from_number, to_number,
        status, provider_call_id, transcript, outcome, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.contactId ?? null,
      input.conversationId ?? null,
      input.direction,
      input.fromNumber ?? null,
      input.toNumber ?? null,
      input.status,
      input.providerCallId ?? null,
      input.transcript ? JSON.stringify(input.transcript) : null,
      input.outcome ? JSON.stringify(input.outcome) : null,
    ],
  );
  return rows[0]!;
}

export async function listCalls(db: TenantDb, clientId?: string): Promise<Call[]> {
  const params: unknown[] = [];
  let filter = "";
  if (clientId) {
    params.push(clientId);
    filter = "WHERE client_id = $1";
  }
  const { rows } = await db.query<Call>(
    `SELECT * FROM calls ${filter} ORDER BY created_at DESC LIMIT 200`,
    params,
  );
  return rows;
}
