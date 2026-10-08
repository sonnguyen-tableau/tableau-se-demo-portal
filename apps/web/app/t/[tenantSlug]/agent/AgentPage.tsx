"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useChatAgent, type ChatMessage } from "@/hooks/useChatAgent";
import { Markdown } from "@/components/agent/Markdown";
import { RichBlock } from "@/components/agent/message/RichBlock";
import type { PulseEmbedConfig } from "@/components/agent/message/types";
import { ThinkingSteps } from "@/components/agent/message/ThinkingSteps";
import { MessageActions } from "@/components/agent/message/MessageActions";
import { SourcesFooter } from "@/components/agent/message/SourcesFooter";
import { FollowupChips } from "@/components/agent/FollowupChips";
import { SuggestionList } from "@/components/agent/SuggestionList";
import { SessionHistory } from "@/components/agent/SessionHistory";
import type { AgentSuggestion } from "@/lib/agent-suggestions";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";
import { Square } from "lucide-react";

export function AgentPage({
  tenantName,
  suggestions,
  locale = DEFAULT_LOCALE,
  isInternal = false,
  initialQuery,
}: {
  tenantName: string;
  suggestions: AgentSuggestion[];
  locale?: Locale;
  isInternal?: boolean;
  /** When arriving from the home "Hỏi nhanh" box (?q=…), auto-send it once (HL-02). */
  initialQuery?: string;
}) {
  const { messages, busy, tools, send, stop, retry, feedback, clear, pulseConfig, loadSession } = useChatAgent();
  const t = translator(locale);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSentQRef = useRef<string | null>(null);
  const hasMessages = messages.length > 0;

  // Bump when a turn finishes so SessionHistory refetches the (newly persisted) list.
  const [historyKey, setHistoryKey] = useState(0);
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    if (prevBusyRef.current && !busy) setHistoryKey((k) => k + 1);
    prevBusyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-send the ?q= from the home quick-ask or the command palette, then drop
  // it from the URL so a refresh doesn't resend. Guarded by the LAST SENT query
  // (not a one-shot boolean) so asking a *different* question again — e.g. twice
  // from the palette while already on /agent — sends both (FX-10). StrictMode's
  // double-mount is covered too (same q → no resend).
  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q || q === lastSentQRef.current) return;
    lastSentQRef.current = q;
    send(q);
    window.history.replaceState(null, "", window.location.pathname);
  }, [initialQuery, send]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return; // never blocked while busy — the hook queues the turn
    setDraft("");
    send(trimmed);
    if (inputRef.current) inputRef.current.style.height = "auto";
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
    <div className="flex h-full">
      {/* Chat history column (AG-11) — docked at ≥ xl */}
      <div className="hidden shrink-0 text-white xl:flex" style={{ background: "var(--brand-neutral)" }}>
        <SessionHistory
          locale={locale}
          refreshKey={historyKey}
          onPick={(id) => void loadSession(id)}
          onNew={clear}
        />
      </div>

    <div
      className="relative flex h-full flex-1 flex-col overflow-hidden text-white"
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
            <span className="text-body-sm font-semibold text-white">{t("agent.analyticsAgent")}</span>
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
              {tools.length > 0 ? t("agent.toolsBadge", { n: tools.length }) : t("agent.generalMode")}
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
              {t("agent.new")}
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
              <span className="bg-gradient-to-r from-white via-white to-sf-blue-40 bg-clip-text text-transparent">{t("agent.welcome")}</span>
            </h1>
            <p className="mb-10 max-w-lg text-center text-body-lg text-white/60">
              {t("agent.welcomeBody", { tenant: tenantName })}
            </p>

            {/* Suggestion cards */}
            <SuggestionList suggestions={suggestions} variant="page" onPick={submit} />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                locale={locale}
                isInternal={isInternal}
                pulseConfig={pulseConfig}
                isLast={i === messages.length - 1}
                onPick={submit}
                onRetry={() => retry(i)}
                onFeedback={(rating, comment) => feedback(i, rating, comment)}
              />
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
            placeholder={t("agent.placeholderPage")}
            rows={1}
            className="flex-1 resize-none bg-transparent text-body text-white placeholder-white/40 outline-none"
            style={{ maxHeight: "160px" }}
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label={t("agent.stop")}
              title={t("agent.stop")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-on shadow-elev-1 transition-transform active:scale-95"
            >
              <Square className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              aria-label={t("chat.send")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-on shadow-elev-1 transition-all duration-base ease-smooth active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          )}
        </form>
        <p className="mt-2 text-center text-meta text-white/40">{t("agent.composerHint")}</p>
      </div>
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

function MessageBubble({
  message,
  locale = DEFAULT_LOCALE,
  isInternal = false,
  pulseConfig = null,
  isLast = false,
  onPick,
  onRetry,
  onFeedback,
}: {
  message: ChatMessage;
  locale?: Locale;
  isInternal?: boolean;
  pulseConfig?: PulseEmbedConfig | null;
  isLast?: boolean;
  onPick: (q: string) => void;
  onRetry: () => void;
  onFeedback: (rating: "up" | "down", comment?: string) => void;
}) {
  const t = translator(locale);
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
    <div className="group/msg flex items-start gap-3 animate-slide-up">
      <AgentAvatar />

      <div className="flex-1 min-w-0 space-y-3">
        <ThinkingSteps
          toolEvents={message.toolEvents ?? []}
          elapsedMs={
            message.toolStartedAt !== undefined && message.toolEndedAt !== undefined
              ? message.toolEndedAt - message.toolStartedAt
              : undefined
          }
          isInternal={isInternal}
          locale={locale}
          variant="page"
        />

        {message.richBlocks?.map((block, i) => (
          <RichBlock key={i} block={block} variant="page" locale={locale} pulseConfig={pulseConfig} />
        ))}

        {message.content && <Markdown variant="page">{message.content}</Markdown>}
        {message.sources && <SourcesFooter sources={message.sources} isInternal={isInternal} locale={locale} variant="page" />}
        {message.stopped && <p className="text-caption text-white/50">{t("agent.stopped")}</p>}
        {message.content ? (
          <div className="opacity-0 transition-opacity duration-base group-hover/msg:opacity-100 focus-within:opacity-100">
            <MessageActions
              content={message.content}
              onRetry={onRetry}
              onFeedback={onFeedback}
              locale={locale}
              variant="page"
            />
          </div>
        ) : null}
        {isLast && message.followups?.length ? (
          <FollowupChips items={message.followups} onPick={onPick} label={t("agent.followups")} variant="page" />
        ) : null}
      </div>
    </div>
  );
}
