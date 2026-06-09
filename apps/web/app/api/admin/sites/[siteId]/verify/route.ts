/**
 * POST /api/admin/sites/[siteId]/verify
 * Tests the Tableau Connected App credentials for a given SiteConfig.
 * Mints a short-lived JWT and tries to call the Tableau REST API /auth/signin.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getSiteConfig } from "@/lib/site-config";
import { mintTableauJwt } from "@portal/tableau-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const { siteId } = await context.params;
  const site = await getSiteConfig(siteId);
  if (!site) {
    return NextResponse.json({ ok: false, message: "Site config not found" }, { status: 404 });
  }

  try {
    // Mint a test JWT (sub = verify-probe, short TTL)
    const jwt = await mintTableauJwt(
      {
        clientId: site.connectedAppClientId,
        secretId: site.connectedAppSecretId,
        secretValue: site.connectedAppSecretValue,
      },
      {
        sub: "verify-probe@factory.internal",
        tenantId: "internal",
        scopes: ["tableau:views:embed"],
        ttlSeconds: 60,
      },
    );

    // Call Tableau REST API to validate — use the Tableau Cloud origin
    const origin = (() => {
      try {
        const u = new URL(site.tableauSite);
        return `${u.protocol}//${u.host}`;
      } catch {
        return site.tableauSite;
      }
    })();

    const res = await fetch(`${origin}/api/${site.tableauSiteVersion}/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentials: {
          jwt,
          site: { contentUrl: site.tableauSiteName },
        },
      }),
    });

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        message: `Kết nối thành công — site "${site.tableauSiteName}" hoạt động.`,
      });
    }

    const body = await res.text();
    // Tableau returns XML error; try to extract the detail
    const detail = body.match(/<detail>([^<]+)<\/detail>/)?.[1] ?? `HTTP ${res.status}`;
    return NextResponse.json({ ok: false, message: `Lỗi Tableau: ${detail}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: `Lỗi kết nối: ${msg.slice(0, 200)}` });
  }
}
