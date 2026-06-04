import { NextResponse } from "next/server";
import { readSignedJson } from "@/lib/webhooks/route-helpers";
import { ingestInboundSms } from "@/lib/webhooks/ingest";
import { log } from "@/lib/log";

export const runtime = "nodejs";

interface InboundSms {
  clientId?: string;
  from: string;
  to: string;
  body: string;
  messageSid: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = await readSignedJson<InboundSms>(req);
  if (!parsed.ok) return parsed.res;
  const { from, to, body, messageSid, clientId } = parsed.data;
  if (!from || !messageSid || (!to && !clientId)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const result = await ingestInboundSms({ clientId, from, to, body: body ?? "", messageSid });
  log.info("webhook.sms.inbound", { messageSid, duplicate: result.duplicate, ok: result.ok });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
