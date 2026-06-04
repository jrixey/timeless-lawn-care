/**
 * In-memory record of everything the mock providers "sent". Tests and the dev
 * UI inspect this to assert on outbound SMS / email / calls without any external
 * account. Idempotency keys are de-duplicated here so retries don't double-send.
 */
export interface OutboxSms {
  kind: "sms";
  to: string;
  from: string;
  body: string;
  providerMessageId: string;
  at: string;
}
export interface OutboxEmail {
  kind: "email";
  to: string;
  from: string;
  subject: string;
  text: string;
  providerMessageId: string;
  at: string;
}
export interface OutboxCall {
  kind: "call";
  to: string;
  from: string;
  providerCallId: string;
  at: string;
}
export type OutboxEntry = OutboxSms | OutboxEmail | OutboxCall;

class Outbox {
  private entries: OutboxEntry[] = [];
  private seenKeys = new Map<string, string>(); // idempotencyKey -> providerId

  record(entry: OutboxEntry, idempotencyKey?: string): string {
    if (idempotencyKey && this.seenKeys.has(idempotencyKey)) {
      return this.seenKeys.get(idempotencyKey)!;
    }
    this.entries.push(entry);
    const id =
      entry.kind === "call"
        ? (entry as OutboxCall).providerCallId
        : (entry as OutboxSms | OutboxEmail).providerMessageId;
    if (idempotencyKey) this.seenKeys.set(idempotencyKey, id);
    return id;
  }

  /** Was this idempotency key already used? */
  has(idempotencyKey: string): boolean {
    return this.seenKeys.has(idempotencyKey);
  }

  all(): readonly OutboxEntry[] {
    return this.entries;
  }
  sms(): OutboxSms[] {
    return this.entries.filter((e): e is OutboxSms => e.kind === "sms");
  }
  emails(): OutboxEmail[] {
    return this.entries.filter((e): e is OutboxEmail => e.kind === "email");
  }
  calls(): OutboxCall[] {
    return this.entries.filter((e): e is OutboxCall => e.kind === "call");
  }
  clear(): void {
    this.entries = [];
    this.seenKeys.clear();
  }
}

// Single shared instance across the process.
export const outbox = new Outbox();

let counter = 0;
export function mockId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
