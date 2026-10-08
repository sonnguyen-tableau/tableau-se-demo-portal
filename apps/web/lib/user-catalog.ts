import "server-only";
import type { Session } from "next-auth";
import { getLiveCatalog, type LiveDashboard, type LiveProject } from "@/lib/tableau-rest";
import { getVisibleWorkbookIds } from "@/lib/catalog-filter";
import { getTenant } from "@/lib/tenants";
import { tenantFromSession, canAccessTenant } from "@/lib/tenant";

/**
 * The single user-visible catalog (HL-07). It folds the two filters that used
 * to be applied ad-hoc (and inconsistently) across the tenant pages into one
 * place:
 *   1. tenant project scope — `getLiveCatalog(tenantId, allowedProjects)`
 *   2. per-user visibility — `getVisibleWorkbookIds` (global hidden set ∩ the
 *      user's workbook allowlist)
 * so a workbook hidden for a user disappears from EVERY surface: the sidebar
 * tree, home, the library, the workbook and view pages (a direct URL 404s), and
 * the agent's advisory workbook list in `/api/chat`.
 *
 * `projects` is returned unfiltered on purpose: `ProjectTree` and the library's
 * group view both drop a project once it has no visible dashboards, and keeping
 * every project in the list preserves parent→child nesting in the sidebar tree.
 */
export interface UserCatalog {
  projects: LiveProject[];
  dashboards: LiveDashboard[];
}

export async function getUserCatalog(
  session: Session | null,
  tenantSlug: string,
): Promise<UserCatalog> {
  const ctx = tenantFromSession(session);
  // Fail closed for a tenant this user may not access (FX-06). Returning an
  // empty catalog means every downstream surface — the pages (a direct URL
  // 404s on no matching dashboard, so no JWT mint / impression), the agent's
  // advisory workbook list in /api/chat, and thumbnails — gets nothing for a
  // forbidden tenant, independent of any page-level guard.
  if (!canAccessTenant(ctx, tenantSlug)) return { projects: [], dashboards: [] };

  const userEmail = session?.user?.email ?? "";
  const tenantRecord = await getTenant(tenantSlug);

  // Resolve against the URL tenant (tenantSlug), not the session tenant, so an
  // internal user viewing another portal sees THAT tenant's catalog.
  const [catalog, visibleIds] = await Promise.all([
    getLiveCatalog(tenantSlug, tenantRecord?.allowedProjects),
    getVisibleWorkbookIds(userEmail, tenantSlug, tenantRecord?.allowedProjects),
  ]);

  // `visibleIds === null` means "no per-user filtering" (see getVisibleWorkbookIds).
  const dashboards = visibleIds
    ? catalog.dashboards.filter((d) => visibleIds.has(d.workbookId))
    : catalog.dashboards;

  return { projects: catalog.projects, dashboards };
}
