/**
 * Resolves the Tableau site configuration for a given tenant.
 *
 * Resolution order:
 *   1. tenant.siteId → look up SiteConfig in the registry (set via /admin/sites)
 *   2. Fallback → deployment-level env vars (TABLEAU_SITE, TABLEAU_CONNECTED_APP_*, etc.)
 *
 * This is the single call-site for "which Tableau site does this tenant use?".
 * All API routes (JWT mint, chat, catalog, factory) should call this instead of
 * reading env vars directly when a tenantId is known.
 */

import { env } from "@/lib/env";
import { getTenant } from "@/lib/tenants";
import { getSiteConfig } from "@/lib/site-config";

export interface ResolvedSite {
  tableauSite: string;
  tableauSiteName: string;
  tableauSiteVersion: string;
  connectedAppClientId: string;
  connectedAppSecretId: string;
  connectedAppSecretValue: string;
  mcpUrl: string | undefined;
  factoryUrl: string | undefined;
  /** true when resolved from SiteConfig registry; false when using env-var fallback */
  fromRegistry: boolean;
}

/** Env-var fallback — used when no siteId is set on the tenant. */
function fromEnv(): ResolvedSite {
  return {
    tableauSite: env.TABLEAU_SITE ?? "",
    tableauSiteName: env.TABLEAU_SITE_NAME ?? "",
    tableauSiteVersion: env.TABLEAU_SITE_VERSION ?? "2026.1",
    connectedAppClientId: env.TABLEAU_CONNECTED_APP_CLIENT_ID ?? "",
    connectedAppSecretId: env.TABLEAU_CONNECTED_APP_SECRET_ID ?? "",
    connectedAppSecretValue: env.TABLEAU_CONNECTED_APP_SECRET_VALUE ?? "",
    mcpUrl: env.TABLEAU_MCP_URL,
    factoryUrl: env.FACTORY_URL,
    fromRegistry: false,
  };
}

/**
 * Resolves the site for a tenant. Never throws — falls back to env vars on any
 * lookup failure so existing deployments keep working without any migration.
 */
export async function getSiteForTenant(tenantId: string): Promise<ResolvedSite> {
  try {
    const tenant = await getTenant(tenantId);
    if (!tenant?.siteId) return fromEnv();

    const cfg = await getSiteConfig(tenant.siteId);
    if (!cfg) return fromEnv();

    return {
      tableauSite: cfg.tableauSite,
      tableauSiteName: cfg.tableauSiteName,
      tableauSiteVersion: cfg.tableauSiteVersion,
      connectedAppClientId: cfg.connectedAppClientId,
      connectedAppSecretId: cfg.connectedAppSecretId,
      connectedAppSecretValue: cfg.connectedAppSecretValue,
      mcpUrl: cfg.mcpUrl ?? env.TABLEAU_MCP_URL,
      factoryUrl: cfg.factoryUrl ?? env.FACTORY_URL,
      fromRegistry: true,
    };
  } catch {
    return fromEnv();
  }
}

/** Build the Tableau origin URL from a resolved site (strips #/site/... fragment). */
export function resolvedSiteOrigin(site: ResolvedSite): string {
  try {
    const u = new URL(site.tableauSite);
    return `${u.protocol}//${u.host}`;
  } catch {
    return site.tableauSite;
  }
}

/** Build a canonical view embed URL from a resolved site. */
export function resolvedSiteViewUrl(site: ResolvedSite, viewPath: string): string {
  const trimmed = viewPath.replace(/^\/+/, "");
  return `${resolvedSiteOrigin(site)}/t/${site.tableauSiteName}/views/${trimmed}`;
}
