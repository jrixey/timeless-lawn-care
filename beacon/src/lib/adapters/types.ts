/**
 * Typed contracts for every external service. The app depends ONLY on these
 * interfaces. Mock implementations ship by default so the whole system builds,
 * runs, and tests green with zero external accounts. Swapping to a real provider
 * is a one-line env change (`*_PROVIDER=live`) — see `src/lib/adapters/index.ts`.
 */

// ── SMS / Telephony (Twilio) ────────────────────────────────────────────────
export interface SendSmsInput {
  to: string;
  from: string;
  body: string;
  /** Stable key so retries don't double-send. */
  idempotencyKey?: string;
}
export interface SendSmsResult {
  providerMessageId: string;
  status: "queued" | "sent" | "delivered" | "failed";
}
export interface SmsAdapter {
  readonly name: string;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
}

export interface PlaceCallInput {
  to: string;
  from: string;
  /** URL/handler ref the telephony provider would hit for call control. */
  handlerRef?: string;
}
export interface PlaceCallResult {
  providerCallId: string;
  status: "ringing" | "in_progress" | "completed" | "failed";
}
export interface VoiceAdapter {
  readonly name: string;
  placeCall(input: PlaceCallInput): Promise<PlaceCallResult>;
}

// ── Email (Resend) ──────────────────────────────────────────────────────────
export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}
export interface SendEmailResult {
  providerMessageId: string;
  status: "queued" | "sent" | "failed";
}
export interface EmailAdapter {
  readonly name: string;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

// ── LLM (Anthropic) ─────────────────────────────────────────────────────────
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}
export interface LlmCompleteInput {
  system: string;
  messages: LlmMessage[];
  /** Optional JSON schema name to encourage structured output (mock honors it). */
  maxTokens?: number;
  temperature?: number;
}
export interface LlmCompleteResult {
  text: string;
  stopReason: "end_turn" | "max_tokens" | "stop";
}
export interface LlmAdapter {
  readonly name: string;
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
}

// ── Calendar (Google) ───────────────────────────────────────────────────────
export interface FreeBusySlot {
  start: string; // ISO
  end: string; // ISO
}
export interface CreateEventInput {
  calendarId: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  description?: string;
  attendeeEmail?: string;
  idempotencyKey?: string;
}
export interface CreateEventResult {
  eventId: string;
}
export interface CalendarAdapter {
  readonly name: string;
  /** Busy intervals within [from,to). Mock returns a deterministic schedule. */
  getBusy(calendarId: string, from: string, to: string): Promise<FreeBusySlot[]>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
}

export interface Adapters {
  sms: SmsAdapter;
  voice: VoiceAdapter;
  email: EmailAdapter;
  llm: LlmAdapter;
  calendar: CalendarAdapter;
}
