import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kpiSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["currency", "percent", "number"]),
  favorable_direction: z.enum(["up", "down", "neutral"]),
  time_dim: z.string().min(1).max(120).nullish(),
});

const profileSchema = z.object({
  company_name: z.string().min(1).max(200),
  company_url: z.string().max(2048),
  tagline: z.string().max(280).nullish(),
  logo_url: z.string().max(2048).nullish(),
  industry: z.enum([
    "retail-ecommerce",
    "retail-banking",
    "manufacturing",
    "healthcare",
    "logistics",
  ]),
  sub_vertical: z.string().max(120).nullish(),
  products: z.array(z.string().max(120)).max(40).default([]),
  segments: z.array(z.string().max(120)).max(20).default([]),
  geographies: z.array(z.enum(["NA", "EMEA", "APAC", "LATAM"])).max(8).default([]),
  kpis: z.array(kpiSchema).max(20).default([]),
  market_events: z.array(z.record(z.string().max(120), z.union([z.string(), z.number()]))).max(20).default([]),
  growth_trend_pct: z.number().min(-50).max(100).default(0),
});

const requestSchema = z.object({ profile_override: profileSchema.optional() });

export async function POST(
  req: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!env.FACTORY_URL) {
    return new NextResponse("FACTORY_URL is not configured.", { status: 503 });
  }

  const { jobId } = await context.params;
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(jobId)) {
    return new NextResponse("invalid job id", { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Allow empty bodies — "confirm without overrides".
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const upstream = await fetch(new URL(`/factory/${jobId}/confirm`, env.FACTORY_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!upstream.ok) {
    return new NextResponse(await upstream.text(), { status: upstream.status });
  }
  return NextResponse.json(await upstream.json());
}
