"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  spec: Record<string, unknown>;
  title?: string | undefined;
  dark?: boolean | undefined;
}

export function VegaChart({ spec, title, dark = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let vegaView: { finalize: () => void } | null = null;

    (async () => {
      try {
        const vegaEmbed = (await import("vega-embed")).default;

        // Read the tenant brand chart palette from CSS vars (set by
        // themeToCssVariables → --brand-chart-N). Falls back to Vega's default
        // scheme when no vars are present (e.g. SSR/first paint), so charts are
        // always on-brand for a tenant without hard-coding colors here.
        const brandRange = readBrandChartPalette(container);

        const specConfig = typeof spec.config === "object" && spec.config !== null ? (spec.config as Record<string, unknown>) : {};
        const specRange = typeof specConfig.range === "object" && specConfig.range !== null ? (specConfig.range as Record<string, unknown>) : {};

        // Patch spec: remove explicit width/height to let it fill container,
        // apply dark or light theme config
        const patched: Record<string, unknown> = {
          ...spec,
          width: "container",
          background: dark ? "#0f172a" : "transparent",
          config: {
            ...specConfig,
            // Only inject a brand categorical range when the spec doesn't
            // already define one, so an explicit chart color choice always wins.
            ...(brandRange && specRange.category === undefined
              ? { range: { ...specRange, category: brandRange } }
              : {}),
            axis: {
              labelColor: dark ? "#94a3b8" : "#475569",
              titleColor: dark ? "#94a3b8" : "#475569",
              gridColor: dark ? "#1e293b" : "#f1f5f9",
              domainColor: dark ? "#334155" : "#e2e8f0",
              tickColor: dark ? "#334155" : "#e2e8f0",
            },
            legend: {
              labelColor: dark ? "#94a3b8" : "#475569",
              titleColor: dark ? "#94a3b8" : "#475569",
            },
            title: {
              color: dark ? "#f1f5f9" : "#0f172a",
            },
            view: {
              stroke: "transparent",
            },
          },
        };

        if (cancelled) return;

        const result = await vegaEmbed(container, patched as never, {
          actions: { export: true, source: false, compiled: false, editor: false },
          renderer: "svg",
          theme: dark ? "dark" : "vox",
        });
        vegaView = result.view as { finalize: () => void };
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Chart render failed");
      }
    })();

    return () => {
      cancelled = true;
      vegaView?.finalize();
      if (container) container.innerHTML = "";
    };
  }, [spec, dark]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
        Chart render error: {error}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border ${dark ? "border-white/10 bg-[#0f172a]" : "border-slate-200 bg-white"} shadow-sm`}>
      {title && (
        <div className={`border-b px-4 py-2.5 text-xs font-semibold ${dark ? "border-white/8 text-slate-300" : "border-slate-100 text-slate-700"}`}>
          {title}
        </div>
      )}
      <div ref={containerRef} className="w-full p-2" />
    </div>
  );
}

/**
 * Collect the tenant brand chart palette from the cascade (--brand-chart-1..N,
 * emitted by themeToCssVariables). Returns null when none are defined so the
 * caller can fall back to Vega's default scheme.
 */
function readBrandChartPalette(el: Element): string[] | null {
  if (typeof window === "undefined") return null;
  const styles = getComputedStyle(el);
  const out: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const v = styles.getPropertyValue(`--brand-chart-${i}`).trim();
    if (v) out.push(v);
  }
  return out.length > 0 ? out : null;
}
