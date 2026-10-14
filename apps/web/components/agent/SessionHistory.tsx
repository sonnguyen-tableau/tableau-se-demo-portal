"use client";

import { useEffect, useState } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

interface SessionMeta {
  sessionId: string;
  title: string;
  updatedAt: number;
}

/**
 * Chat history column for the full agent page (AG-11). Lists the user's recent
 * sessions from /api/chat/sessions; clicking one restores it (onPick →
 * useChatAgent.loadSession), and "new chat" clears. Refetches when `refreshKey`
 * changes (the page bumps it when a turn completes). Dark-themed to match.
 */
export function SessionHistory({
  locale = DEFAULT_LOCALE,
  refreshKey = 0,
  onPick,
  onNew,
}: {
  locale?: Locale;
  refreshKey?: number;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const t = translator(locale);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/chat/sessions", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => {
        if (alive) setSessions(Array.isArray(d.sessions) ? d.sessions : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/[0.06] bg-black/10 backdrop-blur-sm">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-body-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.10]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {t("agent.new")}
        </button>
      </div>
      <p className="px-4 pb-1 pt-1 text-meta font-semibold uppercase tracking-[0.14em] text-white/40">{t("agent.history")}</p>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <p className="px-2 py-2 text-caption text-white/40">{t("agent.noHistory")}</p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => onPick(s.sessionId)}
              title={s.title}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-caption text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-white/40" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{s.title || "…"}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
