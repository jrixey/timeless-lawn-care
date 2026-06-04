import { env } from "@/lib/env";
import type { Adapters } from "./types.js";
import { MockSmsAdapter } from "./mock/sms.js";
import { MockVoiceAdapter } from "./mock/voice.js";
import { MockEmailAdapter } from "./mock/email.js";
import { MockLlmAdapter } from "./mock/llm.js";
import { MockCalendarAdapter } from "./mock/calendar.js";
import { TwilioSmsAdapter, TwilioVoiceAdapter } from "./live/twilio.js";
import { ResendEmailAdapter } from "./live/resend.js";
import { AnthropicLlmAdapter } from "./live/anthropic.js";
import { GoogleCalendarAdapter } from "./live/google-calendar.js";

/**
 * Build the adapter set based on `*_PROVIDER` env. Defaults to mocks so the app
 * runs with zero external accounts. Live adapters do not connect at construction
 * time — they only reach out (and validate credentials) on first use.
 */
let cached: Adapters | null = null;

export function getAdapters(): Adapters {
  if (cached) return cached;
  cached = {
    sms: env.providers.sms === "live" ? new TwilioSmsAdapter() : new MockSmsAdapter(),
    voice: env.providers.voice === "live" ? new TwilioVoiceAdapter() : new MockVoiceAdapter(),
    email: env.providers.email === "live" ? new ResendEmailAdapter() : new MockEmailAdapter(),
    llm: env.providers.llm === "live" ? new AnthropicLlmAdapter() : new MockLlmAdapter(),
    calendar:
      env.providers.calendar === "live"
        ? new GoogleCalendarAdapter()
        : new MockCalendarAdapter(),
  };
  return cached;
}

/** Test helper: force re-evaluation of provider selection. */
export function resetAdapters(): void {
  cached = null;
}

export type { Adapters } from "./types.js";
