"use client";

import { SUGGESTION_ICONS, type AgentSuggestion } from "@/lib/agent-suggestions";

/**
 * Starter-prompt list shared by both chat surfaces (AG-10). Panel = 3 stacked
 * rows (title only); page = 2×2 cards (icon + title + subtitle). The first
 * entries are view-aware prompts when the caller passed a viewName to
 * getAgentSuggestions.
 */
export function SuggestionList({
  suggestions,
  variant,
  onPick,
}: {
  suggestions: AgentSuggestion[];
  variant: "panel" | "page";
  onPick: (prompt: string) => void;
}) {
  if (suggestions.length === 0) return null;

  if (variant === "panel") {
    return (
      <div className="space-y-1.5">
        {suggestions.slice(0, 3).map((s) => {
          const Icon = SUGGESTION_ICONS[s.icon];
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.title)}
              className="group flex w-full items-center gap-2 rounded-lg border border-sf-neutral-3 bg-white px-3 py-2 text-left text-caption text-sf-neutral-7 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:bg-brand/5 hover:text-sf-neutral-9 hover:shadow-elev-1"
            >
              <Icon className="h-4 w-4 shrink-0 text-sf-neutral-5 group-hover:text-brand" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
      {suggestions.slice(0, 4).map((s) => {
        const Icon = SUGGESTION_ICONS[s.icon];
        return (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.title)}
            className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left backdrop-blur-sm transition-all duration-base ease-smooth hover:-translate-y-px hover:border-sf-blue-40/40 hover:bg-white/[0.08]"
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-white/70" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-semibold text-white">{s.title}</div>
              <div className="mt-0.5 text-caption text-white/50">{s.subtitle}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
