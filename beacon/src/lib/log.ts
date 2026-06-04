/**
 * Tiny structured logger with PII redaction. We must NEVER log raw phone
 * numbers, emails, message bodies, or secrets.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Drop obviously-sensitive keys entirely.
      if (/(secret|token|password|apikey|api_key|authorization)/i.test(k)) {
        out[k] = "[redacted]";
      } else if (/(body|message|transcript)/i.test(k) && typeof v === "string") {
        out[k] = `[${v.length} chars]`;
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
