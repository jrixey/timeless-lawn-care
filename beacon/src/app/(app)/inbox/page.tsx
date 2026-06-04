import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { listInbox } from "@/lib/domain/conversations";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = (await getSessionScope())!;
  const inbox = await withTenant(session.scope, (db) => listInbox(db));

  return (
    <>
      <div className="topbar">
        <h1>Lead inbox</h1>
        <span className="muted small">{inbox.length} conversation(s)</span>
      </div>
      <div className="card">
        {inbox.length === 0 ? (
          <p className="muted">
            No conversations yet. Trigger a webhook (missed call / web lead / inbound SMS) to
            populate the inbox.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Channel</th>
                <th>Last message</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`/conversations/${c.id}`}>
                      {c.contact_name ?? c.contact_phone ?? "Lead"}
                    </a>
                  </td>
                  <td className="muted small">{c.channel}</td>
                  <td className="muted">{(c.last_body ?? "").slice(0, 70)}</td>
                  <td>
                    <span className="badge">{c.status}</span>
                  </td>
                  <td className="muted small">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
