import { describe, it, expect } from "vitest";
import { withTenant } from "../src/lib/db/tenant.js";
import { adminPool } from "../src/lib/db/pool.js";
import { makeAgency, makeClient, makeContact } from "./helpers.js";

/**
 * These tests PROVE Postgres RLS isolation. A failure here is a critical
 * security bug: one tenant seeing or mutating another tenant's data.
 */
describe("tenant isolation (RLS)", () => {
  async function fixture() {
    const agencyA = await makeAgency("A");
    const agencyB = await makeAgency("B");
    const clientA1 = await makeClient(agencyA, "A1");
    const clientA2 = await makeClient(agencyA, "A2");
    const clientB1 = await makeClient(agencyB, "B1");
    const contactA1 = await makeContact(agencyA, clientA1, { name: "alice" });
    const contactA2 = await makeContact(agencyA, clientA2, { name: "amy" });
    const contactB1 = await makeContact(agencyB, clientB1, { name: "bob" });
    return { agencyA, agencyB, clientA1, clientA2, clientB1, contactA1, contactA2, contactB1 };
  }

  it("agency scope sees only its own agency's contacts across all its clients", async () => {
    const f = await fixture();
    const namesA = await withTenant({ agencyId: f.agencyA }, async (db) => {
      const { rows } = await db.query<{ name: string }>("SELECT name FROM contacts ORDER BY name");
      return rows.map((r) => r.name);
    });
    expect(namesA).toEqual(["alice", "amy"]);
    expect(namesA).not.toContain("bob");
  });

  it("client scope sees only that single client", async () => {
    const f = await fixture();
    const names = await withTenant({ agencyId: f.agencyA, clientId: f.clientA1 }, async (db) => {
      const { rows } = await db.query<{ name: string }>("SELECT name FROM contacts");
      return rows.map((r) => r.name);
    });
    expect(names).toEqual(["alice"]);
  });

  it("agency B cannot see agency A data", async () => {
    const f = await fixture();
    const count = await withTenant({ agencyId: f.agencyB }, async (db) => {
      const { rows } = await db.query<{ n: string }>("SELECT count(*)::int AS n FROM contacts");
      return Number(rows[0]!.n);
    });
    expect(count).toBe(1); // only bob
  });

  it("a non-existent agency scope sees nothing", async () => {
    await fixture();
    const count = await withTenant(
      { agencyId: "00000000-0000-0000-0000-000000000000" },
      async (db) => {
        const { rows } = await db.query<{ n: string }>("SELECT count(*)::int AS n FROM contacts");
        return Number(rows[0]!.n);
      },
    );
    expect(count).toBe(0);
  });

  it("WITH CHECK blocks inserting a row for another tenant's client", async () => {
    const f = await fixture();
    await expect(
      withTenant({ agencyId: f.agencyA, clientId: f.clientA1 }, async (db) => {
        // Try to smuggle in a row for clientA2 while scoped to clientA1.
        await db.query(
          "INSERT INTO contacts (agency_id, client_id, name) VALUES ($1,$2,$3)",
          [f.agencyA, f.clientA2, "smuggled"],
        );
      }),
    ).rejects.toThrow();
  });

  it("WITH CHECK blocks inserting a row for another AGENCY", async () => {
    const f = await fixture();
    await expect(
      withTenant({ agencyId: f.agencyA }, async (db) => {
        await db.query(
          "INSERT INTO contacts (agency_id, client_id, name) VALUES ($1,$2,$3)",
          [f.agencyB, f.clientB1, "cross-agency"],
        );
      }),
    ).rejects.toThrow();
  });

  it("cross-tenant UPDATE affects zero rows", async () => {
    const f = await fixture();
    const updated = await withTenant({ agencyId: f.agencyA }, async (db) => {
      const { rowCount } = await db.query("UPDATE contacts SET name = 'hacked' WHERE id = $1", [
        f.contactB1,
      ]);
      return rowCount;
    });
    expect(updated).toBe(0);
    // Confirm B's contact is untouched (via admin).
    const { rows } = await adminPool().query<{ name: string }>(
      "SELECT name FROM contacts WHERE id = $1",
      [f.contactB1],
    );
    expect(rows[0]!.name).toBe("bob");
  });

  it("cross-tenant DELETE affects zero rows", async () => {
    const f = await fixture();
    const deleted = await withTenant({ agencyId: f.agencyA }, async (db) => {
      const { rowCount } = await db.query("DELETE FROM contacts WHERE id = $1", [f.contactB1]);
      return rowCount;
    });
    expect(deleted).toBe(0);
  });

  it("isolation holds for conversations and messages too", async () => {
    const f = await fixture();
    // Create a conversation + message for B via admin.
    const conv = (
      await adminPool().query<{ id: string }>(
        `INSERT INTO conversations (agency_id, client_id, contact_id) VALUES ($1,$2,$3) RETURNING id`,
        [f.agencyB, f.clientB1, f.contactB1],
      )
    ).rows[0]!;
    await adminPool().query(
      `INSERT INTO messages (agency_id, client_id, conversation_id, contact_id, direction, body)
       VALUES ($1,$2,$3,$4,'inbound','secret B message')`,
      [f.agencyB, f.clientB1, conv.id, f.contactB1],
    );

    const seen = await withTenant({ agencyId: f.agencyA }, async (db) => {
      const c = await db.query("SELECT * FROM conversations");
      const m = await db.query("SELECT * FROM messages");
      return { convs: c.rowCount, msgs: m.rowCount };
    });
    expect(seen.convs).toBe(0);
    expect(seen.msgs).toBe(0);
  });

  it("the app role is NOT a superuser (so RLS cannot be bypassed)", async () => {
    const isSuper = await withTenant(
      { agencyId: "00000000-0000-0000-0000-000000000000" },
      async (db) => {
        const { rows } = await db.query<{ usesuper: boolean; current_user: string }>(
          "SELECT usesuper, current_user FROM pg_user WHERE usename = current_user",
        );
        return rows[0];
      },
    );
    expect(isSuper?.current_user).toBe("beacon_app");
    expect(isSuper?.usesuper).toBe(false);
  });
});
