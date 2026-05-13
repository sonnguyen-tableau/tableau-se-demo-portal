"use client";

import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import {
  useAskAiSubscription,
  useVizContext,
  type VizAction,
} from "@/components/bridge/VizContextProvider";

type RawEvent =
  | { type: "open"; tools: string[] }
  | { type: "system"; message: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "viz_action"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input_tokens?: number; output_tokens?: number } };

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  toolEvents?: Array<{ id: string; name: string; status: "running" | "ok" | "error"; preview?: string }>;
}

export function ChatPanel(): ReactElement {
  const { snapshot, applyVizAction } = useVizContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[] | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);

    try {
      const ctx = snapshot();
      const vizContext = ctx.ready
        ? {
            workbook: ctx.workbook,
            activeSheet: ctx.activeSheet,
            filters: ctx.filters,
            selectedMarks: ctx.selectedMarks,
          }
        : undefined;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, vizContext }),
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        setMessages((m) =>
          appendToAssistant(m, `[error] HTTP ${res.status}`),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const chunk of events) {
          if (!chunk.startsWith("data:")) continue;
          const json = chunk.slice(5).trim();
          if (!json) continue;
          let event: RawEvent;
          try {
            event = JSON.parse(json) as RawEvent;
          } catch {
            continue;
          }
          setMessages((m) => applyEvent(m, event));
          if (event.type === "open") setTools(event.tools);
          if (event.type === "viz_action") {
            void applyVizAction(toVizAction(event.name, event.input));
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "stream error";
      setMessages((m) => appendToAssistant(m, `[error] ${msg}`));
    } finally {
      setBusy(false);
    }
  }, [snapshot, applyVizAction]);

  // Receive "Ask AI" prompts dispatched by the viz custom context menu.
  useAskAiSubscription(
    useCallback(
      (req) => {
        setDraft("");
        void send(req.prompt);
      },
      [send],
    ),
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-[hsl(var(--border))]">
      <header className="border-b border-[hsl(var(--border))] px-4 py-3">
        <h3 className="text-sm font-semibold">Analytics chat</h3>
        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {tools === null
            ? "Connecting to the agent…"
            : tools.length === 0
              ? "General mode — no Tableau MCP tools available."
              : `${tools.length} Tableau MCP tool${tools.length === 1 ? "" : "s"} available.`}
        </p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <div className="space-y-2 text-[hsl(var(--muted-foreground))]">
            <p>Ask a question about your dashboard, or try:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>What were the top categories last quarter?</li>
              <li>Why did revenue drop in March?</li>
              <li>Summarize this view in 3 bullet points.</li>
            </ul>
          </div>
        ) : (
          messages.map((m, i) => <MessageView key={i} message={m} />)
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-[hsl(var(--border))] p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? "Generating…" : "Ask the agent"}
          disabled={busy}
          className="flex-1 rounded-md border border-[hsl(var(--border))] px-3 py-2 outline-none focus:border-brand disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageView({ message }: { message: Message }): ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-brand px-3 py-2 text-white">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {message.toolEvents?.map((t) => (
        <div
          key={t.id}
          className={
            "rounded-md border px-2 py-1 text-xs " +
            (t.status === "running"
              ? "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
              : t.status === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800")
          }
        >
          <span className="font-mono">{t.name}</span>
          {t.status === "running" ? " — running…" : t.preview ? ` — ${t.preview}` : ""}
        </div>
      ))}
      {message.content ? (
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
      ) : null}
    </div>
  );
}

function applyEvent(messages: Message[], event: RawEvent): Message[] {
  if (event.type === "text_delta") return appendToAssistant(messages, event.delta);
  if (event.type === "system" || event.type === "error") {
    return appendToAssistant(messages, `\n[${event.type}] ${event.message}`);
  }
  if (event.type === "tool_use" || event.type === "viz_action") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      toolEvents: [
        ...(m.toolEvents ?? []),
        { id: event.id, name: event.name, status: "running" },
      ],
    }));
  }
  if (event.type === "tool_result") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      toolEvents: (m.toolEvents ?? []).map((t) =>
        t.id === event.id
          ? { ...t, status: event.ok ? "ok" : "error", preview: event.preview }
          : t,
      ),
    }));
  }
  return messages;
}

function toVizAction(name: string, input: Record<string, unknown>): VizAction {
  switch (name) {
    case "viz.applyFilter":
      return {
        kind: "applyFilter",
        field: String(input.field ?? ""),
        values: Array.isArray(input.values) ? (input.values as string[]).map(String) : [],
        ...(typeof input.updateType === "string"
          ? { updateType: input.updateType as "REPLACE" | "ADD" | "REMOVE" }
          : {}),
      };
    case "viz.clearFilter":
      return { kind: "clearFilter", field: String(input.field ?? "") };
    case "viz.selectMarks":
      return {
        kind: "selectMarks",
        field: String(input.field ?? ""),
        values: Array.isArray(input.values) ? (input.values as string[]).map(String) : [],
      };
    case "viz.clearSelectedMarks":
      return { kind: "clearSelectedMarks" };
    case "viz.switchTab":
      return { kind: "switchTab", sheetName: String(input.sheetName ?? "") };
    case "viz.setParameter":
      return {
        kind: "setParameter",
        name: String(input.name ?? ""),
        value: String(input.value ?? ""),
      };
    default:
      // Should never happen — agent emits only known viz.* names.
      return { kind: "clearSelectedMarks" };
  }
}

function appendToAssistant(messages: Message[], delta: string): Message[] {
  return mutateLastAssistant(messages, (m) => ({ ...m, content: m.content + delta }));
}

function mutateLastAssistant(messages: Message[], fn: (m: Message) => Message): Message[] {
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
