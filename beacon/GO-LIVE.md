# Beacon — Go-Live Checklist

Everything you must provide to swap the mock adapters for live providers and
deploy. The code is ready: set the relevant `*_PROVIDER=live` env var, fill in the
credentials below, and the matching live adapter in `src/lib/adapters/live/` takes
over. No code changes required for the happy path.

## 1. Accounts & credentials to obtain

### Telephony + SMS — Twilio  (`SMS_PROVIDER=live`, `VOICE_PROVIDER=live`)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- A Messaging Service (`TWILIO_MESSAGING_SERVICE_SID`) or per-client phone numbers
- One purchased phone number **per client** (so inbound routing maps a number → a
  tenant). Store it as the client's `phone`.
- Configure each number's **inbound SMS webhook** → `POST /api/webhooks/sms` and
  **voice/missed-call webhook** → `POST /api/webhooks/voice`.
- ⚠️ Live Twilio webhooks are signed with `X-Twilio-Signature` (not Beacon's
  HMAC). Add Twilio signature validation in `src/lib/webhooks/route-helpers.ts`
  for the live path (Twilio's `validateRequest`); the structure is already there.

### Email — Resend  (`EMAIL_PROVIDER=live`)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` on a **verified sending domain** (SPF + DKIM records).

### AI receptionist — Anthropic  (`LLM_PROVIDER=live`)
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`).

### Calendar — Google Calendar  (`CALENDAR_PROVIDER=live`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth app)
- Per-client OAuth: each client connects their Google account; store the access/
  refresh tokens (encrypted) and supply them to the adapter. (Token storage +
  refresh is the one piece intentionally left for production wiring.)

### Platform secrets
- `AUTH_SECRET` — generate with `openssl rand -base64 32` (do NOT ship the dev one).
- `WEBHOOK_SIGNING_SECRET` — strong random value for any non-Twilio webhook source.
- `DATABASE_URL` — **must** point at the non-superuser `beacon_app` role (RLS).
- `DATABASE_ADMIN_URL` — superuser, used only for migrations/seeding.

## 2. Compliance & operational steps (required before live SMS)

1. **A2P 10DLC registration (US SMS).** Register your Brand and a Campaign with
   The Campaign Registry via Twilio before sending application-to-person SMS.
   Unregistered traffic is filtered/blocked by carriers. Budget days for approval.
2. **SMS consent + opt-out (TCPA).** You must have prior express consent to text a
   lead. STOP/UNSUBSCRIBE handling and an opt-out confirmation are already
   implemented (`src/lib/workflows/opt-out.ts`); ensure your lead-capture forms
   capture consent and disclose message frequency/rates.
3. **Quiet hours.** Automated SMS are deferred during quiet hours
   (`QUIET_HOURS_START`/`END`). For production, convert these to **each client's
   local timezone** (the MVP interprets them in UTC — see
   `src/lib/workflows/quiet-hours.ts` and `src/lib/ai/availability.ts`).
4. **Voice call recording/transcription consent.** If you record or transcribe
   calls, follow one/two-party consent laws per state and add a disclosure.
5. **Email deliverability.** Verify your domain (SPF/DKIM/DMARC); include a
   physical address + unsubscribe in marketing email (CAN-SPAM).
6. **Data protection.** Beacon stores PII (names, phones, emails, message bodies).
   Logs redact PII (`src/lib/log.ts`); for production add encryption at rest,
   backups, a retention policy, and a DPA with each provider.
7. **AI disclosure.** Disclose that callers/texters may interact with an automated
   assistant where required.

## 3. Deployment checklist

- [ ] Provision managed Postgres; create the `beacon_app` **non-superuser** role
      and run `npm run db:migrate` with `DATABASE_ADMIN_URL`.
- [ ] Set all env vars above; flip the `*_PROVIDER` flags you're ready for
      (you can go live per-channel — e.g. SMS live, calendar still mock).
- [ ] Run the **worker** as a long-lived process (or a 1-min cron calling
      `processDueJobs`). It uses `FOR UPDATE SKIP LOCKED`, so you can run several.
- [ ] Point each client's Twilio number webhooks at your deployed URLs.
- [ ] Add Twilio `X-Twilio-Signature` verification for the live webhook path.
- [ ] Rotate `AUTH_SECRET` and `WEBHOOK_SIGNING_SECRET`; never reuse dev values.
- [ ] Complete A2P 10DLC before enabling automated SMS.
