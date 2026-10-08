"use client";

import { X, Sparkles } from "lucide-react";
import { useVizContext } from "@/components/bridge/VizContextProvider";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

/**
 * Active-filter chips (RV-03, DESIGN §4.5). One chip per filter in
 * VizContextState.filters — `Field: v1, v2 (+3)` with an × that clears it
 * (clearFilterAsync via the executor) — plus a trailing "Reset all"
 * (revertAllAsync). Agent-applied filters (source:"ai", from AG-05) get a brand
 * tint. Hidden when there are no filters; updates live as filters change.
 */
export function FilterChips({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = translator(locale);
  const { state, applyVizAction } = useVizContext();
  if (state.filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-caption text-sf-neutral-5">{t("view.filtersActive")}:</span>
      {state.filters.map((f) => {
        const shown = f.values.slice(0, 2).join(", ");
        const more = f.values.length - 2;
        const ai = f.source === "ai";
        return (
          <span
            key={f.field}
            title={ai ? t("view.aiFilter") : undefined}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption ${
              ai ? "border-brand/30 bg-brand/8 text-brand-text" : "border-sf-neutral-3 bg-white text-sf-neutral-7"
            }`}
          >
            {ai && <Sparkles className="h-3 w-3 shrink-0 text-brand" strokeWidth={2} aria-hidden="true" />}
            <span className="font-medium">{f.field}:</span>
            <span className="max-w-[160px] truncate">
              {shown}
              {more > 0 ? ` (+${more})` : ""}
            </span>
            <button
              type="button"
              onClick={() => void applyVizAction({ kind: "clearFilter", field: f.field }, { origin: "user" })}
              aria-label={`${t("view.resetFilters")} — ${f.field}`}
              className="ml-0.5 text-sf-neutral-5 transition-colors hover:text-sf-neutral-9"
            >
              <X className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => void applyVizAction({ kind: "revertAll" }, { origin: "user" })}
        className="text-caption font-semibold text-brand transition-colors hover:text-brand-text"
      >
        {t("view.resetAll")}
      </button>
    </div>
  );
}
