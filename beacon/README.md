# Beacon

Multi-tenant SaaS for local home-services businesses (HVAC first). One **agency**
operates many white-labeled **client** sub-accounts. Beacon catches every lead →
sends an **instant text-back** → runs a **follow-up cadence** → fires an
**automated review request**, plus an **AI receptionist** that answers, qualifies,
and books.

Everything runs locally with **zero external accounts**: every external service
(telephony, SMS, email, LLM, calendar) sits behind a typed adapter with a working
**mock** implementation. Swapping to a live provider is a one-line env change.

> Engineering rules live in [`CLAUDE.md`](./CLAUDE.md). Read it before contributing.

---

## Stack

- **Next.js (App Router) + TypeScript** (strict, `noUncheckedIndexedAccess`)
- **PostgreSQL with Row-Level Security** (raw SQL migrations, `pg`)
- **Auth.js (NextAuth v5)** — credentials (email + bcrypt), agency & client roles
- **Postgres-backed job queue** + worker for timed workflows (no external queue)
- **Adapters**: Twilio (voice/SMS), Resend (email), Anthropic (AI), Google Calendar

## Multi-tenancy & isolation (the core guarantee)

- Two tenant levels: **agency** and **client**. Every tenant-scoped table carries
  **both `agency_id` and `client_id`**.
- **Postgres RLS is enabled + forced** on every tenant table. Policies key off
  session settings `app.agency_id` / `app.client_id`, set per-transaction by
  `withTenant()` (`src/lib/db/tenant.ts`).
- The app connects as the **non-superuser `beacon_app` role**, so RLS is actually
  enforced. The superuser admin connection is used **only** for migrations,
  seeding, the login credential lookup, inbound-call routing, and the queue worker
  — each clearly marked.
- `tests/tenant-isolation.test.ts` **proves** isolation (cross-tenant reads,
  writes, updates, deletes, and `WITH CHECK` insert-smuggling all blocked).

---

## Run it locally

**Prerequisites:** Node 20+, a local PostgreSQL 14+ with a superuser you can reach
(defaults assume `postgres:postgres@127.0.0.1:5432`).

```bash
cd beacon
npm install
cp .env.example .env            # defaults work for local dev (all providers = mock)

npm run setup                   # create beacon_app role + beacon_dev/beacon_test + migrate
npm run db:seed                 # demo agency + two HVAC clients + sample data
npm run dev                     # app at http://localhost:3000
npm run worker                  # (separate terminal) processes timed workflows
```

`npm run setup` runs `scripts/setup-db.ts` (provisions the non-superuser role and
both databases) then applies migrations to **dev and test**. If your superuser
differs, set `PGSUPER_URL` / `DATABASE_*` in `.env`.

### Demo logins (from `npm run db:seed`, password `demo1234`)

| Role         | Email                   | Sees                          |
| ------------ | ----------------------- | ----------------------------- |
| Agency admin | `owner@sunbelt.test`    | all clients in the agency     |
| Client admin | `manager@northwind.test`| only Northwind Heating & Air  |
| Client admin | `manager@cardinal.test` | only Cardinal Comfort HVAC    |

Sign in, then click through **Dashboard → Clients → Lead inbox → Pipeline →
Reporting**. The agency login sees everything; a client login sees only its own
data (RLS in action). The UI is responsive/legible on mobile.

### Try the lead → text-back loop

Webhooks are signature-verified (HMAC-SHA256 of the raw body with
`WEBHOOK_SIGNING_SECRET`, header `x-beacon-signature`). Helper to fire a missed
call for the seeded Northwind client:

```bash
node -e '
const {createHmac}=require("crypto");
const body=JSON.stringify({clientId:"<NORTHWIND_CLIENT_ID>",from:"+15557770001",to:"+15550100001",callSid:"CA-demo-1",status:"missed"});
const sig=createHmac("sha256","dev-webhook-secret-change-me").update(body).digest("hex");
console.log("curl -s localhost:3000/api/webhooks/voice -H content-type:application/json -H x-beacon-signature:"+sig+" -d \x27"+body+"\x27");
'
```

With the worker running, the contact appears in the **Lead inbox** and receives an
automated text-back (visible as an outbound message in the conversation). Reply
`STOP` (via the SMS webhook) to see opt-out + cadence cancellation.

Webhook endpoints: `POST /api/webhooks/sms`, `/api/webhooks/voice`,
`/api/webhooks/lead`.

---

## Tests

```bash
npm test          # 33 tests across 5 suites
npm run typecheck # tsc --noEmit (strict)
npm run build     # next production build
```

Coverage:

- **tenant-isolation** — RLS proofs (the security-critical suite)
- **crud** — clients & contacts repositories + webhook signature verification
- **automation** — instant text-back, idempotent webhooks, STOP/opt-out, engagement
  cancels cadence, review request, quiet-hours deferral
- **ai-harness** — scripted calls qualify + book; deterministic fallback when the
  LLM is broken; emergencies grab the earliest slot
- **units** — slot extraction, availability finder, quiet hours, opt-out keywords,
  log redaction

The AI receptionist ships a transcript test harness (`src/lib/ai/harness.ts`):
feed it scripted caller lines and assert on the booking outcome — fully
deterministic in mock mode.

---

## Architecture map

```
src/lib/
  env.ts                 # the only place env vars are read
  log.ts                 # structured logging with PII redaction
  db/                    # pools (app vs admin), withTenant(), migrate runner
  adapters/              # typed interfaces + mock/ (default) + live/ (one-line swap)
  domain/                # tenant-scoped repositories (clients, contacts, ...)
  auth/                  # Auth.js config, password hashing, session→scope
  ai/                    # extract, availability, receptionist engine, harness
  workflows/             # triggers, job handlers, quiet-hours, opt-out, templates
  queue/                 # enqueue (tenant) + worker (claim/run jobs)
  webhooks/              # signature verify, tenant routing, idempotent ingest
db/migrations/           # 0001 schema, 0002 RLS + grants
scripts/                 # setup-db, migrate, seed, reset, worker
```

## Going live — see [`GO-LIVE.md`](./GO-LIVE.md)

Every real account/credential and compliance step needed to swap mocks for live
providers is consolidated there.
