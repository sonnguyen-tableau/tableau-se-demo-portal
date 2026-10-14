"use client";

import { Sparkles, X } from "lucide-react";
import { useVizContext } from "@/components/bridge/VizContextProvider";
import { useChatPanel } from "@/components/layout/ChatPanelToggle";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

/**
 * Floating "Hỏi AI về N điểm đã chọn" pill, bottom-center of the viz frame
 * (DESIGN v2 §4.6). Appears only when marks are selected. Clicking it opens the
 * agent panel and dispatches an Ask-AI request (which ChatPanel sends, carrying
 * the current vizContext incl. selectedMarks). The × clears the selection on the
 * viz via the clearSelectedMarks executor. Renders inside VizContextProvider +
 * ChatPanelProvider (both wrap the report view).
 */
export function SelectionAskFab({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const { state, askAi, applyVizAction } = useVizContext();
  const { open, toggle } = useChatPanel();
  const t = translator(locale);
  const n = state.selectedMarks.length;
  if (n === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center motion-safe:animate-slide-up">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-brand py-1.5 pl-3.5 pr-1.5 text-brand-on shadow-elev-3">
        <button
          type="button"
          onClick={() => {
            if (!open) toggle();
            askAi({ prompt: t("agent.askSelectionPrompt", { n }), source: "context-menu" });
          }}
          className="flex items-center gap-1.5 text-body-sm font-semibold"
        >
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {t("view.askSelection", { n })}
        </button>
        <button
          type="button"
          onClick={() => void applyVizAction({ kind: "clearSelectedMarks" })}
          aria-label={t("view.clearSelection")}
          className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
