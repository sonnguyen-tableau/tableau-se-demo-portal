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
import { getHiddenWorkbookIds } from "@/lib/catalog-filter";

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
  const hiddenIds = await getHiddenWorkbookIds();

  // Then fetch filtered catalog
  const filtered = await getLiveCatalog(tenantRecord.id, tenantRecord.allowedProjects);

  // Workbooks in allowed projects, cross-referenced against hidden list
  const allowedProjectIds = new Set(filtered.projects.map((p) => p.id));
  const workbooksInAllowedProjects = allWorkbooks.filter((wb) => allowedProjectIds.has(wb.projectId));

  return NextResponse.json({
    tenantRecord,
    allowedProjects: tenantRecord.allowedProjects ?? [],
    filteredCatalog: {
      projectCount: filtered.projects.length,
      dashboardCount: filtered.dashboards.length,
      projects: filtered.projects.map((p) => ({ id: p.id, name: p.name, parentProjectId: p.parentProjectId })),
    },
    hiddenWorkbookIds: [...hiddenIds],
    workbooksInAllowedProjects: workbooksInAllowedProjects.map((wb) => ({
      id: wb.id,
      name: wb.name,
      projectName: wb.projectName,
      isHidden: hiddenIds.has(wb.id),
    })),
    allProjectsOnSite: fullCatalog.projects.map((p) => ({
      id: p.id,
      name: p.name,
      parentProjectId: p.parentProjectId,
    })),
    fetchedAt: filtered.fetchedAt,
  });
}
