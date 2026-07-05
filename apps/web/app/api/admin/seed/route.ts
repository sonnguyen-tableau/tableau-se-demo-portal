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
    allowedProjects: ["Demo/MediaMart", "MediaMart"],
    isDefault: false,
  },
  {
    slug: "nam-a-bank",
    name: "Nam A Bank",
    industry: "retail-banking",
    sourceUrl: "https://www.namabank.com.vn/",
    status: "active" as const,
    allowedProjects: ["Demo/Nam A Bank"],
    isDefault: false,
  },
  {
    slug: "meygroup",
    name: "Mey Group",
    industry: "retail-realestate",
    sourceUrl: "https://meygroup.vn/",
    status: "active" as const,
    allowedProjects: ["Demo/Mey Group"],
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
  {
    tenantId: "nam-a-bank",
    companyName: "Nam A Bank",
    primaryColor: "#0072BC",
    secondaryColor: "#F58220",
    neutralColor: "#1A1A1A",
    sidebarTextColor: "#ffffff",
    fontFamily: "Inter",
    tone: "professional" as const,
    logoUrl: "/tenants/nam-a-bank-logo.png",
    logoLayout: "wordmark" as const,
  },
  {
    tenantId: "meygroup",
    companyName: "Mey Group",
    primaryColor: "#1B75BC",
    secondaryColor: "#29ABE2",
    neutralColor: "#0F2A47",
    sidebarTextColor: "#ffffff",
    fontFamily: "Inter",
    tone: "professional" as const,
    logoUrl: "/tenants/meygroup-logo.png",
    logoLayout: "wordmark" as const,
  },
];

// GET is an alias for POST — convenience so internal admins can trigger
// the reseed by opening the URL in the browser after signing in.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
}

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

  // Bust the in-memory Tableau catalog cache so newly seeded tenants
  // with allowedProjects pointing at Cloud folders are recomputed on
  // the next request (rather than serving a 5-min stale snapshot).
  try {
    const { invalidateCatalogCache } = await import("@/lib/tableau-rest");
    invalidateCatalogCache();
    results.push("cache:invalidated");
  } catch { /* module not loaded — skip */ }

  return NextResponse.json({ ok: true, force, seeded: results });
}
