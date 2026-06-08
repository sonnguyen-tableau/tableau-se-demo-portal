import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listSiteConfigs, upsertSiteConfig, INDUSTRY_OPTIONS } from "@/lib/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const siteSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{2,48}$/, "ID must be 2-48 lowercase alphanumeric chars or hyphens"),
  label: z.string().min(1).max(120),
  industries: z.array(z.enum(INDUSTRY_OPTIONS)).min(1),
  tableauSite: z.string().url().max(512),
  tableauSiteName: z.string().min(1).max(120),
  tableauSiteVersion: z.string().regex(/^\d{4}\.\d+$/, "Format: YYYY.minor"),
  connectedAppClientId: z.string().uuid(),
  connectedAppSecretId: z.string().uuid(),
  connectedAppSecretValue: z.string().min(1).max(512),
  mcpUrl: z.string().url().max(512).optional(),
  factoryUrl: z.string().url().max(512).optional(),
});

export async function GET(): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  const sites = await listSiteConfigs();
  return NextResponse.json(sites);
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const { mcpUrl, factoryUrl, ...rest } = parsed.data;
  const site = await upsertSiteConfig({
    ...rest,
    ...(mcpUrl != null ? { mcpUrl } : {}),
    ...(factoryUrl != null ? { factoryUrl } : {}),
  });
  return NextResponse.json(site, { status: 201 });
}
