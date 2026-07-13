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

// Pulse metrics are provisioned by the Factory / per-tenant scripts. Metric IDs
// are the Pulse "metric" LUIDs (the default metric of each definition), not the
// definition IDs. MediaMart metrics live on the dedicated single-table
// `mediamart-pulse` datasource (SalesFact + metadata-records — the plain
// `mediamart` extract has 0 Catalog-indexed fields so Pulse can't resolve it).
// See services/factory/scripts/mediamart/pulse_provision.py.
const CATALOG: Record<string, TenantPulseConfig> = {
  mediamart: {
    tenantId: "mediamart",
    metrics: [
      { id: "doanh-thu", name: "Doanh thu", metricId: "cac58f42-5025-4d19-a453-d515fd0f7440" },
      { id: "loi-nhuan-gop", name: "Lợi nhuận gộp", metricId: "932c5f14-1c2d-46b2-8d29-723c2ea9864e" },
      { id: "so-don-hang", name: "Số đơn hàng", metricId: "d16ad304-6e5b-40e4-a8a4-f2cf4755bfce" },
      { id: "san-luong-ban", name: "Sản lượng bán", metricId: "6a5ed178-4adb-4fc9-b839-0a14f43bb6d7" },
    ],
  },
};

export function getPulseConfig(tenantId: string): TenantPulseConfig | null {
  return CATALOG[tenantId] ?? null;
}

export function pulseSrc(metric: PulseMetric, opts: { siteId?: string } = {}): string {
  const site = env.TABLEAU_SITE ?? "";
  const origin = (() => {
    try {
      const u = new URL(site);
      return `${u.protocol}//${u.host}`;
    } catch {
      return site;
    }
  })();
  const siteId = opts.siteId ?? env.TABLEAU_SITE_NAME ?? "";
  return `${origin}/pulse/site/${siteId}/metrics/${metric.metricId}`;
}
