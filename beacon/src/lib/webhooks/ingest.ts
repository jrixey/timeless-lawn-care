import { withTenant } from "@/lib/db/tenant";
import { upsertContactByPhone } from "@/lib/domain/contacts";
import { getOrCreateConversation, addMessage } from "@/lib/domain/conversations";
import { createCall, findCallByProviderId } from "@/lib/domain/calls";
import { triggerNewLead, triggerInboundReply } from "@/lib/workflows/triggers";
import { UNSAFE_resolveTenant } from "./resolve.js";

export interface IngestResult {
  ok: boolean;
  duplicate?: boolean;
  reason?: string;
  contactId?: string;
  conversationId?: string;
}

/** Inbound SMS from a contact. Idempotent on provider messageSid. */
export async function ingestInboundSms(input: {
  clientId?: string | null;
  from: string;
  to: string;
  body: string;
  messageSid: string;
}): Promise<IngestResult> {
  const tenant = await UNSAFE_resolveTenant({ clientId: input.clientId, toNumber: input.to });
  if (!tenant) return { ok: false, reason: "unrouted" };

  return withTenant(tenant, async (db) => {
    // Idempotency: a message with this provider id is processed at most once.
    const dup = await db.query("SELECT 1 FROM messages WHERE provider_message_id = $1", [
      input.messageSid,
    ]);
    if (dup.rows.length > 0) return { ok: true, duplicate: true };

    const contact = await upsertContactByPhone(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      phone: input.from,
      source: "inbound_sms",
    });
    const conv = await getOrCreateConversation(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contactId: contact.id,
      channel: "sms",
    });
    await addMessage(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      conversationId: conv.id,
      contactId: contact.id,
      direction: "inbound",
      channel: "sms",
      body: input.body,
      status: "received",
      providerMessageId: input.messageSid,
    });
    await triggerInboundReply(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contact,
      conversationId: conv.id,
      body: input.body,
    });
    return { ok: true, contactId: contact.id, conversationId: conv.id };
  });
}

/** A missed inbound call → record it and fire the instant text-back + cadence. */
export async function ingestMissedCall(input: {
  clientId?: string | null;
  from: string;
  to: string;
  callSid: string;
}): Promise<IngestResult> {
  const tenant = await UNSAFE_resolveTenant({ clientId: input.clientId, toNumber: input.to });
  if (!tenant) return { ok: false, reason: "unrouted" };

  return withTenant(tenant, async (db) => {
    const existing = await findCallByProviderId(db, input.callSid);
    if (existing) return { ok: true, duplicate: true };

    const contact = await upsertContactByPhone(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      phone: input.from,
      source: "missed_call",
    });
    const conv = await getOrCreateConversation(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contactId: contact.id,
      channel: "sms",
    });
    await createCall(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contactId: contact.id,
      conversationId: conv.id,
      direction: "inbound",
      fromNumber: input.from,
      toNumber: input.to,
      status: "missed",
      providerCallId: input.callSid,
    });
    await triggerNewLead(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contact,
      conversationId: conv.id,
    });
    return { ok: true, contactId: contact.id, conversationId: conv.id };
  });
}

/** A web-form lead → create the contact and fire the new-lead automations. */
export async function ingestWebLead(input: {
  clientId: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
}): Promise<IngestResult> {
  const tenant = await UNSAFE_resolveTenant({ clientId: input.clientId });
  if (!tenant) return { ok: false, reason: "unrouted" };
  if (!input.phone) return { ok: false, reason: "missing_phone" };

  return withTenant(tenant, async (db) => {
    const contact = await upsertContactByPhone(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      phone: input.phone!,
      name: input.name ?? null,
      email: input.email ?? null,
      source: "web_form",
    });
    const conv = await getOrCreateConversation(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contactId: contact.id,
      channel: "sms",
    });
    if (input.message) {
      await addMessage(db, {
        agencyId: tenant.agencyId,
        clientId: tenant.clientId,
        conversationId: conv.id,
        contactId: contact.id,
        direction: "inbound",
        channel: "sms",
        body: input.message,
        status: "received",
      });
    }
    await triggerNewLead(db, {
      agencyId: tenant.agencyId,
      clientId: tenant.clientId,
      contact,
      conversationId: conv.id,
    });
    return { ok: true, contactId: contact.id, conversationId: conv.id };
  });
}
