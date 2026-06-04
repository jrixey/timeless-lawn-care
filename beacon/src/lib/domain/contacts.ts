import type { TenantDb } from "@/lib/db/tenant";
import type { Contact, ContactSource, ContactStage } from "./types.js";

export async function listContacts(
  db: TenantDb,
  opts: { clientId?: string; stage?: ContactStage } = {},
): Promise<Contact[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.clientId) {
    params.push(opts.clientId);
    where.push(`client_id = $${params.length}`);
  }
  if (opts.stage) {
    params.push(opts.stage);
    where.push(`stage = $${params.length}`);
  }
  const { rows } = await db.query<Contact>(
    `SELECT * FROM contacts ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY created_at DESC`,
    params,
  );
  return rows;
}

export async function getContact(db: TenantDb, id: string): Promise<Contact | null> {
  const { rows } = await db.query<Contact>("SELECT * FROM contacts WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findContactByPhone(
  db: TenantDb,
  clientId: string,
  phone: string,
): Promise<Contact | null> {
  const { rows } = await db.query<Contact>(
    "SELECT * FROM contacts WHERE client_id = $1 AND phone = $2",
    [clientId, phone],
  );
  return rows[0] ?? null;
}

export interface CreateContactInput {
  agencyId: string;
  clientId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: ContactSource;
  notes?: string | null;
}

export async function createContact(db: TenantDb, input: CreateContactInput): Promise<Contact> {
  const { rows } = await db.query<Contact>(
    `INSERT INTO contacts (agency_id, client_id, name, phone, email, source, notes)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'manual'),$7)
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.source ?? null,
      input.notes ?? null,
    ],
  );
  return rows[0]!;
}

/** Find an existing contact by phone within a client, or create one (idempotent). */
export async function upsertContactByPhone(
  db: TenantDb,
  input: CreateContactInput & { phone: string },
): Promise<Contact> {
  const existing = await findContactByPhone(db, input.clientId, input.phone);
  if (existing) return existing;
  return createContact(db, input);
}

export async function updateContact(
  db: TenantDb,
  id: string,
  input: { name?: string | null; email?: string | null; stage?: ContactStage; notes?: string | null },
): Promise<Contact | null> {
  const { rows } = await db.query<Contact>(
    `UPDATE contacts SET
       name = COALESCE($2, name),
       email = COALESCE($3, email),
       stage = COALESCE($4, stage),
       notes = COALESCE($5, notes)
     WHERE id = $1 RETURNING *`,
    [id, input.name ?? null, input.email ?? null, input.stage ?? null, input.notes ?? null],
  );
  return rows[0] ?? null;
}

export async function setContactStage(
  db: TenantDb,
  id: string,
  stage: ContactStage,
): Promise<void> {
  await db.query("UPDATE contacts SET stage = $2 WHERE id = $1", [id, stage]);
}

export async function setOptOut(db: TenantDb, id: string, optedOut: boolean): Promise<void> {
  await db.query("UPDATE contacts SET opted_out = $2 WHERE id = $1", [id, optedOut]);
}
