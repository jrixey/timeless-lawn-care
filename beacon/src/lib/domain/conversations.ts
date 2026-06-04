import type { TenantDb } from "@/lib/db/tenant";
import type { Channel, Conversation, Message } from "./types.js";

export async function getOrCreateConversation(
  db: TenantDb,
  args: { agencyId: string; clientId: string; contactId: string; channel: Channel },
): Promise<Conversation> {
  const existing = await db.query<Conversation>(
    `SELECT * FROM conversations
     WHERE contact_id = $1 AND channel = $2 AND status <> 'closed'
     ORDER BY created_at DESC LIMIT 1`,
    [args.contactId, args.channel],
  );
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await db.query<Conversation>(
    `INSERT INTO conversations (agency_id, client_id, contact_id, channel)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [args.agencyId, args.clientId, args.contactId, args.channel],
  );
  return rows[0]!;
}

export interface AddMessageInput {
  agencyId: string;
  clientId: string;
  conversationId: string;
  contactId: string;
  direction: "inbound" | "outbound";
  channel: Channel;
  body: string;
  status?: Message["status"];
  automated?: boolean;
  providerMessageId?: string | null;
}

/**
 * Append a message and bump the conversation's last_message_at. Idempotent on
 * (client_id, provider_message_id) — a duplicate provider id returns the
 * already-stored message instead of inserting twice.
 */
export async function addMessage(db: TenantDb, input: AddMessageInput): Promise<Message> {
  if (input.providerMessageId) {
    const dup = await db.query<Message>(
      "SELECT * FROM messages WHERE provider_message_id = $1",
      [input.providerMessageId],
    );
    if (dup.rows[0]) return dup.rows[0];
  }
  const { rows } = await db.query<Message>(
    `INSERT INTO messages
       (agency_id, client_id, conversation_id, contact_id, direction, channel, body, status, automated, provider_message_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'queued'),COALESCE($9,false),$10)
     RETURNING *`,
    [
      input.agencyId,
      input.clientId,
      input.conversationId,
      input.contactId,
      input.direction,
      input.channel,
      input.body,
      input.status ?? null,
      input.automated ?? null,
      input.providerMessageId ?? null,
    ],
  );
  await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [
    input.conversationId,
  ]);
  return rows[0]!;
}

export interface InboxItem extends Conversation {
  contact_name: string | null;
  contact_phone: string | null;
  last_body: string | null;
  unread_inbound: number;
}

export async function listInbox(db: TenantDb, clientId?: string): Promise<InboxItem[]> {
  const params: unknown[] = [];
  let filter = "";
  if (clientId) {
    params.push(clientId);
    filter = `WHERE c.client_id = $1`;
  }
  const { rows } = await db.query<InboxItem>(
    `SELECT c.*,
            ct.name AS contact_name,
            ct.phone AS contact_phone,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id
               AND m.direction = 'inbound') AS unread_inbound
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       ${filter}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT 200`,
    params,
  );
  return rows;
}

export async function getConversation(
  db: TenantDb,
  id: string,
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const conv = await db.query<Conversation>("SELECT * FROM conversations WHERE id = $1", [id]);
  if (!conv.rows[0]) return null;
  const msgs = await db.query<Message>(
    "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [id],
  );
  return { conversation: conv.rows[0], messages: msgs.rows };
}
