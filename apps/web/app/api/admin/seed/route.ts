/**
 * POST /api/admin/seed
 * One-shot: writes baseline tenant + theme records to Vercel KV.
 * Idempotent — safe to run multiple times, later records win.
 * Internal-only (requires session with isInternal).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { upsertTenant } from "@/lib/tenants";
import { setTenantTheme } from "@/lib/tenant-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANTS = [
  {
    slug: "vincomretail",
    name: "Vincom Retail",
    industry: "retail-mall",
    sourceUrl: "https://vincom.com.vn/",
    status: "active" as const,
    allowedProjects: ["Demo/Vincom Retail"],
    isDefault: false,
  },
  {
    slug: "salesforce-bank",
    name: "Salesforce Bank",
    industry: "retail-banking",
    status: "active" as const,
    allowedProjects: ["Demo/Salesforce Bank"],
    isDefault: true,
  },
  {
    slug: "mediamart",
    name: "MediaMart",
    industry: "retail-mediamart",
    sourceUrl: "https://mediamart.vn/",
    status: "active" as const,
    allowedProjects: ["Demo/MediaMart"],
    isDefault: false,
  },
];

const THEMES = [
  {
    tenantId: "vincomretail",
    companyName: "Vincom Retail",
    primaryColor: "#e30613",
    secondaryColor: "#f5a623",
    neutralColor: "#1b2a4a",
    sidebarTextColor: "#ffffff",
    fontFamily: "Inter",
    tone: "professional" as const,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/2/29/Logo_vincom.png",
  },
  {
    tenantId: "salesforce-bank",
    companyName: "Salesforce Bank",
    primaryColor: "#0176d3",
    secondaryColor: "#f5a623",
    neutralColor: "#032d60",
    sidebarTextColor: "#ffffff",
    fontFamily: "Inter",
    tone: "professional" as const,
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/320px-Salesforce.com_logo.svg.png",
  },
  {
    tenantId: "mediamart",
    companyName: "MediaMart",
    primaryColor: "#E50914",
    secondaryColor: "#FFD700",
    neutralColor: "#0F172A",
    sidebarTextColor: "#ffffff",
    fontFamily: "Inter",
    tone: "professional" as const,
    logoUrl: "/tenants/mediamart-logo.png",
  },
];

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";

  const results: string[] = [];

  for (const t of TENANTS) {
    if (force) {
      // Delete from KV first so upsert writes exactly TENANTS values with no merge
      try {
        const { kv } = await import("@vercel/kv");
        await kv.del(`tenant:${t.slug}`);
      } catch { /* local dev — no KV */ }
    }
    await upsertTenant(t);
    results.push(`tenant:${t.slug}`);
  }

  for (const th of THEMES) {
    if (force) {
      try {
        const { kv } = await import("@vercel/kv");
        await kv.del(`tenant-theme:${th.tenantId}`);
      } catch { /* local dev */ }
    }
    await setTenantTheme(th);
    results.push(`theme:${th.tenantId}`);
  }

  return NextResponse.json({ ok: true, force, seeded: results });
}
