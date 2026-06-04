import { describe, it, expect } from "vitest";
import { adminPool } from "../src/lib/db/pool.js";
import { withTenant } from "../src/lib/db/tenant.js";
import { getAdapters } from "../src/lib/adapters/index.js";
import { outbox } from "../src/lib/adapters/mock/outbox.js";
import { processDueJobs } from "../src/lib/queue/worker.js";
import { ingestMissedCall, ingestInboundSms } from "../src/lib/webhooks/ingest.js";
import { triggerReviewRequest } from "../src/lib/workflows/triggers.js";
import { makeAgency, makeClient, seedWorkflows, uniquePhone } from "./helpers.js";

// A fixed, non-quiet-hours "now" in the future relative to real time so all
// enqueued jobs are due and deterministic.
const NOW = new Date("2026-06-08T15:00:00Z");

async function setup() {
  const agencyId = await makeAgency("Auto");
  const clientPhone = uniquePhone();
  const clientId = await makeClient(agencyId, "Northwind", {
    phone: clientPhone,
    reviewLink: "https://g.page/northwind/review",
  });
  await seedWorkflows(agencyId, clientId);
  return { agencyId, clientId, clientPhone, leadPhone: uniquePhone() };
}

// Push follow-up steps far into the future so a fixed `NOW` only makes the
// instant text-back due (mirrors a real worker polling moments after the call).
async function deferFollowups(clientId: string): Promise<void> {
  await adminPool().query(
    "UPDATE jobs SET run_at = '2030-01-01T00:00:00Z' WHERE client_id = $1 AND type = 'followup_step' AND status = 'pending'",
    [clientId],
  );
}

async function countJobs(clientId: string, type: string, status: string): Promise<number> {
  const { rows } = await adminPool().query<{ n: string }>(
    "SELECT count(*)::int AS n FROM jobs WHERE client_id = $1 AND type = $2 AND status = $3",
    [clientId, type, status],
  );
  return Number(rows[0]!.n);
}

describe("automation engine", () => {
  it("missed call → instant text-back is sent and cadence is enrolled", async () => {
    const s = await setup();
    const r = await ingestMissedCall({
      clientId: s.clientId,
      from: s.leadPhone,
      to: s.clientPhone,
      callSid: "CA-1",
    });
    expect(r.ok).toBe(true);
    await deferFollowups(s.clientId);

    await processDueJobs(getAdapters(), NOW);

    const sms = outbox.sms();
    expect(sms).toHaveLength(1);
    expect(sms[0]!.to).toBe(s.leadPhone);
    expect(sms[0]!.body).toContain("Northwind");
    // A follow-up step is scheduled for later.
    expect(await countJobs(s.clientId, "followup_step", "pending")).toBe(1);
  });

  it("webhook ingest is idempotent on provider id", async () => {
    const s = await setup();
    await ingestMissedCall({ clientId: s.clientId, from: s.leadPhone, to: s.clientPhone, callSid: "CA-DUP" });
    const second = await ingestMissedCall({
      clientId: s.clientId,
      from: s.leadPhone,
      to: s.clientPhone,
      callSid: "CA-DUP",
    });
    expect(second.duplicate).toBe(true);

    const { rows } = await adminPool().query<{ n: string }>(
      "SELECT count(*)::int AS n FROM contacts WHERE client_id = $1",
      [s.clientId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
    // Only one instant text-back job (deduped).
    const { rows: jobs } = await adminPool().query<{ n: string }>(
      "SELECT count(*)::int AS n FROM jobs WHERE client_id = $1 AND type = 'instant_textback'",
      [s.clientId],
    );
    expect(Number(jobs[0]!.n)).toBe(1);
  });

  it("STOP opts the contact out, cancels the cadence, and sends a confirmation", async () => {
    const s = await setup();
    await ingestMissedCall({ clientId: s.clientId, from: s.leadPhone, to: s.clientPhone, callSid: "CA-2" });
    await processDueJobs(getAdapters(), NOW);
    outbox.clear();

    await ingestInboundSms({
      clientId: s.clientId,
      from: s.leadPhone,
      to: s.clientPhone,
      body: "STOP",
      messageSid: "SM-STOP",
    });

    // Contact opted out; pending follow-up canceled.
    const { rows } = await adminPool().query<{ opted_out: boolean }>(
      "SELECT opted_out FROM contacts WHERE client_id = $1",
      [s.clientId],
    );
    expect(rows[0]!.opted_out).toBe(true);
    expect(await countJobs(s.clientId, "followup_step", "canceled")).toBeGreaterThanOrEqual(1);

    // Opt-out confirmation is delivered even though they opted out.
    await processDueJobs(getAdapters(), NOW);
    const sms = outbox.sms();
    expect(sms.some((m) => /unsubscribed/i.test(m.body))).toBe(true);
  });

  it("does not send follow-ups to an opted-out contact", async () => {
    const s = await setup();
    await ingestMissedCall({ clientId: s.clientId, from: s.leadPhone, to: s.clientPhone, callSid: "CA-3" });
    // Opt out before the cadence runs.
    await ingestInboundSms({
      clientId: s.clientId,
      from: s.leadPhone,
      to: s.clientPhone,
      body: "STOP",
      messageSid: "SM-STOP2",
    });
    outbox.clear();
    // Process everything that's due — only the opt-out confirmation should go out.
    await processDueJobs(getAdapters(), NOW);
    const sms = outbox.sms();
    expect(sms.every((m) => /unsubscribed/i.test(m.body))).toBe(true);
  });

  it("an inbound reply (engagement) stops the follow-up cadence", async () => {
    const s = await setup();
    await ingestMissedCall({ clientId: s.clientId, from: s.leadPhone, to: s.clientPhone, callSid: "CA-4" });
    expect(await countJobs(s.clientId, "followup_step", "pending")).toBe(1);

    await ingestInboundSms({
      clientId: s.clientId,
      from: s.leadPhone,
      to: s.clientPhone,
      body: "Yes please, what times do you have?",
      messageSid: "SM-REPLY",
    });

    expect(await countJobs(s.clientId, "followup_step", "canceled")).toBe(1);
    const { rows } = await adminPool().query<{ stage: string }>(
      "SELECT stage FROM contacts WHERE client_id = $1",
      [s.clientId],
    );
    expect(rows[0]!.stage).toBe("contacted");
  });

  it("review request is sent after a completed job", async () => {
    const s = await setup();
    const contactId = (
      await adminPool().query<{ id: string }>(
        "INSERT INTO contacts (agency_id, client_id, name, phone) VALUES ($1,$2,'Pat',$3) RETURNING id",
        [s.agencyId, s.clientId, s.leadPhone],
      )
    ).rows[0]!.id;
    const apptId = (
      await adminPool().query<{ id: string }>(
        `INSERT INTO appointments (agency_id, client_id, contact_id, starts_at, ends_at, status)
         VALUES ($1,$2,$3, now(), now() + interval '90 min', 'completed') RETURNING id`,
        [s.agencyId, s.clientId, contactId],
      )
    ).rows[0]!.id;

    await withTenant({ agencyId: s.agencyId, clientId: s.clientId }, (db) =>
      triggerReviewRequest(db, {
        agencyId: s.agencyId,
        clientId: s.clientId,
        contactId,
        appointmentId: apptId,
        reviewLink: "https://g.page/northwind/review",
      }),
    );
    await processDueJobs(getAdapters(), NOW);

    const sms = outbox.sms();
    expect(sms.some((m) => m.body.includes("g.page/northwind/review"))).toBe(true);
    const { rows } = await adminPool().query<{ status: string }>(
      "SELECT status FROM reviews WHERE client_id = $1",
      [s.clientId],
    );
    expect(rows[0]!.status).toBe("requested");
  });

  it("defers automated SMS during quiet hours and sends after", async () => {
    const s = await setup();
    await ingestMissedCall({ clientId: s.clientId, from: s.leadPhone, to: s.clientPhone, callSid: "CA-5" });
    await deferFollowups(s.clientId);

    // 23:00 UTC is inside the default quiet window (21→8): nothing should send.
    await processDueJobs(getAdapters(), new Date("2026-06-08T23:00:00Z"));
    expect(outbox.sms()).toHaveLength(0);
    expect(await countJobs(s.clientId, "instant_textback", "pending")).toBe(1);

    // 08:00 UTC is allowed again.
    await processDueJobs(getAdapters(), new Date("2026-06-09T08:00:00Z"));
    expect(outbox.sms()).toHaveLength(1);
  });
});
