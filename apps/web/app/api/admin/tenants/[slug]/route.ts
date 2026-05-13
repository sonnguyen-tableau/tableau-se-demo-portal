import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { archiveTenant, deleteTenant, getTenant, upsertTenant } from "@/lib/tenants";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  industry: z.string().max(80).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { slug } = await context.params;
  const existing = await getTenant(slug);
  if (!existing) return new NextResponse("not found", { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  if (data.status === "archived") {
    const t = await archiveTenant(slug);
    audit.emit({
      kind: "chat.start",
      userId: session.user.email ?? "(none)",
      tenantId: slug,
      messageHash: `admin.archive`,
      messageLength: 0,
      hasVizContext: false,
    });
    return NextResponse.json(t);
  }

  const updated = await upsertTenant({
    slug,
    name: data.name ?? existing.name,
    industry: data.industry ?? existing.industry,
    ...(existing.sourceUrl !== undefined ? { sourceUrl: existing.sourceUrl } : {}),
    status: data.status ?? existing.status,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { slug } = await context.params;
  const ok = await deleteTenant(slug);
  if (!ok) return new NextResponse("not found", { status: 404 });
  return NextResponse.json({ deleted: slug });
}
