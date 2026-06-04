import { NextResponse } from "next/server";
import { verifySignature } from "./verify.js";

/**
 * Read the raw body, verify the Beacon webhook signature, and parse JSON.
 * Returns either the parsed payload or a NextResponse to short-circuit with.
 */
export async function readSignedJson<T>(
  req: Request,
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  const raw = await req.text();
  const sig = req.headers.get("x-beacon-signature");
  if (!verifySignature(raw, sig)) {
    return { ok: false, res: NextResponse.json({ error: "invalid signature" }, { status: 401 }) };
  }
  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }
}
