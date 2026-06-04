import { adminPool } from "@/lib/db/pool";

/**
 * Inbound routing infrastructure: map a provider event to its owning tenant.
 * Like migrations and the auth lookup, this is a sanctioned admin-pool path —
 * routing an inbound call/SMS to the right client is inherently cross-tenant.
 * It returns ONLY the tenant ids; all subsequent work is RLS-scoped via
 * `withTenant`. Resolution is by explicit clientId when provided, else by the
 * destination business phone number.
 */
export interface ResolvedTenant {
  agencyId: string;
  clientId: string;
}

export async function UNSAFE_resolveTenant(args: {
  clientId?: string | null;
  toNumber?: string | null;
}): Promise<ResolvedTenant | null> {
  if (args.clientId) {
    const { rows } = await adminPool().query<{ agency_id: string; id: string }>(
      "SELECT id, agency_id FROM clients WHERE id = $1 AND status <> 'archived'",
      [args.clientId],
    );
    const row = rows[0];
    return row ? { agencyId: row.agency_id, clientId: row.id } : null;
  }
  if (args.toNumber) {
    const { rows } = await adminPool().query<{ agency_id: string; id: string }>(
      "SELECT id, agency_id FROM clients WHERE phone = $1 AND status <> 'archived' LIMIT 1",
      [args.toNumber],
    );
    const row = rows[0];
    return row ? { agencyId: row.agency_id, clientId: row.id } : null;
  }
  return null;
}
