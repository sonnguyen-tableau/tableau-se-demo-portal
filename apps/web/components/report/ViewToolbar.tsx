"use client";

import { useState } from "react";
import { RotateCcw, RefreshCw, Link2 } from "lucide-react";
import { useVizContext } from "@/components/bridge/VizContextProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { encodeFilters } from "@/lib/view-filters";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

/**
 * Report view toolbar (RV-02, DESIGN §4.5). Reset filters (revertAllAsync,
 * disabled when none), Refresh data (refreshAsync on the active sheet's data
 * sources), and Share — copies the current URL plus `?f=` (base64url of the
 * active filters) so a shared link reproduces the filter state. Tableau's own
 * bottom toolbar still provides native export/fullscreen. Every control has a
 * tooltip + aria-label.
 */
export function ViewToolbar({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const t = translator(locale);
  const { state, applyVizAction } = useVizContext();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const hasFilters = state.filters.length > 0;

  const refresh = async () => {
    setRefreshing(true);
    await applyVizAction({ kind: "refreshData" }, { origin: "user" });
    setRefreshing(false);
  };

  const share = async () => {
    const f = encodeFilters(state.filters.map((x) => ({ field: x.field, values: x.values })));
    const url = `${window.location.origin}${window.location.pathname}${f ? `?f=${f}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("view.linkCopied"));
    } catch {
      /* clipboard blocked (insecure context) — no-op */
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip label={t("view.resetFilters")}>
        <button
          type="button"
          onClick={() => void applyVizAction({ kind: "revertAll" }, { origin: "user" })}
          disabled={!hasFilters}
          aria-label={t("view.resetFilters")}
          className="btn-icon disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label={t("view.refreshData")}>
        <button type="button" onClick={() => void refresh()} aria-label={t("view.refreshData")} className="btn-icon">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "motion-safe:animate-spin" : ""}`} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip label={t("view.share")}>
        <button type="button" onClick={() => void share()} aria-label={t("view.share")} className="btn-icon">
          <Link2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
