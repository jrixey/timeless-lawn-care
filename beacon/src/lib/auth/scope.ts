import { auth } from "./config.js";
import type { TenantScope } from "@/lib/db/tenant";
import type { Role } from "@/lib/domain/types";

export interface SessionScope {
  scope: TenantScope;
  userId: string;
  role: Role;
  isAgency: boolean;
}

/**
 * Derive the tenant scope from the current session.
 * - Agency users get an agency-wide scope (clientId = null) so they can see all
 *   of their agency's clients. They remain strictly isolated to their agency.
 * - Client users get a scope pinned to their single client_id.
 */
export async function getSessionScope(): Promise<SessionScope | null> {
  const session = await auth();
  if (!session?.user) return null;
  const { agencyId, clientId, role, id } = session.user;
  const isAgency = role === "agency_admin" || role === "agency_member";
  return {
    scope: {
      agencyId,
      clientId: isAgency ? null : clientId,
      role,
    },
    userId: id,
    role,
    isAgency,
  };
}
