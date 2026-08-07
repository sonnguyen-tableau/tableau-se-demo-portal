/**
 * PUT /api/admin/provision/theme
 * Called by the factory sidecar to apply the extracted BrandTheme to a tenant.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { setTenantTheme } from "@/lib/tenant-theme";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  tenantId: z.string().min(1).max(120),
  companyName: z.string().min(1).max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  neutralColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().max(80),
  logoUrl: z.string().url().max(2048).optional(),
  tone: z.enum(["professional", "playful", "technical"]).optional(),
  chartPalette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).optional(),
  heroVariant: z.enum(["aurora", "editorial", "spotlight"]).optional(),
});

function authorized(req: Request): boolean {
  const secret = env.FACTORY_PROVISION_SECRET;
  if (!secret) return false;
  return req.headers.get("x-factory-secret") === secret;
}

export async function PUT(req: Request): Promise<Response> {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const { logoUrl, tone, chartPalette, heroVariant, ...rest } = parsed.data;
  const theme = await setTenantTheme({
    ...rest,
    ...(logoUrl ? { logoUrl } : {}),
    ...(tone ? { tone } : {}),
    ...(chartPalette ? { chartPalette } : {}),
    ...(heroVariant ? { heroVariant } : {}),
  });
  return NextResponse.json(theme, { status: 200 });
}
