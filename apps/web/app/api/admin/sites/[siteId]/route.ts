import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import {
  getSiteConfig,
  upsertSiteConfig,
  deleteSiteConfig,
  INDUSTRY_OPTIONS,
} from "@/lib/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  industries: z.array(z.enum(INDUSTRY_OPTIONS)).min(1).optional(),
  tableauSite: z.string().url().max(512).optional(),
  tableauSiteName: z.string().min(1).max(120).optional(),
  tableauSiteVersion: z.string().regex(/^\d{4}\.\d+$/).optional(),
  connectedAppClientId: z.string().uuid().optional(),
  connectedAppSecretId: z.string().uuid().optional(),
  connectedAppSecretValue: z.string().max(512).optional(),
  mcpUrl: z.string().url().max(512).optional().nullable(),
  factoryUrl: z.string().url().max(512).optional().nullable(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  const { siteId } = await context.params;
  const site = await getSiteConfig(siteId);
  if (!site) return new NextResponse("not found", { status: 404 });

  // Strip secret from GET response
  const { connectedAppSecretValue: _s, ...pub } = site;
  return NextResponse.json(pub);
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  const { siteId } = await context.params;
  const existing = await getSiteConfig(siteId);
  if (!existing) return new NextResponse("not found", { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const d = parsed.data;
  const updated = await upsertSiteConfig({
    id: siteId,
    label: d.label ?? existing.label,
    industries: d.industries ?? existing.industries,
    tableauSite: d.tableauSite ?? existing.tableauSite,
    tableauSiteName: d.tableauSiteName ?? existing.tableauSiteName,
    tableauSiteVersion: d.tableauSiteVersion ?? existing.tableauSiteVersion,
    connectedAppClientId: d.connectedAppClientId ?? existing.connectedAppClientId,
    connectedAppSecretId: d.connectedAppSecretId ?? existing.connectedAppSecretId,
    connectedAppSecretValue: d.connectedAppSecretValue ?? "",
    ...(d.mcpUrl != null ? { mcpUrl: d.mcpUrl } : existing.mcpUrl ? { mcpUrl: existing.mcpUrl } : {}),
    ...(d.factoryUrl != null ? { factoryUrl: d.factoryUrl } : existing.factoryUrl ? { factoryUrl: existing.factoryUrl } : {}),
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  const { siteId } = await context.params;
  const ok = await deleteSiteConfig(siteId);
  if (!ok) return new NextResponse("not found", { status: 404 });
  return NextResponse.json({ deleted: siteId });
}
