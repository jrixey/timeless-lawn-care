import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { clientReports } from "@/lib/domain/reporting";
import { listInbox } from "@/lib/domain/conversations";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = (await getSessionScope())!;
  const { reports, inbox } = await withTenant(session.scope, async (db) => ({
    reports: await clientReports(db),
    inbox: await listInbox(db),
  }));

  const totals = reports.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      booked: acc.booked + r.booked,
      messages: acc.messages + r.outbound_messages,
      reviews: acc.reviews + r.reviews_requested,
    }),
    { leads: 0, booked: 0, messages: 0, reviews: 0 },
  );
  const conv = totals.leads ? Math.round((totals.booked / totals.leads) * 100) : 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Dashboard</h1>
          <div className="muted small">
            {session.isAgency ? "All clients across your agency" : "Your account"}
          </div>
        </div>
      </div>

      <div className="grid cards" style={{ marginBottom: 24 }}>
        <Metric label="Leads" value={totals.leads} />
        <Metric label="Booked" value={totals.booked} />
        <Metric label="Lead → booked" value={`${conv}%`} />
        <Metric label="Texts sent" value={totals.messages} />
        <Metric label="Reviews asked" value={totals.reviews} />
      </div>

      <div className="card">
        <h2>Recent lead activity</h2>
        {inbox.length === 0 ? (
          <p className="muted">No conversations yet. Send a test lead to a webhook to see it here.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Last message</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {inbox.slice(0, 8).map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`/conversations/${c.id}`}>{c.contact_name ?? c.contact_phone ?? "Lead"}</a>
                  </td>
                  <td className="muted">{(c.last_body ?? "").slice(0, 60)}</td>
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="metric">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
