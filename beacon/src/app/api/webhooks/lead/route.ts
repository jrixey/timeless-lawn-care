import { NextResponse } from "next/server";
import { readSignedJson } from "@/lib/webhooks/route-helpers";
import { ingestWebLead } from "@/lib/webhooks/ingest";
import { log } from "@/lib/log";

export const runtime = "nodejs";

interface WebLead {
  clientId: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = await readSignedJson<WebLead>(req);
  if (!parsed.ok) return parsed.res;
  const { clientId, name, phone, email, message } = parsed.data;
  if (!clientId) return NextResponse.json({ error: "missing clientId" }, { status: 400 });
  const result = await ingestWebLead({ clientId, name, phone, email, message });
  log.info("webhook.lead", { clientId, ok: result.ok, reason: result.reason });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
