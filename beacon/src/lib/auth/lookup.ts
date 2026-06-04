import { adminPool } from "@/lib/db/pool";
import type { Role } from "@/lib/domain/types";

/**
 * UNSAFE: the ONLY sanctioned RLS bypass besides migrations/seeding. Login
 * happens before a tenant scope exists, so the credential lookup must search
 * users across the system by email. It returns ONLY what auth needs and is used
 * nowhere else. Do not import the admin pool from feature code.
 */
export interface AuthUserRow {
  id: string;
  agency_id: string;
  client_id: string | null;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
}

export async function UNSAFE_findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const { rows } = await adminPool().query<AuthUserRow>(
    `SELECT id, agency_id, client_id, email, name, role, password_hash
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}
