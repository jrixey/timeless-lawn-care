import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { getContact, updateContact } from "@/lib/domain/contacts";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const contact = await withTenant(session.scope, (db) => getContact(db, id));
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ contact });
}

const patchSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  stage: z.enum(["new", "contacted", "qualified", "booked", "won", "lost"]).optional(),
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
  const contact = await withTenant(session.scope, (db) => updateContact(db, id, parsed.data));
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ contact });
}
