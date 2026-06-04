import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { listContacts, createContact } from "@/lib/domain/contacts";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const contacts = await withTenant(session.scope, (db) => listContacts(db, { clientId }));
  return NextResponse.json({ contacts });
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }
  // Client users may only create contacts under their own client.
  if (!session.isAgency && session.scope.clientId !== parsed.data.clientId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const contact = await withTenant(session.scope, (db) =>
    createContact(db, {
      agencyId: session.scope.agencyId,
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      notes: parsed.data.notes,
      source: "manual",
    }),
  );
  return NextResponse.json({ contact }, { status: 201 });
}
