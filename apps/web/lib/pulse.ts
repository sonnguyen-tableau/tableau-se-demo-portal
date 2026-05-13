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

const CATALOG: Record<string, TenantPulseConfig> = {
  // Placeholder entries. Real values arrive via the factory in Phase 9 and
  // are unique per tenant.
  "tenant-acme": {
    tenantId: "tenant-acme",
    metrics: [
      { id: "revenue", name: "Revenue", metricId: "00000000-0000-0000-0000-aaaaaaaa0001" },
      { id: "aov", name: "Average Order Value", metricId: "00000000-0000-0000-0000-aaaaaaaa0002" },
      { id: "returns", name: "Return Rate", metricId: "00000000-0000-0000-0000-aaaaaaaa0003" },
    ],
  },
  internal: {
    tenantId: "internal",
    metrics: [
      { id: "impressions", name: "Site Impressions Today", metricId: "00000000-0000-0000-0000-bbbbbbbb0001" },
    ],
  },
};

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
