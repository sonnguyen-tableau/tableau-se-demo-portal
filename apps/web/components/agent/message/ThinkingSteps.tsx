"use client";

import { useState } from "react";
import { translator, type Locale } from "@/lib/i18n-shared";
import { stepLabel } from "@/lib/agent-step-labels";

interface ToolEvent {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
  preview?: string | undefined;
}

/**
 * One collapsible row summarizing the agent's tool activity for a message
 * (DESIGN v2 §4.9). Summary shows a spinner + "Đang phân tích · bước N" while
 * running, then a check + "Đã phân tích · N bước · T giây" when the turn ends
 * (elapsedMs is set). Expanded, it lists friendly step labels (§5.2); internal
 * users additionally see the raw tool name + preview. Replaces the pill wall.
 */
export function ThinkingSteps({
  toolEvents,
  elapsedMs,
  isInternal = false,
  locale = "vi",
  variant = "panel",
}: {
  toolEvents: ToolEvent[];
  elapsedMs?: number | undefined;
  isInternal?: boolean;
  locale?: Locale;
  variant?: "panel" | "page";
}) {
  const [open, setOpen] = useState(false);
  if (toolEvents.length === 0) return null;

  const t = translator(locale);
  const dark = variant === "page";
  const running = elapsedMs === undefined;
  const count = toolEvents.length;
  const seconds = elapsedMs !== undefined ? Math.max(1, Math.round(elapsedMs / 1000)) : 0;
  const summary = running
    ? t("agent.thinking", { n: count })
    : t("agent.thought", { n: count, s: seconds });

  const summaryColor = dark ? "text-white/55 hover:text-white/80" : "text-sf-neutral-6 hover:text-sf-neutral-9";
  const rowColor = dark ? "text-white/75" : "text-sf-neutral-7";
  const metaColor = dark ? "text-white/40" : "text-sf-neutral-5";
  const borderColor = dark ? "rgba(255,255,255,0.14)" : "var(--sf-neutral-3)";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="text-caption"
    >
      <summary className={`flex cursor-pointer list-none items-center gap-1.5 font-medium transition-colors ${summaryColor}`}>
        {running ? (
          <svg className="h-3 w-3 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span>{summary}</span>
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-base ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </summary>

      <ol className="mt-1.5 space-y-1 pl-3" style={{ borderLeft: `1px solid ${borderColor}` }}>
        {toolEvents.map((ev) => (
          <li key={ev.id} className={`flex items-start gap-1.5 ${rowColor}`}>
            <StepStatus status={ev.status} dark={dark} />
            <span className="min-w-0 flex-1">
              {stepLabel(ev.name, locale)}
              {isInternal && (
                <span className={`ml-1.5 font-mono text-[10px] ${metaColor}`}>
                  {ev.name}
                  {ev.preview ? ` · ${ev.preview.slice(0, 60)}` : ""}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function StepStatus({ status, dark }: { status: ToolEvent["status"]; dark: boolean }) {
  if (status === "running") {
    return (
      <svg className="mt-0.5 h-3 w-3 shrink-0 animate-spin opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (status === "error") {
    return <span className={`mt-px shrink-0 font-semibold ${dark ? "text-red-300" : "text-red-600"}`} aria-hidden="true">×</span>;
  }
  return (
    <svg
      className={`mt-0.5 h-3 w-3 shrink-0 ${dark ? "text-emerald-300" : "text-emerald-600"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
