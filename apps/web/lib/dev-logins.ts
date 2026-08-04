/**
 * Auto-derived per-tenant dev logins.
 *
 * In DEV, every active tenant gets a login `<slug>@demo.com` with the password
 * `dev` — derived from the tenant registry, not stored. This means:
 *   - creating a tenant automatically "creates" its demo login (nothing to wire),
 *   - the sign-in page's demo-account list stays in sync with the tenant list
 *     (archive/reactivate via the "Sync with Tableau" flow is reflected for free),
 *   - no hand-maintained DEV_USERS_JSON for local demos.
 *
 * On CLOUD (PORTAL_ENV !== "dev") this is fully disabled — real auth goes through
 * KV portal users / DEV_USERS_JSON. See lib/auth.ts for the resolution order.
 *
 * Server-only: reads the tenant registry (KV/file). Never import into a client
 * component or edge middleware. lib/auth.ts imports it dynamically inside
 * `authorize` (Node) so it never enters the edge bundle.
 */
import "server-only";
import { env } from "@/lib/env";
import { getTenant, listTenants } from "@/lib/tenants";

const DEV_EMAIL_DOMAIN = "demo.com";
/** The shared password for every auto-derived dev login. Dev-only. */
export const DEV_DEFAULT_PASSWORD = "dev";

export interface DevTenantLogin {
  email: string;
  tenantId: string;
  tenantName: string;
}

/** Deterministic dev login email for a tenant slug: `<slug>@demo.com`. */
export function devEmailForSlug(slug: string): string {
  return `${slug}@${DEV_EMAIL_DOMAIN}`;
}

/**
 * The demo logins to advertise on the sign-in page: one per ACTIVE tenant.
 * Empty outside dev. Sorted by tenant name (listTenants already sorts).
 */
export async function listDevTenantLogins(): Promise<DevTenantLogin[]> {
  if (env.PORTAL_ENV !== "dev") return [];
  const tenants = await listTenants();
  return tenants
    .filter((t) => t.status === "active")
    .map((t) => ({ email: devEmailForSlug(t.slug), tenantId: t.slug, tenantName: t.name }));
}

/**
 * Authenticate an auto-derived tenant login. Returns the NextAuth user object,
 * or null if it doesn't apply (not dev, wrong password, wrong domain, or the
 * tenant doesn't exist / is archived). Archived tenants can't sign in — matching
 * that they're hidden from the portal.
 */
export async function verifyDevTenantLogin(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  groups: string[];
} | null> {
  if (env.PORTAL_ENV !== "dev") return null;
  if (password !== DEV_DEFAULT_PASSWORD) return null;

  const at = email.indexOf("@");
  if (at < 1 || email.slice(at + 1) !== DEV_EMAIL_DOMAIN) return null;
  const slug = email.slice(0, at);

  const tenant = await getTenant(slug);
  if (!tenant || tenant.status !== "active") return null;

  return {
    id: email,
    email,
    name: slug,
    tenantId: tenant.slug,
    tenantName: tenant.name,
    groups: [], // tenant user, not internal-employees → scoped portal, no admin hub
  };
}
