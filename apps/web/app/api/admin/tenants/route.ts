import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { upsertTenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,48}$/),
  name: z.string().min(1).max(120),
  industry: z.string().max(80),
  sourceUrl: z.string().url().max(2048).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const { slug, name, industry, sourceUrl } = parsed.data;
  const tenant = await upsertTenant({
    slug,
    name,
    industry,
    status: "active",
    ...(sourceUrl ? { sourceUrl } : {}),
  });
  return NextResponse.json(tenant, { status: 201 });
}
