"use client";

import { useState } from "react";
import { Database, X } from "lucide-react";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

export interface SourcesInfo {
  datasources: string[];
  queryCount: number;
  syntheticData?: boolean;
  queries?: string[];
}

/**
 * Data-provenance footer under an agent answer that queried data (AG-08, DESIGN
 * §4.9): the datasource names + query count, a "Dữ liệu mô phỏng" chip for
 * synthetic-data tenants, and — internal users only — a "Xem truy vấn" button
 * that shows the raw VizQL query JSON of each call.
 */
export function SourcesFooter({
  sources,
  isInternal = false,
  locale = DEFAULT_LOCALE,
  variant = "panel",
}: {
  sources: SourcesInfo;
  isInternal?: boolean;
  locale?: Locale;
  variant?: "panel" | "page";
}) {
  const t = translator(locale);
  const [showQueries, setShowQueries] = useState(false);
  const dark = variant === "page";
  const muted = dark ? "text-white/50" : "text-sf-neutral-5";
  const chip = dark ? "border-white/15 bg-white/[0.06] text-white/70" : "border-sf-neutral-3 bg-sf-neutral-2 text-sf-neutral-6";
  const names = sources.datasources.length > 0 ? sources.datasources.join(", ") : "—";
  const hasQueries = isInternal && (sources.queries?.length ?? 0) > 0;

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-caption ${muted}`}>
      <Database className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{t("block.sources", { names })}</span>
      <span aria-hidden="true">·</span>
      <span>{t("block.queryCount", { n: sources.queryCount })}</span>
      {sources.syntheticData && (
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${chip}`}>
          {t("block.synthetic")}
        </span>
      )}
      {hasQueries && (
        <button
          type="button"
          onClick={() => setShowQueries(true)}
          className={`font-semibold underline-offset-2 hover:underline ${dark ? "text-sf-blue-40" : "text-brand"}`}
        >
          {t("block.viewQueries")}
        </button>
      )}

      {showQueries && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-sf-neutral-10/40 p-4 backdrop-blur-sm" onClick={() => setShowQueries(false)}>
          <div
            role="dialog"
            aria-label={t("block.viewQueries")}
            className="max-h-[70vh] w-full max-w-2xl overflow-auto rounded-2xl border border-sf-neutral-3 bg-white shadow-elev-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sf-neutral-3 px-4 py-2.5">
              <span className="text-body-sm font-semibold text-sf-neutral-9">{t("block.viewQueries")}</span>
              <button type="button" onClick={() => setShowQueries(false)} aria-label={t("common.close")} className="btn-icon">
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-2 p-4">
              {sources.queries?.map((q, i) => (
                <pre key={i} className="overflow-x-auto rounded-lg bg-sf-neutral-2 p-3 text-caption text-sf-neutral-8">
                  {safePretty(q)}
                </pre>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function safePretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
