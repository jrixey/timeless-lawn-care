/**
 * Deterministic slot extraction for the AI receptionist. This is the single
 * source of truth: the MOCK LLM uses it to produce structured output, and the
 * receptionist engine uses it as a deterministic fallback when the (real) LLM
 * returns unparseable output. Keeping it pure makes the AI test harness
 * reproducible with zero external calls.
 */

export type ServiceType =
  | "ac_repair"
  | "ac_install"
  | "heating_repair"
  | "heating_install"
  | "maintenance"
  | "other";

export type Urgency = "emergency" | "soon" | "flexible";

export interface Slots {
  service: ServiceType | null;
  urgency: Urgency | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  preferredTime: string | null;
}

export function emptySlots(): Slots {
  return {
    service: null,
    urgency: null,
    name: null,
    phone: null,
    address: null,
    preferredTime: null,
  };
}

function detectService(t: string): ServiceType | null {
  const install = /\b(install|replace|replacement|new (system|unit|ac|furnace)|quote|estimate)\b/.test(t);
  const cooling = /\b(a\/?c|air ?condition\w*|cooling|cool|freon)\b/.test(t) || /\bnot? cool/.test(t);
  const heating = /\b(heat\w*|furnace|no heat|warm)\b/.test(t);
  if (cooling) return install ? "ac_install" : "ac_repair";
  if (heating) return install ? "heating_install" : "heating_repair";
  if (/\b(tune ?up|maintenance|service plan|check ?up|inspection)\b/.test(t)) return "maintenance";
  if (/\b(install|replace|estimate|quote)\b/.test(t)) return "other";
  return null;
}

function detectUrgency(t: string): Urgency | null {
  if (
    /\b(emergency|asap|right now|urgent|no heat|no cooling|not working|broke\w*|leak\w*|today|flood)\b/.test(
      t,
    )
  ) {
    return "emergency";
  }
  if (/\b(this week|soon|couple days|few days|tomorrow|by (mon|tue|wed|thu|fri))\b/.test(t)) {
    return "soon";
  }
  if (/\b(whenever|no rush|flexible|next week|anytime)\b/.test(t)) return "flexible";
  return null;
}

function detectName(raw: string): string | null {
  const m =
    raw.match(/\b(?:my name is|this is|i am|i'm|it's|its)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ??
    raw.match(/\bname(?:'s| is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (!m || !m[1]) return null;
  // Avoid capturing common non-name words.
  const candidate = m[1].trim();
  if (/^(calling|here|looking|trying|hoping|wondering|not)\b/i.test(candidate)) return null;
  return candidate;
}

function detectPhone(raw: string): string | null {
  const m = raw.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function detectAddress(raw: string): string | null {
  const m =
    raw.match(/\b(\d{1,6}\s+[A-Za-z0-9.\s]+?(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|way|ct|court|circle|cir|pl|place)\b\.?)/i) ??
    raw.match(/\baddress is\s+(.+?)(?:[.,]|$)/i);
  return m && m[1] ? m[1].trim() : null;
}

function detectPreferredTime(raw: string): string | null {
  const m = raw.match(
    /\b((this|next|tomorrow|today)?\s?(morning|afternoon|evening|am|pm)|(mon|tue|wed|thu|fri|sat|sun)\w*|tomorrow|today|\d{1,2}(:\d{2})?\s?(am|pm))\b/i,
  );
  return m ? m[0].trim() : null;
}

/** Extract whatever slots are present in a single utterance. */
export function extractSlots(text: string): Slots {
  const t = text.toLowerCase();
  return {
    service: detectService(t),
    urgency: detectUrgency(t),
    name: detectName(text),
    phone: detectPhone(text),
    address: detectAddress(text),
    preferredTime: detectPreferredTime(text),
  };
}

/** Merge a freshly-extracted utterance into accumulated state (new wins). */
export function mergeSlots(prev: Slots, next: Slots): Slots {
  return {
    service: next.service ?? prev.service,
    urgency: next.urgency ?? prev.urgency,
    name: next.name ?? prev.name,
    phone: next.phone ?? prev.phone,
    address: next.address ?? prev.address,
    preferredTime: next.preferredTime ?? prev.preferredTime,
  };
}
