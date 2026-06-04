import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { getConversation } from "@/lib/domain/conversations";
import { getContact } from "@/lib/domain/contacts";
import { getAdapters } from "@/lib/adapters";
import { deliverSms } from "@/lib/workflows/deliver";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await getSessionScope())!;
  const data = await withTenant(session.scope, async (db) => {
    const conv = await getConversation(db, id);
    if (!conv) return null;
    const contact = await getContact(db, conv.conversation.contact_id);
    return { ...conv, contact };
  });
  if (!data) notFound();
  const { conversation, messages, contact } = data;

  async function sendReply(formData: FormData) {
    "use server";
    const s = (await getSessionScope())!;
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    await withTenant(s.scope, async (db) => {
      const c = await getContact(db, conversation.contact_id);
      if (!c) return;
      await deliverSms(db, getAdapters(), {
        agencyId: c.agency_id,
        clientId: c.client_id,
        contact: c,
        body,
        automated: false,
        idempotencyKey: `manual:${randomUUID()}`,
        conversationId: conversation.id,
      });
    });
    revalidatePath(`/conversations/${conversation.id}`);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{contact?.name ?? contact?.phone ?? "Conversation"}</h1>
          <div className="muted small">
            {contact?.phone ?? ""} · <span className={`badge ${contact?.stage ?? ""}`}>{contact?.stage}</span>
            {contact?.opted_out ? <span className="badge lost" style={{ marginLeft: 6 }}>opted out</span> : null}
          </div>
        </div>
        <a className="muted small" href="/inbox">
          ← Back to inbox
        </a>
      </div>

      <div className="card">
        <div className="thread">
          {messages.length === 0 ? (
            <p className="muted">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`bubble ${m.direction}`}>
                <div>{m.body}</div>
                <div className="meta">
                  {m.direction === "outbound" ? (m.automated ? "auto" : "you") : "lead"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        <form action={sendReply} style={{ marginTop: 16 }}>
          <label htmlFor="body">Reply</label>
          <textarea id="body" name="body" rows={3} placeholder="Type a reply…" />
          <div style={{ marginTop: 10 }}>
            <button className="btn" type="submit">
              Send SMS
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
