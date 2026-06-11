import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";
import { getSiteForTenant } from "@/lib/tenant-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const generatorParamsSchema = z.object({
  seed: z.number().int().optional(),
  yoy_growth_pct: z.number().optional(),
  base_daily_orders: z.number().int().optional(),
  base_daily_transactions: z.number().int().optional(),
  geographies: z.array(z.string()).optional(),
  n_winmart: z.number().int().optional(),
  n_winmart_plus: z.number().int().optional(),
  n_malls: z.number().int().optional(),
  n_products: z.number().int().optional(),
  n_lessees: z.number().int().optional(),
  base_daily_sales_winmart: z.number().int().optional(),
  base_daily_sales_winmart_plus: z.number().int().optional(),
  target_occupancy_rate: z.number().min(0).max(1).optional(),
  n_plants: z.number().int().optional(),
  lines_per_plant: z.number().int().optional(),
  n_suppliers: z.number().int().optional(),
  n_patients: z.number().int().optional(),
  n_providers: z.number().int().optional(),
  n_beds: z.number().int().optional(),
  n_carriers: z.number().int().optional(),
  n_hubs: z.number().int().optional(),
  n_lanes: z.number().int().optional(),
  n_vehicles: z.number().int().optional(),
  n_customers: z.number().int().optional(),
}).passthrough();

const brandSchema = z.object({
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  neutral_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font_family: z.string().max(80).default("Inter"),
  logo_url: z.string().url().max(2048).optional(),
  tone: z.enum(["professional", "playful", "technical"]).default("professional"),
});

const requestSchema = z.object({
  company_name: z.string().min(1).max(120),
  company_url: z.string().url().max(2048),
  industry: z.enum(["retail-ecommerce", "retail-banking", "retail-mall", "manufacturing", "healthcare", "logistics"]),
  tagline: z.string().max(280).optional(),
  logo_url: z.string().url().max(2048).optional(),
  generator_params: generatorParamsSchema.default({}),
  brand: brandSchema.optional(),
  tenant_slug: z.string().regex(/^[a-z0-9-]{2,48}$/i).optional(),
  site_id: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  admin_email: z.string().email().max(320).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden — internal only", { status: 403 });
  }

  const site = await getSiteForTenant(ctx.tenantId);
  const factoryUrl = site.factoryUrl ?? env.FACTORY_URL;
  if (!factoryUrl) {
    return new NextResponse("FACTORY_URL is not configured.", { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const portalBase = (() => {
    try { return new URL(req.url).origin; } catch { return ""; }
  })();

  const upstream = await fetch(new URL("/factory/direct", factoryUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...parsed.data,
      ...(portalBase ? { portal_url: portalBase } : {}),
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return new NextResponse(`factory error: ${detail}`, { status: 502 });
  }

  const job = (await upstream.json()) as { job_id: string };
  return NextResponse.json({ job_id: job.job_id, redirect: `/factory/${job.job_id}` });
}
