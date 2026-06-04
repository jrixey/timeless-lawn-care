import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Beacon's default webhook signature scheme: HMAC-SHA256 over the raw request
 * body using WEBHOOK_SIGNING_SECRET, sent in the `x-beacon-signature` header.
 * The mock providers and tests sign with `signBody`. For LIVE Twilio you would
 * instead verify the `X-Twilio-Signature` header (documented in the README).
 */
export function signBody(rawBody: string): string {
  return createHmac("sha256", env.webhookSigningSecret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signBody(rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
