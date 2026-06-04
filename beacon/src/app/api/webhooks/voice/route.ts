import { NextResponse } from "next/server";
import { readSignedJson } from "@/lib/webhooks/route-helpers";
import { ingestMissedCall } from "@/lib/webhooks/ingest";
import { log } from "@/lib/log";

export const runtime = "nodejs";

interface VoiceEvent {
  clientId?: string;
  from: string;
  to: string;
  callSid: string;
  status: "missed" | "completed" | "voicemail";
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = await readSignedJson<VoiceEvent>(req);
  if (!parsed.ok) return parsed.res;
  const { from, to, callSid, status, clientId } = parsed.data;
  if (!from || !callSid || (!to && !clientId)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  // A missed/voicemail call is a lead to chase; completed calls handled live.
  if (status === "missed" || status === "voicemail") {
    const result = await ingestMissedCall({ clientId, from, to, callSid });
    log.info("webhook.voice.missed", { callSid, duplicate: result.duplicate, ok: result.ok });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }
  return NextResponse.json({ ok: true, ignored: status });
}
