/**
 * GET /api/admin/debug-tenant-catalog?slug=vincomretail
 * Returns the raw tenant record from KV/file + the filtered catalog for that tenant.
 * Internal-only. Remove after debugging.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenant } from "@/lib/tenants";
import { getLiveCatalog } from "@/lib/tableau-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const slug = new URL(req.url).searchParams.get("slug") ?? "vincomretail";

  const tenantRecord = await getTenant(slug);
  if (!tenantRecord) {
    return NextResponse.json({ error: `Tenant '${slug}' not found` }, { status: 404 });
  }

  const catalog = await getLiveCatalog(tenantRecord.id, tenantRecord.allowedProjects);

  return NextResponse.json({
    tenantRecord,
    allowedProjects: tenantRecord.allowedProjects ?? [],
    catalogSummary: {
      projectCount: catalog.projects.length,
      dashboardCount: catalog.dashboards.length,
      projects: catalog.projects.map((p) => ({ id: p.id, name: p.name, parentProjectId: p.parentProjectId })),
      dashboardSample: catalog.dashboards.slice(0, 5).map((d) => ({
        workbookName: d.workbookName,
        viewName: d.viewName,
        projectName: d.projectName,
      })),
    },
    fetchedAt: catalog.fetchedAt,
  });
}
