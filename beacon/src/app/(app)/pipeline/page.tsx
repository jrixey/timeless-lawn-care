import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { pipelineCounts } from "@/lib/domain/reporting";
import { listContacts } from "@/lib/domain/contacts";
import type { ContactStage } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const STAGES: ContactStage[] = ["new", "contacted", "qualified", "booked", "won", "lost"];

export default async function PipelinePage() {
  const session = (await getSessionScope())!;
  const { counts, contacts } = await withTenant(session.scope, async (db) => ({
    counts: await pipelineCounts(db),
    contacts: await listContacts(db),
  }));

  return (
    <>
      <div className="topbar">
        <h1>Pipeline</h1>
      </div>

      <div className="grid cards" style={{ marginBottom: 20 }}>
        {STAGES.map((s) => (
          <div className="card" key={s}>
            <div className="metric">{counts[s]}</div>
            <div className="metric-label">{s}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Leads</h2>
        {contacts.length === 0 ? (
          <p className="muted">No leads yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Source</th>
                <th>Stage</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name ?? "—"}</td>
                  <td className="muted">{c.phone ?? "—"}</td>
                  <td className="muted small">{c.source}</td>
                  <td>
                    <span className={`badge ${c.stage}`}>{c.stage}</span>
                  </td>
                  <td className="muted small">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
