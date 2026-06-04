import { revalidatePath } from "next/cache";
import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { listClients, createClient } from "@/lib/domain/clients";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = (await getSessionScope())!;
  const clients = await withTenant(session.scope, (db) => listClients(db));

  async function addClient(formData: FormData) {
    "use server";
    const s = (await getSessionScope())!;
    if (!s.isAgency) return;
    const name = String(formData.get("name") ?? "").trim();
    const slug =
      String(formData.get("slug") ?? "").trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!name || !slug) return;
    await withTenant(s.scope, (db) =>
      createClient(db, {
        agencyId: s.scope.agencyId,
        name,
        slug,
        phone: String(formData.get("phone") ?? "") || null,
        reviewLink: String(formData.get("reviewLink") ?? "") || null,
      }),
    );
    revalidatePath("/clients");
  }

  return (
    <>
      <div className="topbar">
        <h1>Clients</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        {clients.length === 0 ? (
          <p className="muted">No clients yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Timezone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="muted small">{c.slug}</div>
                  </td>
                  <td className="muted">{c.phone ?? "—"}</td>
                  <td className="muted small">{c.timezone}</td>
                  <td>
                    <span className="badge">{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {session.isAgency ? (
        <div className="card">
          <h2>Add a client</h2>
          <form action={addClient}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <label>Business name</label>
                <input className="input" name="name" required />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label>Slug (optional)</label>
                <input className="input" name="slug" placeholder="auto from name" />
              </div>
            </div>
            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <label>Business phone</label>
                <input className="input" name="phone" placeholder="+15551234567" />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label>Google review link</label>
                <input className="input" name="reviewLink" placeholder="https://g.page/..." />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">
                Create client
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
