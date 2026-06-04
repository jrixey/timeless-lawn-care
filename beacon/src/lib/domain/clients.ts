import type { TenantDb } from "@/lib/db/tenant";
import type { Client } from "./types.js";

export async function listClients(db: TenantDb): Promise<Client[]> {
  const { rows } = await db.query<Client>(
    "SELECT * FROM clients ORDER BY created_at DESC",
  );
  return rows;
}

export async function getClient(db: TenantDb, id: string): Promise<Client | null> {
  const { rows } = await db.query<Client>("SELECT * FROM clients WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export interface CreateClientInput {
  agencyId: string;
  name: string;
  slug: string;
  phone?: string | null;
  timezone?: string;
  reviewLink?: string | null;
  aiConfig?: Record<string, unknown>;
  businessHours?: Record<string, unknown>;
}

export async function createClient(db: TenantDb, input: CreateClientInput): Promise<Client> {
  const { rows } = await db.query<Client>(
    `INSERT INTO clients (agency_id, name, slug, phone, timezone, review_link, ai_config, business_hours)
     VALUES ($1,$2,$3,$4,COALESCE($5,'America/New_York'),$6,COALESCE($7,'{}'::jsonb),COALESCE($8,'{}'::jsonb))
     RETURNING *`,
    [
      input.agencyId,
      input.name,
      input.slug,
      input.phone ?? null,
      input.timezone ?? null,
      input.reviewLink ?? null,
      JSON.stringify(input.aiConfig ?? {}),
      JSON.stringify(input.businessHours ?? {}),
    ],
  );
  return rows[0]!;
}

export interface UpdateClientInput {
  name?: string;
  phone?: string | null;
  timezone?: string;
  reviewLink?: string | null;
  status?: Client["status"];
  aiConfig?: Record<string, unknown>;
  businessHours?: Record<string, unknown>;
}

export async function updateClient(
  db: TenantDb,
  id: string,
  input: UpdateClientInput,
): Promise<Client | null> {
  const { rows } = await db.query<Client>(
    `UPDATE clients SET
       name = COALESCE($2, name),
       phone = COALESCE($3, phone),
       timezone = COALESCE($4, timezone),
       review_link = COALESCE($5, review_link),
       status = COALESCE($6, status),
       ai_config = COALESCE($7, ai_config),
       business_hours = COALESCE($8, business_hours)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.name ?? null,
      input.phone ?? null,
      input.timezone ?? null,
      input.reviewLink ?? null,
      input.status ?? null,
      input.aiConfig ? JSON.stringify(input.aiConfig) : null,
      input.businessHours ? JSON.stringify(input.businessHours) : null,
    ],
  );
  return rows[0] ?? null;
}
