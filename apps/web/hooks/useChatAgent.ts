"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RawEvent } from "@/lib/agent-events";
import type { RichBlock, PulseEmbedConfig } from "@/components/agent/message/types";
import { useOptionalVizContext, type VizAction } from "@/components/bridge/VizContextProvider";

// Re-export so message components can import the shared types from one place.
export type { RichBlock } from "@/components/agent/message/types";

/** Header status shown by both chat surfaces (DESIGN v2 §4.8). */
export type AgentStatus = "connecting" | "ready" | "limited" | "working";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolEvents?: Array<{ id: string; name: string; status: "running" | "ok" | "error"; preview?: string }>;
  richBlocks?: RichBlock[];
  /** ms epoch of the first tool call this turn (ThinkingSteps elapsed timer). */
  toolStartedAt?: number;
  /** ms epoch when the turn's tool activity ended (done / error / abort). */
  toolEndedAt?: number;
  /** the user aborted this turn via stop(); the partial answer is kept. */
  stopped?: boolean;
  /** follow-up question suggestions (AG-09); rendered as chips under the latest reply. */
  followups?: string[];
  /** data provenance for this answer (AG-08); rendered as a sources footer. */
  sources?: {
    datasources: string[];
    queryCount: number;
    syntheticData?: boolean;
    queries?: string[];
  };
}

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Map a viz_* tool name + input to a bridge VizAction. */
function toVizAction(name: string, input: Record<string, unknown>): VizAction {
  switch (name) {
    case "viz_applyFilter":
      return {
        kind: "applyFilter",
        field: String(input.field ?? ""),
        values: Array.isArray(input.values) ? (input.values as string[]).map(String) : [],
        ...(typeof input.updateType === "string"
          ? { updateType: input.updateType as "REPLACE" | "ADD" | "REMOVE" }
          : {}),
      };
    case "viz_clearFilter":
      return { kind: "clearFilter", field: String(input.field ?? "") };
    case "viz_selectMarks":
      return {
        kind: "selectMarks",
        field: String(input.field ?? ""),
        values: Array.isArray(input.values) ? (input.values as string[]).map(String) : [],
      };
    case "viz_clearSelectedMarks":
      return { kind: "clearSelectedMarks" };
    case "viz_switchTab":
      return { kind: "switchTab", sheetName: String(input.sheetName ?? "") };
    case "viz_setParameter":
      return { kind: "setParameter", name: String(input.name ?? ""), value: String(input.value ?? "") };
    default:
      return { kind: "clearSelectedMarks" };
  }
}

function mutateLastAssistant(messages: ChatMessage[], fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]?.role === "assistant") {
      next[i] = fn(next[i]!);
      return next;
    }
  }
  next.push(fn({ role: "assistant", content: "" }));
  return next;
}

function appendToAssistant(messages: ChatMessage[], delta: string): ChatMessage[] {
  return mutateLastAssistant(messages, (m) => ({ ...m, content: m.content + delta }));
}

function pushBlock(messages: ChatMessage[], block: RichBlock): ChatMessage[] {
  return mutateLastAssistant(messages, (m) => ({ ...m, richBlocks: [...(m.richBlocks ?? []), block] }));
}

/** Patch the pending vizAction block with id `id` (status/undo/error) from the executor result. */
function patchVizAction(
  messages: ChatMessage[],
  id: string,
  patch: Partial<Extract<RichBlock, { kind: "vizAction" }>>,
): ChatMessage[] {
  // Locate the block by id across ALL messages — a slow action may resolve after
  // a later turn's assistant message is already the last one.
  return messages.map((m) => {
    if (m.role !== "assistant" || !m.richBlocks) return m;
    let changed = false;
    const richBlocks = m.richBlocks.map((b) => {
      if (b.kind === "vizAction" && b.id === id) {
        changed = true;
        return { ...b, ...patch };
      }
      return b;
    });
    return changed ? { ...m, richBlocks } : m;
  });
}

/**
 * The single chat engine (AG-01) — owns SSE parsing, the shared applyEvent
 * (every server event → content / toolEvents / shared RichBlocks incl. pulse +
 * export), abort via stop(), retry(), queued-send-while-busy, clear(), status,
 * lazy Pulse config, and viz-action dispatch when a viz is present. Both the
 * docked ChatPanel and the full Agent page are thin skins over this hook.
 */
export function applyEvent(messages: ChatMessage[], event: RawEvent): ChatMessage[] {
  switch (event.type) {
    case "text_delta":
      return appendToAssistant(messages, event.delta);
    case "system":
    case "error":
      return appendToAssistant(messages, `\n[${event.type}] ${event.message}`);
    case "tool_use":
      return mutateLastAssistant(messages, (m) => ({
        ...m,
        toolStartedAt: m.toolStartedAt ?? Date.now(),
        toolEvents: [...(m.toolEvents ?? []), { id: event.id, name: event.name, status: "running" }],
      }));
    case "viz_action":
      // A viz action gets its own VizActionCard (status filled from the executor),
      // not a ThinkingSteps pill.
      return mutateLastAssistant(messages, (m) => ({
        ...m,
        toolStartedAt: m.toolStartedAt ?? Date.now(),
        richBlocks: [
          ...(m.richBlocks ?? []),
          { kind: "vizAction", id: event.id, name: event.name, input: event.input, status: "pending" },
        ],
      }));
    case "tool_result":
      return mutateLastAssistant(messages, (m) => ({
        ...m,
        toolEvents: (m.toolEvents ?? []).map((t) =>
          t.id === event.id ? { ...t, status: event.ok ? "ok" : "error", preview: event.preview } : t,
        ),
      }));
    case "tool_image":
      return pushBlock(messages, { kind: "image", mimeType: event.mimeType, data: event.data });
    case "tool_table":
      return pushBlock(messages, { kind: "table", columns: event.columns, rows: event.rows });
    case "tool_vegaspec":
      return pushBlock(
        messages,
        event.title !== undefined
          ? { kind: "chart", spec: event.spec, title: event.title }
          : { kind: "chart", spec: event.spec },
      );
    case "pulse_card":
      return pushBlock(messages, { kind: "pulse", metricId: event.metricId, name: event.name });
    case "followups":
      return mutateLastAssistant(messages, (m) => ({ ...m, followups: event.items }));
    case "sources":
      return mutateLastAssistant(messages, (m) => ({
        ...m,
        sources: {
          datasources: event.datasources,
          queryCount: event.queryCount,
          ...(event.syntheticData ? { syntheticData: true } : {}),
          ...(event.queries ? { queries: event.queries } : {}),
        },
      }));
    case "campaign_csv":
    case "card_activation":
    case "prospect_export":
    case "carrier_report":
      return pushBlock(messages, { kind: "export", event });
    case "open":
    case "done":
      return messages;
  }
  return messages;
}

export function useChatAgent() {
  const viz = useOptionalVizContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [tools, setTools] = useState<string[] | null>(null);
  const [pulseConfig, setPulseConfig] = useState<PulseEmbedConfig | null>(null);
  const pulseConfigRef = useRef<Promise<PulseEmbedConfig | null> | null>(null);
  const sessionIdRef = useRef<string>(newSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<string[]>([]);
  // Bumped by clear() so a turn aborted by "New chat" can't resurrect a ghost
  // message into the freshly-emptied conversation (the abort rejects async).
  const turnIdRef = useRef(0);
  // Executor results for agent viz actions, sent to the model on the NEXT turn
  // (AG-05 phase A) so it learns whether its dashboard changes actually applied.
  const vizResultsRef = useRef<Array<{ toolUseId: string; name: string; ok: boolean; error?: string }>>([]);
  // ContextBar × excludes the current selectedMarks from the NEXT request only (AG-06).
  const excludeMarksRef = useRef(false);

  const setMessagesAndRef = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Fetch the Pulse JWT lazily on the first pulse_card; cached in a ref so
  // concurrent events share one request. One JWT per page (Tableau gotcha).
  const ensurePulseConfig = useCallback((): Promise<PulseEmbedConfig | null> => {
    if (pulseConfigRef.current) return pulseConfigRef.current;
    pulseConfigRef.current = (async () => {
      try {
        const res = await fetch("/api/tableau/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: ["tableau:insights:embed"] }),
          credentials: "include",
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { token?: string; siteUrl?: string; siteName?: string };
        if (!json.token || !json.siteUrl || !json.siteName) return null;
        const cfg: PulseEmbedConfig = { token: json.token, siteUrl: json.siteUrl, siteName: json.siteName };
        setPulseConfig(cfg);
        return cfg;
      } catch {
        return null;
      }
    })();
    return pulseConfigRef.current;
  }, []);

  const runTurn = useCallback(
    async (text: string) => {
      turnIdRef.current += 1;
      const myTurn = turnIdRef.current;
      // sessionId changes only on clear() — used to gate async viz-action results
      // so a *later* turn still records/patches, but a *cleared* convo drops them.
      const mySession = sessionIdRef.current;
      busyRef.current = true;
      setBusy(true);

      const history = messagesRef.current
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.trim().length > 0))
        .map((m) => ({ role: m.role, content: m.content }));

      setMessagesAndRef((prev) => [
        ...prev,
        { role: "user" as const, content: text },
        { role: "assistant" as const, content: "" },
      ]);

      const snap = viz?.snapshot();
      // Next-request-only: if the user hit × on the marks chip, omit them once.
      const excludeMarks = excludeMarksRef.current;
      excludeMarksRef.current = false;
      const vizContext =
        snap?.ready
          ? {
              workbook: snap.workbook,
              activeSheet: snap.activeSheet,
              filters: snap.filters,
              selectedMarks: excludeMarks ? [] : snap.selectedMarks,
              ...(snap.datasources.length > 0 ? { datasources: snap.datasources } : {}),
            }
          : undefined;

      // Executor results from prior turns' viz actions — the model learns the
      // real outcome of its dashboard changes on this turn (AG-05 phase A).
      // Hold them until the request is actually ACCEPTED so a failed request
      // doesn't silently drop them; restore on failure to resend next turn (FX-13).
      const sentVizResults = vizResultsRef.current;
      vizResultsRef.current = [];
      const restoreVizResults = () => {
        vizResultsRef.current = [...sentVizResults, ...vizResultsRef.current];
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            vizContext,
            history,
            chatSessionId: sessionIdRef.current,
            ...(sentVizResults.length > 0 ? { vizActionResults: sentVizResults } : {}),
          }),
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          restoreVizResults();
          setMessagesAndRef((m) => appendToAssistant(m, `\n[error] HTTP ${res.status}`));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            if (!chunk.startsWith("data:")) continue;
            const json = chunk.slice(5).trim();
            if (!json) continue;
            let event: RawEvent;
            try {
              event = JSON.parse(json) as RawEvent;
            } catch {
              continue;
            }
            setMessagesAndRef((m) => applyEvent(m, event));
            if (event.type === "open") {
              setTools(event.tools);
            } else if (event.type === "viz_action") {
              const evId = event.id;
              const evName = event.name;
              const vizAction = toVizAction(evName, event.input);
              if (viz) {
                void viz.applyVizAction(vizAction).then((res) => {
                  // Drop entirely if the conversation was cleared ("New chat").
                  // A later turn in the SAME conversation still records + patches.
                  if (sessionIdRef.current !== mySession) return;
                  vizResultsRef.current.push({
                    toolUseId: evId,
                    name: evName,
                    ok: res.ok,
                    ...(res.error ? { error: res.error } : {}),
                  });
                  setMessagesAndRef((m) =>
                    patchVizAction(
                      m,
                      evId,
                      res.ok
                        ? { status: "ok", ...(res.undo ? { undo: res.undo } : {}) }
                        : { status: "failed", ...(res.error ? { error: res.error } : {}) },
                    ),
                  );
                });
              } else {
                vizResultsRef.current.push({ toolUseId: evId, name: evName, ok: false, error: "no viz on this page" });
                setMessagesAndRef((m) => patchVizAction(m, evId, { status: "failed", error: "no viz on this page" }));
              }
            } else if (event.type === "pulse_card") {
              void ensurePulseConfig();
            }
          }
        }
      } catch (e) {
        // Superseded by clear() ("New chat") — do not write into the fresh convo.
        if (turnIdRef.current !== myTurn) return;
        if (controller.signal.aborted) {
          setMessagesAndRef((m) => mutateLastAssistant(m, (msg) => ({ ...msg, stopped: true })));
        } else {
          // A genuine request failure — resend the prior viz results next turn.
          restoreVizResults();
          const msg = e instanceof Error ? e.message : "stream error";
          setMessagesAndRef((m) => appendToAssistant(m, `\n[error] ${msg}`));
        }
      } finally {
        // Skip all post-turn writes if clear() superseded this turn (it already
        // reset busy + emptied the conversation).
        if (turnIdRef.current === myTurn) {
          abortRef.current = null;
          setMessagesAndRef((m) =>
            mutateLastAssistant(m, (msg) =>
              msg.toolEvents?.length && msg.toolEndedAt === undefined ? { ...msg, toolEndedAt: Date.now() } : msg,
            ),
          );
          busyRef.current = false;
          setBusy(false);
          // Persist the rendered session for history + restore (AG-11).
          // JSON.stringify drops the vizAction undo closures; the server caps
          // oversized bodies. Fire-and-forget.
          const persisted = messagesRef.current;
          if (persisted.length > 0) {
            const firstUser = persisted.find((m) => m.role === "user");
            void fetch("/api/chat/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                sessionId: sessionIdRef.current,
                title: firstUser?.content.slice(0, 120) ?? "",
                messages: persisted,
              }),
            }).catch(() => {});
          }
          const next = queueRef.current.shift();
          if (next !== undefined) void runTurn(next);
        }
      }
    },
    [viz, ensurePulseConfig, setMessagesAndRef],
  );

  // Never blocks the composer: while busy, the turn is queued and runs next.
  const send = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (busyRef.current) {
        queueRef.current.push(text);
        return;
      }
      void runTurn(text);
    },
    [runTurn],
  );

  const stop = useCallback(() => {
    queueRef.current = []; // Stop halts the current turn AND any queued turns
    abortRef.current?.abort();
  }, []);

  // Exclude the current selected marks from the next request only (ContextBar ×).
  const excludeNextMarks = useCallback(() => {
    excludeMarksRef.current = true;
  }, []);

  // Retry the turn whose assistant reply is at `index`: drop the failed turn
  // (its user message + everything after) and resend, so retry REPLACES it
  // rather than appending a duplicate user message (FX-13).
  const retry = useCallback(
    (index: number) => {
      if (busyRef.current) return; // don't retry mid-stream
      const msgs = messagesRef.current;
      let userIdx = -1;
      for (let i = Math.min(index, msgs.length - 1); i >= 0; i--) {
        if (msgs[i]?.role === "user") {
          userIdx = i;
          break;
        }
      }
      if (userIdx < 0) return;
      const text = msgs[userIdx]!.content;
      const truncated = msgs.slice(0, userIdx);
      messagesRef.current = truncated; // sync so runTurn's history read is correct
      setMessages(truncated);
      send(text);
    },
    [send],
  );

  // Record 👍/👎 (+ optional comment) on an assistant message. Best-effort.
  const feedback = useCallback(async (messageIndex: number, rating: "up" | "down", comment?: string) => {
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chatSessionId: sessionIdRef.current,
          messageIndex,
          rating,
          ...(comment ? { comment } : {}),
        }),
      });
    } catch {
      // feedback is non-blocking
    }
  }, []);

  const clear = useCallback(() => {
    turnIdRef.current += 1; // invalidate any in-flight turn's post-abort writes
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    vizResultsRef.current = [];
    busyRef.current = false;
    setBusy(false);
    messagesRef.current = [];
    setMessages([]);
    setTools(null);
    setPulseConfig(null);
    pulseConfigRef.current = null;
    sessionIdRef.current = newSessionId();
  }, []);

  // Restore a past session's rendered messages (with rich blocks) and continue
  // it (AG-11). Invalidates any in-flight turn first, like clear().
  const loadSession = useCallback(async (sessionId: string) => {
    turnIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    vizResultsRef.current = []; // don't carry the prior conversation's viz results (review m4)
    busyRef.current = false;
    setBusy(false);
    // Point writes at the loaded session up-front so a race with a stray send()
    // can't persist into the old session id (review m4).
    sessionIdRef.current = sessionId;
    try {
      const res = await fetch(`/api/chat/sessions?id=${encodeURIComponent(sessionId)}`, { credentials: "include" });
      const data = (res.ok ? await res.json() : { messages: [] }) as { messages?: unknown };
      // Keep only well-formed messages (the store returns opaque JSON) so a
      // corrupt/old-format entry can't crash the history filter later (review m4).
      const msgs = (Array.isArray(data.messages) ? data.messages : []).filter(
        (m): m is ChatMessage =>
          typeof m === "object" && m !== null && typeof (m as ChatMessage).content === "string",
      );
      messagesRef.current = msgs;
      setMessages(msgs);
      // If the restored conversation has Pulse cards, fetch the Pulse JWT now so
      // they actually render instead of staying blank (FX-13 / AG-11).
      const hasPulse = msgs.some((m) => m.richBlocks?.some((b) => b.kind === "pulse"));
      if (hasPulse) void ensurePulseConfig();
    } catch {
      // leave the current conversation untouched on failure
    }
  }, [ensurePulseConfig]);

  // Abort any in-flight stream when the chat engine unmounts (view navigation /
  // breakpoint mode switch) so the fetch + reader don't leak (FX-03).
  useEffect(() => () => abortRef.current?.abort(), []);

  const status: AgentStatus = busy
    ? "working"
    : tools === null
      ? "connecting"
      : tools.length === 0
        ? "limited"
        : "ready";

  return { messages, busy, status, tools, pulseConfig, send, stop, retry, feedback, clear, excludeNextMarks, loadSession };
}
