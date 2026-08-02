/**
 * Tenant ⇄ Tableau-site sync.
 *
 * A fresh SE clones this repo and sees ~10 reference tenants that were built
 * against the *original author's* Tableau Cloud site — none of their Demo/*
 * folders exist on the new SE's site, so those portals render nothing. This
 * reconciles the tenant registry against whatever the current PAT can actually
 * see:
 *
 *   - A tenant "exists" on the site when its `allowedProjects` folder(s)
 *     resolve to ≥1 published view (a dashboard the portal could render).
 *   - `active` tenant whose folder is gone  → archive (hidden from the portal,
 *     kept in the admin list for reference — reversible).
 *   - `archived` tenant whose folder reappears → reactivate (bidirectional).
 *
 * SAFETY: if a site reports **zero projects total**, we treat that tenant as
 * `indeterminate` and leave it untouched. A successful Tableau sign-in always
 * returns at least the Default project, so zero means the fetch failed (missing
 * PAT, network, wrong site) — we must not mass-archive on a transient error.
 *
 * The plan is computed dry-run first; `apply` only mutates status. Tableau-side
 * artifacts are never touched. Server-side only.
 */

import { getLiveCatalog } from "@/lib/tableau-rest";
import { getSiteForTenant } from "@/lib/tenant-site";
import { listTenants, upsertTenant, type TenantRecord } from "@/lib/tenants";
import { audit } from "@/lib/audit";

export type SyncAction =
  | "archive" // active, folder missing → hide
  | "reactivate" // archived, folder present → show
  | "keep-active" // active, folder present → no change
  | "keep-archived" // archived, folder missing → no change
  | "indeterminate"; // site unreachable → left untouched

export interface SyncItem {
  slug: string;
  name: string;
  siteName: string;
  allowedProjects: string[];
  /** Views found in the tenant's allowed folder(s) on the live site. */
  matchedDashboards: number;
  currentStatus: TenantRecord["status"];
  action: SyncAction;
  /** True when `apply` actually changed this tenant's status. */
  changed?: boolean;
}

export interface SyncPlan {
  applied: boolean;
  items: SyncItem[];
  summary: {
    archive: number;
    reactivate: number;
    unchanged: number;
    indeterminate: number;
  };
  /** True if at least one tenant's site could not be read (see SAFETY note). */
  hasIndeterminate: boolean;
}

/** Decide what should happen to one tenant given the live-site probe. */
function decide(
  status: TenantRecord["status"],
  exists: boolean,
  siteReachable: boolean,
): SyncAction {
  if (!siteReachable) return "indeterminate";
  if (status === "active") return exists ? "keep-active" : "archive";
  return exists ? "reactivate" : "keep-archived";
}

/**
 * Probe every tenant against its resolved Tableau site and build a plan.
 * When `apply` is true, status changes (archive / reactivate) are persisted.
 */
export async function planTenantSync(opts: { apply: boolean }): Promise<SyncPlan> {
  const tenants = await listTenants();

  const items = await Promise.all(
    tenants.map(async (t): Promise<SyncItem> => {
      const allowedProjects = t.allowedProjects ?? [];
      let siteName = "(unresolved)";
      let matchedDashboards = 0;
      let siteReachable = false;

      try {
        const site = await getSiteForTenant(t.id);
        siteName = site.tableauSiteName || "(default)";

        // Full, unfiltered catalog for the tenant's site — used only for the
        // safety guard. getLiveCatalog caches per site, so the second (scoped)
        // call below reuses the same fetch; N tenants on one site = 1 fetch.
        const full = await getLiveCatalog(t.id);
        siteReachable = full.projects.length > 0;

        // Scoped to the tenant's allowed folders using the exact same matching
        // the portal catalog uses (case-insensitive name or Parent/Child path).
        const scoped = await getLiveCatalog(t.id, allowedProjects);
        matchedDashboards = scoped.dashboards.length;
      } catch {
        siteReachable = false;
      }

      const exists = matchedDashboards >= 1;
      const action = decide(t.status, exists, siteReachable);

      return {
        slug: t.slug,
        name: t.name,
        siteName,
        allowedProjects,
        matchedDashboards,
        currentStatus: t.status,
        action,
      };
    }),
  );

  if (opts.apply) {
    const bySlug = new Map(tenants.map((t) => [t.slug, t]));
    for (const item of items) {
      if (item.action !== "archive" && item.action !== "reactivate") continue;
      const record = bySlug.get(item.slug);
      if (!record) continue;
      const nextStatus = item.action === "archive" ? "archived" : "active";
      await upsertTenant({ ...record, status: nextStatus });
      item.changed = true;
      audit.emit({
        kind: "chat.start",
        userId: "(sync)",
        tenantId: item.slug,
        messageHash: `admin.sync.${item.action}`,
        messageLength: 0,
        hasVizContext: false,
      });
    }
  }

  const summary = {
    archive: items.filter((i) => i.action === "archive").length,
    reactivate: items.filter((i) => i.action === "reactivate").length,
    unchanged: items.filter(
      (i) => i.action === "keep-active" || i.action === "keep-archived",
    ).length,
    indeterminate: items.filter((i) => i.action === "indeterminate").length,
  };

  return {
    applied: opts.apply,
    items,
    summary,
    hasIndeterminate: summary.indeterminate > 0,
  };
}
