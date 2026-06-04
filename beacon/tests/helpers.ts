import { adminPool } from "../src/lib/db/pool.js";
import { hashPassword } from "../src/lib/auth/password.js";

let phoneCounter = 1000;
export function uniquePhone(): string {
  phoneCounter += 1;
  return `+1555${String(phoneCounter).padStart(7, "0")}`;
}

export async function makeAgency(name = "Agency"): Promise<string> {
  const slug = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await adminPool().query<{ id: string }>(
    "INSERT INTO agencies (name, slug) VALUES ($1,$2) RETURNING id",
    [name, slug],
  );
  return rows[0]!.id;
}

export async function makeClient(
  agencyId: string,
  name = "Client",
  opts: { phone?: string; reviewLink?: string } = {},
): Promise<string> {
  const slug = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await adminPool().query<{ id: string }>(
    `INSERT INTO clients (agency_id, name, slug, phone, review_link)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [agencyId, name, slug, opts.phone ?? uniquePhone(), opts.reviewLink ?? "https://g.page/x/review"],
  );
  return rows[0]!.id;
}

export async function makeUser(
  agencyId: string,
  opts: { clientId?: string | null; role: string; email?: string; password?: string },
): Promise<string> {
  const email = opts.email ?? `u-${Math.random().toString(36).slice(2, 8)}@test.dev`;
  const hash = await hashPassword(opts.password ?? "pw");
  const { rows } = await adminPool().query<{ id: string }>(
    `INSERT INTO users (agency_id, client_id, email, name, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [agencyId, opts.clientId ?? null, email, "Test User", hash, opts.role],
  );
  return rows[0]!.id;
}

export async function makeContact(
  agencyId: string,
  clientId: string,
  opts: { name?: string; phone?: string; stage?: string } = {},
): Promise<string> {
  const { rows } = await adminPool().query<{ id: string }>(
    `INSERT INTO contacts (agency_id, client_id, name, phone, stage)
     VALUES ($1,$2,$3,$4,COALESCE($5,'new')) RETURNING id`,
    [agencyId, clientId, opts.name ?? "Lead", opts.phone ?? uniquePhone(), opts.stage ?? null],
  );
  return rows[0]!.id;
}

/** Default workflow rows so triggers/enrollment work in tests. */
export async function seedWorkflows(agencyId: string, clientId: string): Promise<void> {
  const { DEFAULT_WORKFLOW_CONFIG } = await import("../src/lib/workflows/templates.js");
  const defs: [string, unknown][] = [
    ["instant_textback", DEFAULT_WORKFLOW_CONFIG.instantTextback],
    ["lead_followup", DEFAULT_WORKFLOW_CONFIG.leadFollowup],
    ["review_request", DEFAULT_WORKFLOW_CONFIG.reviewRequest],
  ];
  for (const [type, config] of defs) {
    await adminPool().query(
      `INSERT INTO workflows (agency_id, client_id, type, enabled, config)
       VALUES ($1,$2,$3,true,$4)
       ON CONFLICT (client_id, type) DO NOTHING`,
      [agencyId, clientId, type, JSON.stringify(config)],
    );
  }
}
