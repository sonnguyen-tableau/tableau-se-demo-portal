"use client";

import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import {
  useAskAiSubscription,
  useVizContext,
  type VizAction,
} from "@/components/bridge/VizContextProvider";
import { VegaChart } from "@/components/chart/VegaChart";
import { TableauPulseCard } from "@/components/embed/TableauPulseCard";

type RawEvent =
  | { type: "open"; tools: string[] }
  | { type: "system"; message: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "tool_image"; id: string; mimeType: string; data: string }
  | { type: "tool_table"; id: string; columns: string[]; rows: string[][] }
  | { type: "tool_vegaspec"; id: string; spec: Record<string, unknown>; title?: string }
  | { type: "pulse_card"; id: string; metricId: string; name: string }
  | { type: "viz_action"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input_tokens?: number; output_tokens?: number } };

type RichBlock =
  | { kind: "image"; mimeType: string; data: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "vegaspec"; spec: Record<string, unknown>; title?: string | undefined }
  | { kind: "pulse"; metricId: string; name: string };

interface PulseEmbedConfig {
  token: string;
  siteUrl: string;
  siteName: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  toolEvents?: Array<{ id: string; name: string; status: "running" | "ok" | "error"; preview?: string }>;
  richBlocks?: RichBlock[];
}

const DEFAULT_SUGGESTIONS = [
  "Những hạng mục nổi bật nhất kỳ vừa rồi?",
  "Có biến động nào bất thường không?",
  "Tóm tắt view này trong 3 ý chính.",
];

export function ChatPanel({ suggestions }: { suggestions?: string[] }): ReactElement {
  const { snapshot, applyVizAction } = useVizContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[] | null>(null);
  const [pulseConfig, setPulseConfig] = useState<PulseEmbedConfig | null>(null);
  const pulseConfigRef = useRef<Promise<PulseEmbedConfig | null> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // Stable per-mount conversation id: lets the server retain the full transcript
  // (incl. tool results) in KV so follow-up questions reuse already-fetched data.
  const sessionIdRef = useRef<string>(
    (() => {
      try {
        return crypto.randomUUID();
      } catch {
        return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      }
    })(),
  );

  // Fetch the Pulse JWT + site URL lazily, the first time the agent emits a
  // pulse_card event. Cached in a ref so concurrent events share one request.
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
        const json = (await res.json()) as {
          token?: string;
          siteUrl?: string;
          siteName?: string;
        };
        if (!json.token || !json.siteUrl || !json.siteName) return null;
        const cfg: PulseEmbedConfig = {
          token: json.token,
          siteUrl: json.siteUrl,
          siteName: json.siteName,
        };
        setPulseConfig(cfg);
        return cfg;
      } catch {
        return null;
      }
    })();
    return pulseConfigRef.current;
  }, []);

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
            ...(ctx.datasources.length > 0 ? { datasources: ctx.datasources } : {}),
          }
        : undefined;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, vizContext, chatSessionId: sessionIdRef.current }),
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
          if (event.type === "pulse_card") {
            // Kick off the JWT fetch so the card has a token by the time
            // the embed component mounts.
            void ensurePulseConfig();
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

  const SUGGESTIONS = suggestions && suggestions.length > 0 ? suggestions : DEFAULT_SUGGESTIONS;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-sf-neutral-3 bg-white shadow-elev-1">
      <header className="flex items-center gap-2.5 border-b border-sf-neutral-3 bg-gradient-to-b from-sf-neutral-2/60 to-white px-4 py-3">
        <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sf-blue-60 to-sf-blue-40 shadow-elev-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" stroke="white" strokeWidth="1.75" strokeLinejoin="round" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-body-sm font-semibold text-sf-neutral-9 leading-tight">AI Analytics</h3>
          <p className="text-meta text-sf-neutral-6 truncate">
            {tools === null
              ? "Đang kết nối…"
              : tools.length === 0
                ? "Chế độ chung — không có công cụ Tableau MCP"
                : `${tools.length} công cụ Tableau sẵn sàng`}
          </p>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-body-sm">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-body-sm text-sf-neutral-6">Đặt câu hỏi về dashboard của bạn:</p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="group flex w-full items-center justify-between gap-2 rounded-lg border border-sf-neutral-3 bg-white px-3 py-2 text-left text-caption text-sf-neutral-7 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:bg-brand/5 hover:text-sf-neutral-9 hover:shadow-elev-1"
                >
                  <span className="truncate">{s}</span>
                  <svg className="h-3 w-3 shrink-0 text-sf-neutral-4 transition-all duration-base group-hover:translate-x-0.5 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageView key={i} message={m} pulseConfig={pulseConfig} />)
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="border-t border-sf-neutral-3 bg-white p-3">
        <div className="flex items-center gap-2 rounded-xl border border-sf-neutral-3 bg-sf-neutral-2/60 px-2.5 py-1.5 transition-colors duration-base ease-smooth focus-within:border-brand/50 focus-within:bg-white focus-within:shadow-elev-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={busy ? "Đang xử lý…" : "Hỏi AI agent…"}
            disabled={busy}
            className="flex-1 bg-transparent px-1.5 py-1.5 text-body-sm text-sf-neutral-9 outline-none placeholder:text-sf-neutral-5 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 text-white shadow-elev-1 transition-all duration-base ease-smooth hover:shadow-glow-brand active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            aria-label="Gửi"
          >
            {busy ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageView({
  message,
  pulseConfig,
}: {
  message: Message;
  pulseConfig: PulseEmbedConfig | null;
}): ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 px-3.5 py-2 text-body-sm text-white shadow-elev-1">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2 animate-slide-up">
      {message.toolEvents?.map((t) => (
        <div
          key={t.id}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-meta font-medium ring-1 " +
            (t.status === "running"
              ? "bg-sf-neutral-2 text-sf-neutral-6 ring-sf-neutral-3"
              : t.status === "ok"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-red-50 text-red-700 ring-red-200")
          }
        >
          {t.status === "running" ? (
            <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : t.status === "ok" ? (
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" stroke="currentColor" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span aria-hidden="true">×</span>
          )}
          <span className="font-mono">{t.name}</span>
        </div>
      ))}
      {message.richBlocks?.map((block, i) => (
        <RichBlockView key={i} block={block} pulseConfig={pulseConfig} />
      ))}
      {message.content ? (
        <div className="whitespace-pre-wrap text-body-sm leading-relaxed text-sf-neutral-8">{message.content}</div>
      ) : null}
    </div>
  );
}

const MAX_VISIBLE_ROWS = 50;

function RichBlockView({
  block,
  pulseConfig,
}: {
  block: RichBlock;
  pulseConfig: PulseEmbedConfig | null;
}): ReactElement {
  if (block.kind === "pulse") {
    if (!pulseConfig) {
      return (
        <div className="rounded-lg border border-sf-neutral-3 bg-sf-neutral-2/40 px-3 py-2 text-meta text-sf-neutral-6">
          Đang tải Pulse card cho <span className="font-medium">{block.name}</span>…
        </div>
      );
    }
    const src = `${pulseConfig.siteUrl}/pulse/site/${pulseConfig.siteName}/metrics/${block.metricId}`;
    return (
      <TableauPulseCard
        src={src}
        token={pulseConfig.token}
        name={block.name}
        height="280px"
      />
    );
  }
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
  if (event.type === "pulse_card") {
    return mutateLastAssistant(messages, (m) => ({
      ...m,
      richBlocks: [
        ...(m.richBlocks ?? []),
        { kind: "pulse", metricId: event.metricId, name: event.name },
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
