"use client";

import { useState } from "react";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

function describe(name: string, input: Record<string, unknown>, t: ReturnType<typeof translator>): string {
  const s = (k: string) => String(input[k] ?? "");
  const values = Array.isArray(input.values) ? (input.values as unknown[]).map(String).join(", ") : s("values");
  switch (name) {
    case "viz_applyFilter":
      return t("viz.applyFilter", { field: s("field"), values });
    case "viz_clearFilter":
      return t("viz.clearFilter", { field: s("field") });
    case "viz_selectMarks":
      return t("viz.selectMarks", { field: s("field") });
    case "viz_clearSelectedMarks":
      return t("viz.clearSelectedMarks");
    case "viz_switchTab":
      return t("viz.switchTab", { sheet: s("sheetName") });
    case "viz_setParameter":
      return t("viz.setParameter", { name: s("name") });
    default:
      return t("viz.applied");
  }
}

/**
 * Inline card for an agent viz action (DESIGN v2 §4.9). Its status comes from the
 * client executor result (not the server's optimistic tool_result): pending →
 * "Đang áp dụng…"; ok → the action description + an Undo button (when the action
 * is reversible); failed → the concrete reason. Undo calls the executor's undo().
 */
export function VizActionCard({
  name,
  input,
  status,
  error,
  undo,
  variant = "panel",
  locale = DEFAULT_LOCALE,
}: {
  name: string;
  input: Record<string, unknown>;
  status: "pending" | "ok" | "failed";
  error?: string | undefined;
  undo?: (() => Promise<void>) | undefined;
  variant?: "panel" | "page";
  locale?: Locale;
}) {
  const t = translator(locale);
  const dark = variant === "page";
  const [undone, setUndone] = useState(false);
  const [undoing, setUndoing] = useState(false);

  if (status === "failed") {
    const tone = dark ? "border-red-400 bg-red-400/10 text-red-300" : "border-red-400 bg-red-50 text-red-700";
    return (
      <div className={`flex items-start gap-1.5 rounded-lg border-l-2 px-3 py-2 text-caption ${tone}`}>
        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>{t("agent.actionFailed", { reason: error ?? "" })}</span>
      </div>
    );
  }

  const base = dark ? "text-white/85" : "text-sf-neutral-8";
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border-l-2 border-brand bg-brand/8 px-3 py-2 text-caption ${base}`}>
      {status === "pending" ? (
        <>
          <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-text" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{t("agent.applying")}</span>
        </>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 shrink-0 text-brand-text" strokeWidth={2.25} aria-hidden="true" />
          <span className="min-w-0 flex-1">{describe(name, input, t)}</span>
          {undone ? (
            <span className={dark ? "text-white/50" : "text-sf-neutral-5"}>{t("agent.undone")}</span>
          ) : undo ? (
            <button
              type="button"
              disabled={undoing}
              onClick={async () => {
                setUndoing(true);
                try {
                  await undo();
                  setUndone(true);
                } finally {
                  setUndoing(false);
                }
              }}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-text underline-offset-2 hover:underline disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              {t("agent.undo")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
