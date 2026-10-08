/**
 * Shared Vega-Lite render config for agent charts (AG-02). One light + one dark
 * theme so the docked panel (light) and the full Agent page (dark) render
 * identically. Colors mirror the sf-neutral tokens; the categorical range is
 * injected per-tenant at render time from `--brand-chart-N` (see VegaChart), so
 * we never hard-code series colors here.
 */

export type VegaLiteConfig = Record<string, unknown>;

interface ThemePalette {
  axisLabel: string;
  gridColor: string;
  domainColor: string;
  titleColor: string;
}

const LIGHT: ThemePalette = {
  axisLabel: "#4b5563", // sf-neutral-7
  gridColor: "#e8eaee", // sf-neutral-3
  domainColor: "#c9cdd4", // sf-neutral-4
  titleColor: "#1f2937", // sf-neutral-9
};

const DARK: ThemePalette = {
  axisLabel: "rgba(255,255,255,0.6)",
  gridColor: "rgba(255,255,255,0.10)",
  domainColor: "rgba(255,255,255,0.18)",
  titleColor: "#ffffff",
};

/** The Vega-embed `background` for a chart in the given theme. */
export function vegaBackground(dark: boolean): string {
  return dark ? "#0f172a" : "transparent";
}

/**
 * Build the Vega-Lite `config` block for a chart. `specConfig` is the spec's own
 * config (preserved), `brandRange` is the tenant categorical palette (injected
 * only when the spec doesn't already define `range.category`, so an explicit
 * chart color choice always wins), `dark` selects the theme.
 */
export function vegaConfig(
  dark: boolean,
  specConfig: Record<string, unknown>,
  brandRange: string[] | null,
): VegaLiteConfig {
  const p = dark ? DARK : LIGHT;
  const specRange =
    typeof specConfig.range === "object" && specConfig.range !== null
      ? (specConfig.range as Record<string, unknown>)
      : {};
  return {
    ...specConfig,
    ...(brandRange && specRange.category === undefined
      ? { range: { ...specRange, category: brandRange } }
      : {}),
    axis: {
      labelColor: p.axisLabel,
      titleColor: p.axisLabel,
      gridColor: p.gridColor,
      domainColor: p.domainColor,
      tickColor: p.domainColor,
    },
    legend: { labelColor: p.axisLabel, titleColor: p.axisLabel },
    title: { color: p.titleColor },
    view: { stroke: "transparent" },
  };
}
