import type { TenantDb } from "@/lib/db/tenant";
import type { Adapters } from "@/lib/adapters";
import type { Contact } from "@/lib/domain/types";
import { getClient } from "@/lib/domain/clients";
import { getOrCreateConversation, addMessage } from "@/lib/domain/conversations";

export type DeliverStatus = "sent" | "skipped_opted_out" | "skipped_no_phone";

/**
 * Deliver one outbound SMS to a contact and record it. Honors opt-out for
 * automated traffic (a confirmation/opt-out reply can set `bypassOptOut`).
 * Idempotent at the provider via `idempotencyKey` and at the DB via the unique
 * (client_id, provider_message_id) index in `addMessage`.
 */
export async function deliverSms(
  db: TenantDb,
  adapters: Adapters,
  args: {
    agencyId: string;
    clientId: string;
    contact: Contact;
    body: string;
    automated: boolean;
    bypassOptOut?: boolean;
    idempotencyKey: string;
    conversationId?: string;
  },
): Promise<DeliverStatus> {
  if (!args.contact.phone) return "skipped_no_phone";
  if (args.automated && !args.bypassOptOut && args.contact.opted_out) {
    return "skipped_opted_out";
  }

  const client = await getClient(db, args.clientId);
  const from = client?.phone ?? "+10000000000";

  const conversationId =
    args.conversationId ??
    (
      await getOrCreateConversation(db, {
        agencyId: args.agencyId,
        clientId: args.clientId,
        contactId: args.contact.id,
        channel: "sms",
      })
    ).id;

  const res = await adapters.sms.sendSms({
    to: args.contact.phone,
    from,
    body: args.body,
    idempotencyKey: args.idempotencyKey,
  });

  await addMessage(db, {
    agencyId: args.agencyId,
    clientId: args.clientId,
    conversationId,
    contactId: args.contact.id,
    direction: "outbound",
    channel: "sms",
    body: args.body,
    status: "sent",
    automated: args.automated,
    providerMessageId: res.providerMessageId,
  });
  return "sent";
}
