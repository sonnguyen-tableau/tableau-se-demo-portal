"use client";

import { type ReactElement, useEffect, useState } from "react";
import { TableauPulseCard } from "@/components/embed/TableauPulseCard";

interface PulseMetricRef {
  id: string;
  name: string;
  metricId: string;
}

interface PulseTokenConfig {
  token: string;
  siteUrl: string;
  siteName: string;
}

/**
 * Renders a row of Tableau Pulse metric cards for a tenant. Mints one JWT with
 * the `tableau:insights:embed` scope (single token for all cards on the page),
 * then builds each Pulse `src` from siteUrl/siteName + metricId. Metric IDs come
 * from lib/pulse.ts CATALOG (provisioned by the factory / per-tenant scripts).
 */
export function PulseSection({ metrics }: { metrics: PulseMetricRef[] }): ReactElement | null {
  const [cfg, setCfg] = useState<PulseTokenConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tableau/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: ["tableau:insights:embed"] }),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`token ${res.status}`);
        const json = (await res.json()) as Partial<PulseTokenConfig>;
        if (!json.token || !json.siteUrl || !json.siteName) throw new Error("incomplete token");
        if (!cancelled) setCfg({ token: json.token, siteUrl: json.siteUrl, siteName: json.siteName });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (metrics.length === 0 || failed) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) =>
        cfg ? (
          <TableauPulseCard
            key={m.id}
            src={`${cfg.siteUrl}/pulse/site/${cfg.siteName}/metrics/${m.metricId}`}
            token={cfg.token}
            name={m.name}
            height="240px"
          />
        ) : (
          <div
            key={m.id}
            className="animate-pulse rounded-lg border border-sf-neutral-3 bg-sf-neutral-2/50 p-3"
            style={{ minHeight: "240px" }}
          >
            <div className="mb-2 h-4 w-24 rounded bg-sf-neutral-3" />
            <div className="h-32 w-full rounded bg-sf-neutral-3/60" />
          </div>
        ),
      )}
    </div>
  );
}
