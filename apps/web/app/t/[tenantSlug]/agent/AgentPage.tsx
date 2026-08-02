"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useChatAgent, type ChatMessage, type RichBlock } from "@/hooks/useChatAgent";
import { VegaChart } from "@/components/chart/VegaChart";
import type { AgentSuggestion } from "@/lib/agent-suggestions";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

export function AgentPage({
  tenantName,
  suggestions,
  locale = DEFAULT_LOCALE,
}: {
  tenantName: string;
  suggestions: AgentSuggestion[];
  locale?: Locale;
}) {
  const t = translator(locale);
  const { messages, busy, tools, send, clear } = useChatAgent();
  // Intro line bolds the tenant name inline; split the template on {tenant}
  // so the bold styling survives translation in either locale.
  const [introBefore, introAfter = ""] = t("agent.intro").split("{tenant}");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    void send(t);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 88%, #000 12%) 100%)",
      }}
    >
      {/* Ambient mesh */}
      <div className="pointer-events-none absolute inset-0 opacity-50 bg-mesh-brand mix-blend-screen" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" aria-hidden="true" />

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sf-blue-60 to-sf-blue-40 shadow-elev-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" stroke="white" strokeWidth="1.75" strokeLinejoin="round" />
            </svg>
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[var(--brand-neutral)]" aria-hidden="true" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-body-sm font-semibold text-white">{t("agent.title")}</span>
            <span className="text-meta text-white/55">{tenantName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tools !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-meta font-medium ${
                tools.length > 0
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-white/[0.10] bg-white/[0.04] text-white/55"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tools.length > 0 ? "bg-emerald-400" : "bg-white/30"}`} aria-hidden="true" />
              {tools.length > 0 ? t("agent.toolsBadge", { count: tools.length }) : t("agent.generalMode")}
            </span>
          )}
          {hasMessages && (
            <button
              onClick={clear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-meta font-medium text-white/70 transition-all duration-base ease-smooth hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("agent.newConversation")}
            </button>
          )}
        </div>
      </header>

      {/* ── Messages area ───────────────────────────────────────── */}
      <div className="relative flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex h-full flex-col items-center justify-center px-6 pb-24 pt-8">
            {/* Glowing orb */}
            <div className="relative mb-8">
              <div className="absolute inset-0 h-24 w-24 animate-pulse-ring rounded-full" />
              <div className="absolute inset-0 h-24 w-24 rounded-full bg-gradient-to-br from-sf-blue-60 to-sf-blue-40 opacity-60 blur-xl" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-sf-blue-60 to-sf-blue-40 shadow-[0_24px_60px_-12px_rgba(27,150,255,0.55)] ring-1 ring-white/15">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <h1 className="mb-3 text-display font-bold leading-none tracking-tight">
              <span className="bg-gradient-to-r from-white via-white to-sf-blue-40 bg-clip-text text-transparent">{t("agent.greeting")}</span>
            </h1>
            <p className="mb-10 max-w-lg text-center text-body-lg text-white/60">
              {introBefore}
              <span className="font-semibold text-white">{tenantName}</span>
              {introAfter}
            </p>

            {/* Suggestion cards */}
            <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s.title}
                  onClick={() => submit(s.title)}
                  className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left backdrop-blur-sm transition-all duration-base ease-smooth hover:-translate-y-px hover:border-sf-blue-40/40 hover:bg-white/[0.08]"
                >
                  <span className="text-body-lg leading-none">{s.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm font-semibold text-white">{s.title}</div>
                    <div className="mt-0.5 text-caption text-white/50">{s.subtitle}</div>
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-white/30 transition-all duration-base group-hover:translate-x-0.5 group-hover:text-sf-blue-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} locale={locale} />
            ))}
            {busy && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ────────────────────────────────────────────── */}
      <div className="relative border-t border-white/[0.06] px-4 py-4 backdrop-blur-sm">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-white/[0.10] bg-white/[0.06] px-4 py-3 shadow-elev-2 backdrop-blur-md transition-colors duration-base ease-smooth focus-within:border-sf-blue-40/50 focus-within:bg-white/[0.08]"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={onKeyDown}
            placeholder={busy ? t("agent.processing") : t("agent.inputPlaceholder")}
            disabled={busy}
            rows={1}
            className="flex-1 resize-none bg-transparent text-body text-white placeholder-white/40 outline-none disabled:opacity-50"
            style={{ maxHeight: "160px" }}
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sf-blue-60 to-sf-blue-40 text-white shadow-elev-1 transition-all duration-base ease-smooth hover:shadow-glow-brand active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </form>
        <p className="mt-2 text-center text-meta text-white/40">
          {t("agent.inputHint")}
        </p>
      </div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sf-blue-60 to-sf-blue-40 shadow-[0_4px_16px_-4px_rgba(27,150,255,0.5)] ring-1 ring-white/10">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" stroke="white" strokeWidth="1.75" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <AgentAvatar />
      <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/[0.06]">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" />
      </div>
    </div>
  );
}

function MessageBubble({ message, locale = DEFAULT_LOCALE }: { message: ChatMessage; locale?: Locale }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 px-4 py-3 text-body text-white shadow-elev-2">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 animate-slide-up">
      <AgentAvatar />

      <div className="flex-1 min-w-0 space-y-3">
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolEvents.map((t) => (
              <span
                key={t.id}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-meta font-medium ring-1 " +
                  (t.status === "running"
                    ? "bg-white/[0.04] text-white/55 ring-white/[0.08]"
                    : t.status === "ok"
                      ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30"
                      : "bg-red-400/10 text-red-300 ring-red-400/30")
                }
              >
                {t.status === "running" && (
                  <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {t.status === "ok" && (
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" stroke="currentColor" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {t.status === "error" && <span aria-hidden="true">×</span>}
                <span className="font-mono">{t.name}</span>
              </span>
            ))}
          </div>
        )}

        {message.richBlocks?.map((block, i) => (
          <RichBlockView key={i} block={block} locale={locale} />
        ))}

        {message.content && (
          <div className="text-body leading-relaxed text-white/85 whitespace-pre-wrap">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

const MAX_VISIBLE_ROWS = 50;

function RichBlockView({ block, locale = DEFAULT_LOCALE }: { block: RichBlock; locale?: Locale }) {
  const t = translator(locale);
  if (block.kind === "image") {
    return (
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/30 shadow-elev-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:${block.mimeType};base64,${block.data}`}
          alt="Tableau chart"
          className="w-full object-contain"
          style={{ maxHeight: "420px" }}
        />
      </div>
    );
  }

  if (block.kind === "vegaspec") {
    return <VegaChart spec={block.spec} title={block.title} dark={true} />;
  }

  const visibleRows = block.rows.slice(0, MAX_VISIBLE_ROWS);
  const truncated = block.rows.length > MAX_VISIBLE_ROWS;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      <table className="w-full text-caption">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {block.columns.map((col) => (
              <th key={col} className="px-3 py-2.5 text-left font-semibold text-white/75 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.04]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-white/70 whitespace-nowrap tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="border-t border-white/[0.06] px-3 py-2 text-meta text-white/45">
          {t("agent.rowsShown", { shown: MAX_VISIBLE_ROWS, total: block.rows.length })}
        </p>
      )}
    </div>
  );
}
