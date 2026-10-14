"use client";

import { useState } from "react";
import { Download, Pin, ExternalLink } from "lucide-react";
import { VegaChart } from "@/components/chart/VegaChart";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

/**
 * Minimal shape of the rendered Vega view we need: enough to export a PNG.
 * VegaChart hands us its view via `onView`; its own view type additionally
 * carries `finalize`, so it stays assignable to this narrower interface.
 */
interface ChartView {
  toImageURL: (type: string, scaleFactor?: number) => Promise<string>;
}

interface ChartBlockProps {
  /** Vega-Lite spec rendered by <VegaChart>. */
  spec: Record<string, unknown>;
  /** Header title. Shown in the ChartBlock header (not passed to VegaChart). */
  title?: string;
  /** "panel" = light docked surface, "page" = dark full Agent page. */
  variant?: "panel" | "page";
  /** Accessible label + visible text for the Download-PNG action. */
  downloadLabel: string;
  /** When provided, renders a Pin action. */
  onPin?: () => void;
  /** Accessible label for the Pin action. */
  pinLabel?: string;
  /** When provided, renders an "Open in dashboard" action. */
  onOpenInDashboard?: () => void;
  /** Accessible label + visible text for the "Open in dashboard" action. */
  openLabel?: string;
  /** Locale for VegaChart's (rare) render-error label. */
  locale?: Locale;
}

/**
 * A chart rich-block (DESIGN v2 §4.9): a surface-card with a header row
 * (title + actions cluster) over a Vega chart body. Owns the actions that
 * Vega's native menu used to provide — Download PNG, Pin, Open in dashboard —
 * so Vega's own action menu is hidden (`actions={false}`). Pure/presentational:
 * all user-facing text arrives via props.
 */
export function ChartBlock({
  spec,
  title,
  variant = "panel",
  downloadLabel,
  onPin,
  pinLabel,
  onOpenInDashboard,
  openLabel,
  locale = DEFAULT_LOCALE,
}: ChartBlockProps) {
  const dark = variant === "page";
  const [view, setView] = useState<ChartView | null>(null);

  async function handleDownload() {
    if (!view) return;
    let url: string | null = null;
    try {
      url = await view.toImageURL("png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${toFileName(title)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* PNG export failed — nothing to download; leave the view untouched. */
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  const surface = dark
    ? "border-white/10 bg-white/[0.03]"
    : "border-sf-neutral-3 bg-white";
  const divider = dark ? "border-white/10" : "border-sf-neutral-3";
  const titleColor = dark ? "text-white/85" : "text-sf-neutral-8";
  const btn = `inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm font-medium transition-colors duration-base ease-smooth disabled:cursor-not-allowed disabled:opacity-40 ${
    dark ? "text-white/60 hover:text-white" : "text-sf-neutral-6 hover:text-brand"
  }`;

  return (
    <div className={`overflow-hidden rounded-xl border ${surface}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${divider}`}>
        <span className={`min-w-0 truncate text-body-sm font-semibold ${titleColor}`}>{title}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={btn} onClick={handleDownload} disabled={!view} aria-label={downloadLabel}>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>{downloadLabel}</span>
          </button>
          {onPin && (
            <button type="button" className={btn} onClick={onPin} aria-label={pinLabel} title={pinLabel}>
              <Pin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          {onOpenInDashboard && (
            <button type="button" className={btn} onClick={onOpenInDashboard} aria-label={openLabel}>
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>{openLabel}</span>
            </button>
          )}
        </div>
      </div>
      <div className="p-2">
        <VegaChart spec={spec} dark={dark} actions={false} onView={setView} locale={locale} />
      </div>
    </div>
  );
}

/** Slugify a title into a safe PNG filename; empty/undefined → "chart". */
function toFileName(title: string | undefined): string {
  const slug = (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "chart";
}
