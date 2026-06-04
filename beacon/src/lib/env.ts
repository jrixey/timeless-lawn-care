/**
 * Centralized, typed environment access. Reading env vars only happens here so
 * we have one place to validate and one place to reason about secret handling.
 */

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

export type ProviderMode = "mock" | "live";

function providerMode(name: string): ProviderMode {
  return optional(name, "mock") === "live" ? "live" : "mock";
}

export const env = {
  isTest,

  // Database — tests use the *_TEST databases automatically.
  databaseUrl: isTest
    ? required("DATABASE_URL_TEST", "postgres://beacon_app:beacon_app@127.0.0.1:5432/beacon_test")
    : required("DATABASE_URL", "postgres://beacon_app:beacon_app@127.0.0.1:5432/beacon_dev"),
  databaseAdminUrl: isTest
    ? required("DATABASE_ADMIN_URL_TEST", "postgres://postgres:postgres@127.0.0.1:5432/beacon_test")
    : required("DATABASE_ADMIN_URL", "postgres://postgres:postgres@127.0.0.1:5432/beacon_dev"),

  authSecret: optional("AUTH_SECRET", "dev-only-insecure-secret-change-me-0000000000000="),

  providers: {
    sms: providerMode("SMS_PROVIDER"),
    voice: providerMode("VOICE_PROVIDER"),
    email: providerMode("EMAIL_PROVIDER"),
    llm: providerMode("LLM_PROVIDER"),
    calendar: providerMode("CALENDAR_PROVIDER"),
  },

  twilio: {
    accountSid: optional("TWILIO_ACCOUNT_SID"),
    authToken: optional("TWILIO_AUTH_TOKEN"),
    messagingServiceSid: optional("TWILIO_MESSAGING_SERVICE_SID"),
  },
  resend: {
    apiKey: optional("RESEND_API_KEY"),
    fromEmail: optional("RESEND_FROM_EMAIL", "noreply@example.com"),
  },
  anthropic: {
    apiKey: optional("ANTHROPIC_API_KEY"),
    model: optional("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  },
  google: {
    clientId: optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
  },

  webhookSigningSecret: optional("WEBHOOK_SIGNING_SECRET", "dev-webhook-secret-change-me"),

  quietHours: {
    start: Number(optional("QUIET_HOURS_START", "21")),
    end: Number(optional("QUIET_HOURS_END", "8")),
  },
} as const;
