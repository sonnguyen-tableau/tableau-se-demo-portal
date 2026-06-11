/**
 * GET /api/admin/tenants/[slug]/projects
 * Returns the full live project list for the tenant's Tableau site.
 * Used by TenantAdminForm to show a project picker.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenant } from "@/lib/tenants";
import { getLiveCatalog } from "@/lib/tableau-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const { slug } = await context.params;
  const tenant = await getTenant(slug);
  if (!tenant) return new NextResponse("not found", { status: 404 });

  // Fetch full catalog (no project filter) so admin can choose from all
  const catalog = await getLiveCatalog(tenant.siteId ?? slug);

  // Build flat name list with parent/child paths
  const nameById = new Map(catalog.projects.map((p) => [p.id, p.name]));
  const projects = catalog.projects.map((p) => ({
    id: p.id,
    name: p.name,
    path: p.parentProjectId
      ? `${nameById.get(p.parentProjectId) ?? ""}/${p.name}`
      : p.name,
  }));

  return NextResponse.json({ projects });
}
