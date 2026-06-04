import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { getClient, updateClient } from "@/lib/domain/clients";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const client = await withTenant(session.scope, (db) => getClient(db, id));
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ client });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  reviewLink: z.string().url().optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  aiConfig: z.record(z.unknown()).optional(),
  businessHours: z.record(z.unknown()).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }
  const client = await withTenant(session.scope, (db) => updateClient(db, id, parsed.data));
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ client });
}
