import "./_bootstrap.js";
import { adminPool } from "../src/lib/db/pool.js";
import { hashPassword } from "../src/lib/auth/password.js";
import { DEFAULT_WORKFLOW_CONFIG } from "../src/lib/workflows/templates.js";
import type { BusinessHours, AiConfig } from "../src/lib/domain/types.js";

/**
 * Create a demo agency with two HVAC clients and enough sample data to click
 * around immediately. Idempotent: wipes existing data first. Uses the admin
 * connection (bypasses RLS) because seeding is inherently cross-tenant.
 */

const PASSWORD = "demo1234";

const HOURS: BusinessHours = {
  "0": null,
  "1": [8, 18],
  "2": [8, 18],
  "3": [8, 18],
  "4": [8, 18],
  "5": [8, 18],
  "6": [9, 14],
};

function aiConfig(name: string): AiConfig {
  return {
    greeting: `Thanks for calling ${name}! This is the virtual assistant — how can I help today?`,
    services: ["A/C repair", "A/C installation", "heating repair", "furnace replacement", "maintenance"],
    pricing: "Diagnostic visit $89, waived if you book the repair.",
    hoursSummary: "Mon–Fri 8am–6pm, Sat 9am–2pm",
    tone: "friendly",
    appointmentMinutes: 90,
    bookingWindowDays: 14,
  };
}

async function main(): Promise<void> {
  const db = adminPool();
  await db.query("TRUNCATE agencies CASCADE");

  // ── Agency + agency admin ────────────────────────────────────────────────
  const agency = (
    await db.query<{ id: string }>(
      "INSERT INTO agencies (name, slug) VALUES ($1,$2) RETURNING id",
      ["Sunbelt Home Services", "sunbelt"],
    )
  ).rows[0]!;

  const adminHash = await hashPassword(PASSWORD);
  await db.query(
    `INSERT INTO users (agency_id, client_id, email, name, password_hash, role)
     VALUES ($1, NULL, $2, $3, $4, 'agency_admin')`,
    [agency.id, "owner@sunbelt.test", "Sunbelt Owner", adminHash],
  );

  // ── Two HVAC clients ──────────────────────────────────────────────────────
  const clientDefs = [
    { name: "Northwind Heating & Air", slug: "northwind", phone: "+15550100001", review: "https://g.page/northwind-hvac/review" },
    { name: "Cardinal Comfort HVAC", slug: "cardinal", phone: "+15550100002", review: "https://g.page/cardinal-comfort/review" },
  ];

  for (const def of clientDefs) {
    const client = (
      await db.query<{ id: string }>(
        `INSERT INTO clients (agency_id, name, slug, phone, timezone, business_hours, ai_config, review_link)
         VALUES ($1,$2,$3,$4,'America/New_York',$5,$6,$7) RETURNING id`,
        [
          agency.id,
          def.name,
          def.slug,
          def.phone,
          JSON.stringify(HOURS),
          JSON.stringify(aiConfig(def.name)),
          def.review,
        ],
      )
    ).rows[0]!;

    // Client admin user
    const clientHash = await hashPassword(PASSWORD);
    await db.query(
      `INSERT INTO users (agency_id, client_id, email, name, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'client_admin')`,
      [agency.id, client.id, `manager@${def.slug}.test`, `${def.name} Manager`, clientHash],
    );

    // Default workflows
    for (const [type, config] of [
      ["instant_textback", DEFAULT_WORKFLOW_CONFIG.instantTextback],
      ["lead_followup", DEFAULT_WORKFLOW_CONFIG.leadFollowup],
      ["review_request", DEFAULT_WORKFLOW_CONFIG.reviewRequest],
    ] as const) {
      await db.query(
        `INSERT INTO workflows (agency_id, client_id, type, enabled, config)
         VALUES ($1,$2,$3,true,$4)`,
        [agency.id, client.id, type, JSON.stringify(config)],
      );
    }

    // Sample contacts + a conversation with messages
    const leads = [
      { name: "Jordan Avery", phone: "+15551110001", source: "missed_call", stage: "new" },
      { name: "Priya Nair", phone: "+15551110002", source: "web_form", stage: "contacted" },
      { name: "Marcus Lee", phone: "+15551110003", source: "inbound_sms", stage: "booked" },
    ];
    for (const lead of leads) {
      const contact = (
        await db.query<{ id: string }>(
          `INSERT INTO contacts (agency_id, client_id, name, phone, source, stage)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [agency.id, client.id, lead.name, lead.phone, lead.source, lead.stage],
        )
      ).rows[0]!;

      const conv = (
        await db.query<{ id: string }>(
          `INSERT INTO conversations (agency_id, client_id, contact_id, channel, last_message_at)
           VALUES ($1,$2,$3,'sms', now()) RETURNING id`,
          [agency.id, client.id, contact.id],
        )
      ).rows[0]!;

      await db.query(
        `INSERT INTO messages (agency_id, client_id, conversation_id, contact_id, direction, channel, body, status, automated)
         VALUES
         ($1,$2,$3,$4,'inbound','sms',$5,'received',false),
         ($1,$2,$3,$4,'outbound','sms',$6,'sent',true)`,
        [
          agency.id,
          client.id,
          conv.id,
          contact.id,
          "Hi, my AC stopped working and it's really hot. Can someone come out?",
          `Hi ${lead.name.split(" ")[0]}, this is ${def.name} — so sorry to hear that! We can help. What's your address and a good time?`,
        ],
      );

      if (lead.stage === "booked") {
        const appt = (
          await db.query<{ id: string }>(
            `INSERT INTO appointments (agency_id, client_id, contact_id, title, starts_at, ends_at, status)
             VALUES ($1,$2,$3,'A/C repair', now() + interval '1 day', now() + interval '1 day' + interval '90 minutes', 'booked')
             RETURNING id`,
            [agency.id, client.id, contact.id],
          )
        ).rows[0]!;
        await db.query(
          `INSERT INTO reviews (agency_id, client_id, contact_id, appointment_id, status, review_link)
           VALUES ($1,$2,$3,$4,'pending',$5)`,
          [agency.id, client.id, contact.id, appt.id, def.review],
        );
      }
    }
  }

  console.log("\n✅ Seed complete.\n");
  console.log("Demo logins (password for all: " + PASSWORD + "):");
  console.log("  Agency admin : owner@sunbelt.test");
  console.log("  Client admin : manager@northwind.test");
  console.log("  Client admin : manager@cardinal.test\n");
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
