"use client";

import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Plus, Maximize2, Square, ArrowUp, ArrowDown } from "lucide-react";
import { useChatAgent, type AgentStatus, type ChatMessage } from "@/hooks/useChatAgent";
import { useAskAiSubscription } from "@/components/bridge/VizContextProvider";
import { Markdown } from "@/components/agent/Markdown";
import { ThinkingSteps } from "@/components/agent/message/ThinkingSteps";
import { RichBlock } from "@/components/agent/message/RichBlock";
import { MessageActions } from "@/components/agent/message/MessageActions";
import { SourcesFooter } from "@/components/agent/message/SourcesFooter";
import { SuggestionList } from "@/components/agent/SuggestionList";
import { FollowupChips } from "@/components/agent/FollowupChips";
import { ContextBar } from "@/components/agent/ContextBar";
import type { AgentSuggestion } from "@/lib/agent-suggestions";
import { translator, DEFAULT_LOCALE, type Locale, type MessageKey } from "@/lib/i18n-shared";

const STATUS_KEY: Record<AgentStatus, MessageKey> = {
  connecting: "agent.status.connecting",
  ready: "agent.status.ready",
  limited: "agent.status.limited",
  working: "agent.status.working",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  connecting: "bg-sf-neutral-4 motion-safe:animate-pulse",
  ready: "bg-emerald-500",
  limited: "bg-amber-500",
  working: "bg-brand motion-safe:animate-pulse",
};

function elapsedMs(m: ChatMessage): number | undefined {
  return m.toolStartedAt !== undefined && m.toolEndedAt !== undefined
    ? m.toolEndedAt - m.toolStartedAt
    : undefined;
}

/**
 * Docked report-view chat panel — a thin skin over the single useChatAgent
 * engine (AG-01). No SSE parsing here: it renders the shared message pieces
 * (ThinkingSteps, RichBlock, Markdown) and a never-disabled composer with a
 * Stop button. Must live inside VizContextProvider (the hook dispatches viz
 * actions when a viz is present).
 */
export function ChatPanel({
  suggestions,
  locale = DEFAULT_LOCALE,
  isInternal = false,
  tenantSlug,
}: {
  suggestions?: AgentSuggestion[];
  locale?: Locale;
  isInternal?: boolean;
  tenantSlug?: string;
}): ReactElement {
  const t = translator(locale);
  const { messages, busy, status, send, stop, retry, feedback, clear, pulseConfig, excludeNextMarks } = useChatAgent();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  useAskAiSubscription(useCallback((req) => send(req.prompt), [send]));

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  // Auto-scroll only when the user is already near the bottom (DESIGN §4.8).
  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [messages, atBottom, scrollToBottom]);

  const submit = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      send(text);
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    },
    [send],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-sf-neutral-3 bg-white shadow-elev-1">
      {/* Header */}
      <header className="flex items-center gap-2.5 border-b border-sf-neutral-3 bg-gradient-to-b from-sf-neutral-2/60 to-white px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-on shadow-elev-1">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-body-sm font-semibold leading-tight text-sf-neutral-9">AI Analytics</h3>
          <p className="flex items-center gap-1.5 truncate text-meta text-sf-neutral-6">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
            {t(STATUS_KEY[status])}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          aria-label={t("agent.new")}
          title={t("agent.new")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sf-neutral-5 transition-colors hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        {tenantSlug && (
          <a
            href={`/t/${tenantSlug}/agent`}
            aria-label={t("agent.expand")}
            title={t("agent.expand")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sf-neutral-5 transition-colors hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </a>
        )}
      </header>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          aria-live="polite"
          aria-busy={busy}
          className="h-full space-y-3 overflow-y-auto px-4 py-4 text-body-sm"
        >
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-body-sm text-sf-neutral-6">{t("chat.askAboutDashboard")}</p>
              <SuggestionList suggestions={suggestions ?? []} variant="panel" onPick={submit} />
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end animate-slide-up">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-body-sm text-brand-on shadow-elev-1">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="group/msg space-y-2 animate-slide-up">
                  <ThinkingSteps
                    toolEvents={m.toolEvents ?? []}
                    elapsedMs={elapsedMs(m)}
                    isInternal={isInternal}
                    locale={locale}
                    variant="panel"
                  />
                  {m.richBlocks?.map((b, j) => (
                    <RichBlock key={j} block={b} variant="panel" locale={locale} pulseConfig={pulseConfig} />
                  ))}
                  {m.content ? <Markdown variant="panel">{m.content}</Markdown> : null}
                  {m.sources && <SourcesFooter sources={m.sources} isInternal={isInternal} locale={locale} variant="panel" />}
                  {m.stopped ? <p className="text-caption text-sf-neutral-5">{t("agent.stopped")}</p> : null}
                  {m.content ? (
                    <div className="opacity-0 transition-opacity duration-base group-hover/msg:opacity-100 focus-within:opacity-100">
                      <MessageActions
                        content={m.content}
                        onRetry={() => retry(i)}
                        onFeedback={(rating, comment) => feedback(i, rating, comment)}
                        locale={locale}
                        variant="panel"
                      />
                    </div>
                  ) : null}
                  {i === messages.length - 1 && m.followups?.length ? (
                    <FollowupChips items={m.followups} onPick={submit} label={t("agent.followups")} variant="panel" />
                  ) : null}
                </div>
              ),
            )
          )}
        </div>
        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              scrollToBottom();
              setAtBottom(true);
            }}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-sf-neutral-10 px-3 py-1 text-caption font-medium text-white shadow-elev-3"
          >
            <ArrowDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            {t("agent.newMessages")}
          </button>
        )}
      </div>

      {/* Context bar — what the agent can see (AG-06) */}
      <ContextBar locale={locale} onExcludeMarks={excludeNextMarks} />

      {/* Composer — never disabled; Stop while busy */}
      <form onSubmit={onSubmit} className="border-t border-sf-neutral-3 bg-white p-3">
        <div className="flex items-end gap-2 rounded-xl border border-sf-neutral-3 bg-sf-neutral-2/60 px-2.5 py-1.5 transition-colors duration-base ease-smooth focus-within:border-brand/50 focus-within:bg-white focus-within:shadow-elev-1">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder={t("agent.placeholderView")}
            rows={1}
            className="flex-1 resize-none bg-transparent px-1.5 py-1.5 text-body-sm text-sf-neutral-9 outline-none placeholder:text-sf-neutral-5"
            style={{ maxHeight: "140px" }}
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label={t("agent.stop")}
              title={t("agent.stop")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-on shadow-elev-1 transition-transform active:scale-95"
            >
              <Square className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              aria-label={t("chat.send")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-on shadow-elev-1 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-meta text-sf-neutral-5">{t("agent.composerHint")}</p>
      </form>
    </div>
  );
}
