import type { Session } from "next-auth";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  region: "NA" | "EMEA" | "APAC" | undefined;
  groups: string[];
  isInternal: boolean;
}

const INTERNAL_GROUP = "internal-employees";

export function tenantFromSession(session: Session | null): TenantContext | null {
  if (!session?.user) return null;
  const user = session.user;
  const groups = user.groups ?? [];
  return {
    tenantId: user.tenantId,
    tenantName: user.tenantName,
    region: user.region,
    groups,
    isInternal: groups.includes(INTERNAL_GROUP) || user.tenantId === "internal",
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
