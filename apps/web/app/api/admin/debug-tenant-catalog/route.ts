/**
 * GET /api/admin/debug-tenant-catalog?slug=vincomretail
 * Returns the raw tenant record from KV/file + the filtered catalog for that tenant.
 * Internal-only. Remove after debugging.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenant } from "@/lib/tenants";
import { getLiveCatalog, getCachedWorkbooks } from "@/lib/tableau-rest";

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

  // Fetch full (unfiltered) catalog first to warm the cache and expose raw workbooks
  const fullCatalog = await getLiveCatalog(tenantRecord.id);
  const allWorkbooks = getCachedWorkbooks();

  // Then fetch filtered catalog
  const filtered = await getLiveCatalog(tenantRecord.id, tenantRecord.allowedProjects);

  return NextResponse.json({
    tenantRecord,
    allowedProjects: tenantRecord.allowedProjects ?? [],
    filteredCatalog: {
      projectCount: filtered.projects.length,
      dashboardCount: filtered.dashboards.length,
      projects: filtered.projects.map((p) => ({ id: p.id, name: p.name, parentProjectId: p.parentProjectId })),
    },
    allWorkbooksOnSite: allWorkbooks.map((wb) => ({
      name: wb.name,
      projectName: wb.projectName,
      projectId: wb.projectId,
      contentUrl: wb.contentUrl,
    })),
    allProjectsOnSite: fullCatalog.projects.map((p) => ({
      id: p.id,
      name: p.name,
      parentProjectId: p.parentProjectId,
    })),
    fetchedAt: filtered.fetchedAt,
  });
}
