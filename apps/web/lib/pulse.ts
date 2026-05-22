import { env } from "@/lib/env";

/**
 * Pulse metric registry per tenant. Phase 5 ships a static stub; Phase 9
 * replaces this with rows from the database populated by the Factory.
 */
export interface PulseMetric {
  id: string;
  /** Display name (overridable in the UI). */
  name: string;
  /** Pulse metric UUID (`<site>/pulse/site/<siteId>/metrics/<metricId>`). */
  metricId: string;
}

export interface TenantPulseConfig {
  tenantId: string;
  siteId?: string;
  metrics: PulseMetric[];
}

// Pulse metrics are provisioned by the Factory (Phase 9+).
// Empty catalog disables the Pulse section until real metric IDs are available.
const CATALOG: Record<string, TenantPulseConfig> = {};

export function getPulseConfig(tenantId: string): TenantPulseConfig | null {
  return CATALOG[tenantId] ?? null;
}

export function pulseSrc(metric: PulseMetric, opts: { siteId?: string } = {}): string {
  const origin = (() => {
    try {
      const u = new URL(env.TABLEAU_SITE);
      return `${u.protocol}//${u.host}`;
    } catch {
      return env.TABLEAU_SITE;
    }
  })();
  const siteId = opts.siteId ?? env.TABLEAU_SITE_NAME;
  return `${origin}/pulse/site/${siteId}/metrics/${metric.metricId}`;
}
