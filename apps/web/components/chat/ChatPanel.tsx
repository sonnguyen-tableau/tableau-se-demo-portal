"use client";

import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import {
  useAskAiSubscription,
  useVizContext,
  type VizAction,
} from "@/components/bridge/VizContextProvider";
import { VegaChart } from "@/components/chart/VegaChart";

type RawEvent =
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

type RichBlock =
  | { kind: "image"; mimeType: string; data: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "vegaspec"; spec: Record<string, unknown>; title?: string | undefined };

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  toolEvents?: Array<{ id: string; name: string; status: "running" | "ok" | "error"; preview?: string }>;
  richBlocks?: RichBlock[];
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
        <h3 className="text-sm font-semibold">Chat phân tích AI</h3>
        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {tools === null
            ? "Đang kết nối tới agent…"
            : tools.length === 0
              ? "Chế độ chung — không có công cụ Tableau MCP."
              : `${tools.length} công cụ Tableau MCP sẵn sàng.`}
        </p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <div className="space-y-2 text-[hsl(var(--muted-foreground))]">
            <p>Đặt câu hỏi về dashboard của bạn, ví dụ:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Những danh mục bán chạy nhất quý vừa rồi là gì?</li>
              <li>Tại sao doanh thu giảm vào tháng 3?</li>
              <li>Tóm tắt view này trong 3 ý chính.</li>
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
          placeholder={busy ? "Đang xử lý…" : "Hỏi AI agent"}
          disabled={busy}
          className="flex-1 rounded-md border border-[hsl(var(--border))] px-3 py-2 outline-none focus:border-brand disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Gửi
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
          {t.status === "running" ? " — đang xử lý…" : t.preview ? ` — ${t.preview}` : ""}
        </div>
      ))}
      {message.richBlocks?.map((block, i) => (
        <RichBlockView key={i} block={block} />
      ))}
      {message.content ? (
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
      ) : null}
    </div>
  );
}

const MAX_VISIBLE_ROWS = 50;

function RichBlockView({ block }: { block: RichBlock }): ReactElement {
  if (block.kind === "image") {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:${block.mimeType};base64,${block.data}`}
          alt="Tableau chart"
          className="w-full object-contain"
          style={{ maxHeight: "400px" }}
        />
      </div>
    );
  }

  if (block.kind === "vegaspec") {
    return <VegaChart spec={block.spec} title={block.title} dark={false} />;
  }

  // table
  const visibleRows = block.rows.slice(0, MAX_VISIBLE_ROWS);
  const truncated = block.rows.length > MAX_VISIBLE_ROWS;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {block.columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
          Hiển thị {MAX_VISIBLE_ROWS} / {block.rows.length} dòng
        </p>
      )}
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
  if (event.type === "tool_image") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [
        ...(m.richBlocks ?? []),
        { kind: "image", mimeType: event.mimeType, data: event.data },
      ],
    }));
  }
  if (event.type === "tool_table") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [
        ...(m.richBlocks ?? []),
        { kind: "table", columns: event.columns, rows: event.rows },
      ],
    }));
  }
  if (event.type === "tool_vegaspec") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [
        ...(m.richBlocks ?? []),
        ...(event.title !== undefined
          ? [{ kind: "vegaspec" as const, spec: event.spec, title: event.title }]
          : [{ kind: "vegaspec" as const, spec: event.spec }]),
      ],
    }));
  }
  return messages;
}

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
