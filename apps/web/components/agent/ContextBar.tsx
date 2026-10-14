"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, X } from "lucide-react";
import { useOptionalVizContext } from "@/components/bridge/VizContextProvider";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

/**
 * One line above the composer showing what the agent can see (DESIGN v2 §4.10):
 * active sheet · N filters (fields in the tooltip) · N selected marks. The × on
 * the marks chip excludes them from the NEXT request only (via the hook's
 * excludeNextMarks) — it does not clear the selection on the viz. Renders
 * nothing outside a VizContextProvider (the full Agent page) or with no context.
 */
export function ContextBar({
  locale = DEFAULT_LOCALE,
  onExcludeMarks,
}: {
  locale?: Locale;
  onExcludeMarks: () => void;
}) {
  const viz = useOptionalVizContext();
  const t = translator(locale);
  const marksCount = viz?.state.selectedMarks.length ?? 0;
  const [excluded, setExcluded] = useState(false);

  // A new selection re-includes the marks (reset the one-shot exclusion).
  useEffect(() => {
    setExcluded(false);
  }, [marksCount]);

  if (!viz || !viz.state.ready) return null;
  const { activeSheet, filters } = viz.state;
  const showMarks = marksCount > 0 && !excluded;
  if (!activeSheet && filters.length === 0 && !showMarks) return null;

  return (
    <div className="flex items-center gap-1.5 border-t border-sf-neutral-3 bg-sf-neutral-2 px-3 py-1.5 text-caption text-sf-neutral-6">
      <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {activeSheet && <span className="min-w-0 truncate">{activeSheet}</span>}
      {filters.length > 0 && (
        <span className="shrink-0" title={filters.map((f) => f.field).join(", ")}>
          · {t("agent.context.filters", { n: filters.length })}
        </span>
      )}
      {showMarks && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/8 px-1.5 py-0.5 text-brand-text">
          {t("agent.context.marks", { n: marksCount })}
          <button
            type="button"
            onClick={() => {
              setExcluded(true);
              onExcludeMarks();
            }}
            aria-label={t("view.clearSelection")}
            className="transition-opacity hover:opacity-70"
          >
            <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}
