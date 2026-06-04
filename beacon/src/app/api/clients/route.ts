import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionScope } from "@/lib/auth/scope";
import { withTenant } from "@/lib/db/tenant";
import { listClients, createClient } from "@/lib/domain/clients";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const clients = await withTenant(session.scope, (db) => listClients(db));
  return NextResponse.json({ clients });
}

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  reviewLink: z.string().url().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSessionScope();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!session.isAgency) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }
  const client = await withTenant(session.scope, (db) =>
    createClient(db, { agencyId: session.scope.agencyId, ...parsed.data }),
  );
  return NextResponse.json({ client }, { status: 201 });
}
