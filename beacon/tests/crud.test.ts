import { describe, it, expect } from "vitest";
import { withTenant } from "../src/lib/db/tenant.js";
import { listClients, createClient, getClient, updateClient } from "../src/lib/domain/clients.js";
import {
  createContact,
  listContacts,
  updateContact,
  findContactByPhone,
} from "../src/lib/domain/contacts.js";
import { signBody, verifySignature } from "../src/lib/webhooks/verify.js";
import { makeAgency } from "./helpers.js";

describe("clients & contacts CRUD (tenant-scoped)", () => {
  it("creates, reads, lists, and updates a client", async () => {
    const agencyId = await makeAgency("Crud");
    const scope = { agencyId };
    const created = await withTenant(scope, (db) =>
      createClient(db, { agencyId, name: "Acme HVAC", slug: "acme" }),
    );
    expect(created.name).toBe("Acme HVAC");

    const fetched = await withTenant(scope, (db) => getClient(db, created.id));
    expect(fetched?.id).toBe(created.id);

    const updated = await withTenant(scope, (db) =>
      updateClient(db, created.id, { phone: "+15550009999", status: "paused" }),
    );
    expect(updated?.phone).toBe("+15550009999");
    expect(updated?.status).toBe("paused");

    const list = await withTenant(scope, (db) => listClients(db));
    expect(list).toHaveLength(1);
  });

  it("creates and updates contacts, scoped to a client", async () => {
    const agencyId = await makeAgency("Crud2");
    const clientId = (
      await withTenant({ agencyId }, (db) =>
        createClient(db, { agencyId, name: "Beta Air", slug: "beta" }),
      )
    ).id;
    const scope = { agencyId, clientId };

    const contact = await withTenant(scope, (db) =>
      createContact(db, { agencyId, clientId, name: "Sam", phone: "+15551112222" }),
    );
    expect(contact.stage).toBe("new");

    await withTenant(scope, (db) => updateContact(db, contact.id, { stage: "qualified" }));
    const found = await withTenant(scope, (db) => findContactByPhone(db, clientId, "+15551112222"));
    expect(found?.stage).toBe("qualified");

    const list = await withTenant(scope, (db) => listContacts(db, { clientId }));
    expect(list).toHaveLength(1);
  });
});

describe("webhook signatures", () => {
  it("verifies a correct signature and rejects a wrong one", () => {
    const body = JSON.stringify({ hello: "world" });
    const sig = signBody(body);
    expect(verifySignature(body, sig)).toBe(true);
    expect(verifySignature(body, "deadbeef")).toBe(false);
    expect(verifySignature(body, null)).toBe(false);
    expect(verifySignature(body + "tamper", sig)).toBe(false);
  });
});
