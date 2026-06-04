import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { clientReports } from "@/lib/domain/reporting";

export const dynamic = "force-dynamic";

export default async function ReportingPage() {
  const session = (await getSessionScope())!;
  const reports = await withTenant(session.scope, (db) => clientReports(db));

  return (
    <>
      <div className="topbar">
        <h1>Reporting</h1>
        <span className="muted small">Per-client performance</span>
      </div>
      <div className="card">
        {reports.length === 0 ? (
          <p className="muted">No clients to report on yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Leads</th>
                <th>Booked</th>
                <th>Won</th>
                <th>Conv%</th>
                <th>Texts</th>
                <th>Appts</th>
                <th>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const conv = r.leads ? Math.round((r.booked / r.leads) * 100) : 0;
                return (
                  <tr key={r.client_id}>
                    <td>
                      <strong>{r.client_name}</strong>
                    </td>
                    <td>{r.leads}</td>
                    <td>{r.booked}</td>
                    <td>{r.won}</td>
                    <td>{conv}%</td>
                    <td>{r.outbound_messages}</td>
                    <td>{r.appointments}</td>
                    <td>{r.reviews_requested}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
