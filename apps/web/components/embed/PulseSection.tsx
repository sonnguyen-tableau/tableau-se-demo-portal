"use client";

import { type ReactElement, useEffect, useState } from "react";
import { TableauPulseCard } from "@/components/embed/TableauPulseCard";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

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
export function PulseSection({ metrics, locale = DEFAULT_LOCALE }: { metrics: PulseMetricRef[]; locale?: Locale }): ReactElement | null {
  const t = translator(locale);
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

  if (metrics.length === 0) return null;

  // Token failure → an inline error row, not a silently hidden section (RV-06).
  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-body-sm text-amber-800">
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        {t("th.pulseError")}
      </div>
    );
  }

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
