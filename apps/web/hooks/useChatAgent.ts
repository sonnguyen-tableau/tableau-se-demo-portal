"use client";

import { useCallback, useRef, useState } from "react";

export type RawEvent =
  | { type: "open"; tools: string[] }
  | { type: "system"; message: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "tool_image"; id: string; mimeType: string; data: string }
  | { type: "tool_table"; id: string; columns: string[]; rows: string[][] }
  | { type: "tool_vegaspec"; id: string; spec: Record<string, unknown>; title?: string }
  | { type: "viz_action"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input_tokens?: number; output_tokens?: number } };

export type RichBlock =
  | { kind: "image"; mimeType: string; data: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "vegaspec"; spec: Record<string, unknown>; title?: string | undefined };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolEvents?: Array<{ id: string; name: string; status: "running" | "ok" | "error"; preview?: string }>;
  richBlocks?: RichBlock[];
}

function appendToAssistant(messages: ChatMessage[], delta: string): ChatMessage[] {
  return mutateLastAssistant(messages, (m) => ({ ...m, content: m.content + delta }));
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

function applyEvent(messages: ChatMessage[], event: RawEvent): ChatMessage[] {
  if (event.type === "text_delta") return appendToAssistant(messages, event.delta);
  if (event.type === "system" || event.type === "error") {
    return appendToAssistant(messages, `\n[${event.type}] ${event.message}`);
  }
  if (event.type === "tool_use" || event.type === "viz_action") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      toolEvents: [...(m.toolEvents ?? []), { id: event.id, name: event.name, status: "running" }],
    }));
  }
  if (event.type === "tool_result") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      toolEvents: (m.toolEvents ?? []).map((t) =>
        t.id === event.id ? { ...t, status: event.ok ? "ok" : "error", preview: event.preview } : t,
      ),
    }));
  }
  if (event.type === "tool_image") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [...(m.richBlocks ?? []), { kind: "image", mimeType: event.mimeType, data: event.data }],
    }));
  }
  if (event.type === "tool_table") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [...(m.richBlocks ?? []), { kind: "table", columns: event.columns, rows: event.rows }],
    }));
  }
  if (event.type === "tool_vegaspec") {
    const block: RichBlock = event.title !== undefined
      ? { kind: "vegaspec", spec: event.spec, title: event.title }
      : { kind: "vegaspec", spec: event.spec };
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [...(m.richBlocks ?? []), block],
    }));
  }
  return messages;
}

export function useChatAgent(vizContext?: {
  workbook?: string;
  activeSheet?: string;
  filters?: Array<{ field: string; values: string[] }>;
  selectedMarks?: Array<Record<string, string>>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[] | null>(null);

  // Keep ref in sync so send() can read current messages synchronously
  const setMessagesAndRef = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const send = useCallback(async (text: string) => {
    setBusy(true);

    // Capture history BEFORE appending the new turn
    const history = messagesRef.current
      .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.trim().length > 0))
      .map((m) => ({ role: m.role, content: m.content }));

    setMessagesAndRef((prev) => [
      ...prev,
      { role: "user" as const, content: text },
      { role: "assistant" as const, content: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, vizContext, history }),
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        setMessagesAndRef((m) => appendToAssistant(m, `[error] HTTP ${res.status}`));
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
          try { event = JSON.parse(json) as RawEvent; } catch { continue; }
          setMessagesAndRef((m) => applyEvent(m, event));
          if (event.type === "open") setTools(event.tools);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "stream error";
      setMessagesAndRef((m) => appendToAssistant(m, `[error] ${msg}`));
    } finally {
      setBusy(false);
    }
  }, [vizContext]);

  const clear = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setTools(null);
  }, []);

  return { messages, busy, tools, send, clear };
}
