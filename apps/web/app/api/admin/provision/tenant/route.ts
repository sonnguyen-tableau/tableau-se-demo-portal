/**
 * POST /api/admin/provision/tenant
 * Called by the factory sidecar during Stage 11 (provision).
 * Creates or updates a TenantRecord from factory output.
 * Authenticated via X-Factory-Secret header (shared secret, not user session).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertTenant } from "@/lib/tenants";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,48}$/),
  name: z.string().min(1).max(120),
  industry: z.string().max(80),
  sourceUrl: z.string().url().max(2048).optional(),
  siteId: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
});

function authorized(req: Request): boolean {
  const secret = env.FACTORY_PROVISION_SECRET;
  if (!secret) return false;
  return req.headers.get("x-factory-secret") === secret;
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const { slug, name, industry, sourceUrl, siteId } = parsed.data;
  const tenant = await upsertTenant({
    slug,
    name,
    industry,
    status: "active",
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(siteId ? { siteId } : {}),
  });
  return NextResponse.json(tenant, { status: 201 });
}
