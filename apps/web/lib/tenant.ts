import type { Session } from "next-auth";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  region: "NA" | "EMEA" | "APAC" | undefined;
  groups: string[];
  isInternal: boolean;
}

const INTERNAL_GROUPS = ["internal-employees", "internal"];

/**
 * Display-name overrides for the workspace label, keyed by tenantId.
 *
 * `tenantName` is a pure display string (the "Workspace" badge, breadcrumb,
 * Agent page, and the system-prompt greeting) — it drives no logic; tenant
 * identity and Tableau routing use `tenantId` / `allowedProjects`. It is
 * normally seeded onto each portal user's KV record, so overriding it here (the
 * single choke point every consumer reads through) is the canonical, re-seed-
 * safe way to relabel a workspace without touching user records or the brand
 * name (`tenant.name` / `theme.companyName`).
 */
const WORKSPACE_NAME_OVERRIDES: Record<string, string> = {
  meygroup: "MEYGROUP",
};

/** Apply a display-name override for the workspace label, if one exists. */
export function workspaceDisplayName(tenantId: string, fallback: string): string {
  return WORKSPACE_NAME_OVERRIDES[tenantId] ?? fallback;
}

export function tenantFromSession(session: Session | null): TenantContext | null {
  if (!session?.user) return null;
  const user = session.user;
  const groups = user.groups ?? [];
  return {
    tenantId: user.tenantId,
    tenantName: workspaceDisplayName(user.tenantId, user.tenantName),
    region: user.region,
    groups,
    isInternal:
      groups.some((g) => INTERNAL_GROUPS.includes(g)) ||
      user.tenantId === "internal",
  };
}

/**
 * Returns true when the requested tenant slug matches the session, or when
 * the user is an internal employee (who can view all tenants).
 */
export function canAccessTenant(ctx: TenantContext | null, requestedSlug: string): boolean {
  if (!ctx) return false;
  if (ctx.isInternal) return true;
  return ctx.tenantId === requestedSlug;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
