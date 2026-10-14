"use client";

import { useEffect, useRef, useState } from "react";
import { vegaConfig, vegaBackground } from "@/lib/vega-theme";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

interface VegaView {
  toImageURL: (type: string, scaleFactor?: number) => Promise<string>;
  finalize: () => void;
}

interface Props {
  spec: Record<string, unknown>;
  title?: string | undefined;
  dark?: boolean | undefined;
  /** Hide Vega's native action menu when false (AG-02: ChartBlock owns actions). */
  actions?: boolean | undefined;
  /** Receive the rendered Vega view — e.g. for Download PNG via toImageURL. */
  onView?: ((view: VegaView) => void) | undefined;
  locale?: Locale | undefined;
}

/**
 * Strip remote data loaders from an untrusted (agent-authored) Vega-Lite spec
 * (FX-04). Agent charts always embed inline `data.values`; a `url` anywhere in
 * the spec is a remote loader that would make the user's browser fetch an
 * attacker-chosen URL (SSRF-by-proxy / data exfiltration). Vega-Lite has no
 * legitimate non-`url` use of that key, so we drop every `url` recursively.
 */
export function sanitizeVegaSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k === "url") continue; // remote data / image loader
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(spec) as Record<string, unknown>;
}

export function VegaChart({ spec, title, dark = false, actions = true, onView, locale = DEFAULT_LOCALE }: Props) {
  const t = translator(locale);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let vegaView: VegaView | null = null;

    (async () => {
      try {
        const vegaEmbed = (await import("vega-embed")).default;

        // Read the tenant brand chart palette from CSS vars (set by
        // themeToCssVariables → --brand-chart-N). Falls back to Vega's default
        // scheme when no vars are present (e.g. SSR/first paint), so charts are
        // always on-brand for a tenant without hard-coding colors here.
        const brandRange = readBrandChartPalette(container);
        const specConfig =
          typeof spec.config === "object" && spec.config !== null
            ? (spec.config as Record<string, unknown>)
            : {};

        // Fill the container; apply the shared light/dark theme config
        // (lib/vega-theme), injecting the tenant brand range when present.
        // Strip remote loaders first — the spec is agent-authored (untrusted).
        const patched: Record<string, unknown> = {
          ...sanitizeVegaSpec(spec),
          width: "container",
          background: vegaBackground(dark),
          config: vegaConfig(dark, specConfig, brandRange),
        };

        if (cancelled) return;

        const result = await vegaEmbed(container, patched as never, {
          actions: actions
            ? { export: true, source: false, compiled: false, editor: false }
            : false,
          renderer: "svg",
          theme: dark ? "dark" : "vox",
        });
        vegaView = result.view as VegaView;
        onViewRef.current?.(vegaView);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Chart render failed");
      }
    })();

    return () => {
      cancelled = true;
      vegaView?.finalize();
      if (container) container.innerHTML = "";
    };
  }, [spec, dark, actions]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
        {t("block.chartError")}: {error}
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
