# Beacon — Engineering Rules (CLAUDE.md)

Beacon is a **multi-tenant SaaS for local home-services businesses** (starting
with HVAC). One **agency** operates many white-labeled **client** sub-accounts.
The product outcome: catch every lead → instant text-back → follow-up sequence →
automated review request, plus an **AI receptionist** that answers, qualifies,
and books calls.

## Non-negotiables (read before writing any code)

### 1. Strict multi-tenancy (treat a cross-tenant leak as a critical bug)
- Two tenant levels: **agency** (Beacon's customer) and **client** (the agency's
  white-labeled sub-account). The primary tenant scope is `client_id`.
- **Every tenant-scoped table has both `agency_id` and `client_id`** (agency_id
  is denormalized onto every row for defense-in-depth).
- **Every tenant-scoped table has Postgres Row-Level Security `ENABLE`d and
  `FORCE`d.** Policies key off session settings `app.agency_id` and
  `app.client_id`.
- **Never run an app query outside a tenant scope.** All runtime DB access goes
  through `withTenant(scope, fn)` (`src/lib/db/tenant.ts`), which opens a
  transaction, `SET LOCAL`s the session vars, and runs as the **non-superuser**
  `beacon_app` role so RLS is enforced.
- The only code allowed to bypass RLS is migrations/seeding (admin connection)
  and the auth credential lookup (`src/lib/auth/lookup.ts`, clearly marked
  `UNSAFE_`). Nothing else may use the admin pool.
- A tenant must NEVER see another tenant's data. There are dedicated
  isolation tests (`tests/tenant-isolation.test.ts`) that PROVE this; keep them
  green and extend them whenever you add a tenant-scoped table.

### 2. TypeScript strict + secret hygiene
- `tsconfig` is `strict` + `noUncheckedIndexedAccess`. No `any` escape hatches in
  committed code.
- **Secrets only via env vars.** Never commit or log API keys or PII. `.env` is
  git-ignored; `.env.example` documents every variable. Logs redact phone
  numbers, emails, and message bodies (`src/lib/log.ts`).

### 3. Everything external is behind a typed adapter + ships a working MOCK
- Telephony/SMS (Twilio), Email (Resend), LLM (Anthropic), Calendar (Google) all
  sit behind typed interfaces in `src/lib/adapters/*`.
- **Mock implementations ship by default** so the whole app builds, runs, and
  tests green with ZERO external accounts. Swapping to a real provider is a
  one-line env change (`*_PROVIDER=live`).
- Adapters are selected in `src/lib/adapters/index.ts` based on `*_PROVIDER` env.

## Stack
- Next.js (App Router) + TypeScript (strict)
- PostgreSQL with RLS via `pg` (raw SQL migrations in `db/migrations`)
- Auth.js (NextAuth v5) — Credentials provider (email + password, bcrypt)
- A simple **Postgres-backed job queue** (`jobs` table + `scripts/worker.ts`)
  for timed workflows (instant text-back, follow-up cadence, review requests)
- Adapters: Twilio (voice/SMS), Resend (email), Anthropic (AI), Google Calendar

## Data model (tenant-scoped tables carry agency_id + client_id)
`agencies`, `users`, `clients`, `contacts`, `conversations`, `messages`,
`calls`, `appointments`, `reviews`, `workflows`, `workflow_runs`, plus `jobs`
(queue). See `db/migrations` for the source of truth.

## How to run locally
```bash
npm install
npm run setup     # create roles/db + run migrations (needs local Postgres)
npm run db:seed   # demo agency + two demo clients with sample data
npm run dev       # app on http://localhost:3000
npm run worker    # processes the job queue (timed workflows)
npm test          # unit + integration + tenant-isolation + AI harness
```

## Conventions
- Tenant scope object: `{ agencyId, clientId? , role }`. `clientId` omitted ⇒
  agency-wide read across that agency's clients (still agency-isolated).
- All money is integer **cents**. All times are UTC `timestamptz`.
- Webhook handlers must be **idempotent** (dedupe on provider event id) and
  **signature-verified** before doing work.
- Automation must be idempotent, cancelable, and quiet-hours aware; outbound
  automated SMS always honors STOP/opt-out.
- Prefer pure, unit-testable functions for business logic; keep IO at the edges.
