"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useChatAgent, type ChatMessage, type RichBlock } from "@/hooks/useChatAgent";
import { VegaChart } from "@/components/chart/VegaChart";
import { SalesforceBankIcon } from "@/components/SalesforceBankLogo";

const SUGGESTIONS = [
  "Tóm tắt tình hình doanh thu ngân hàng tháng này",
  "Danh mục cho vay nào đang tăng trưởng mạnh nhất?",
  "So sánh hiệu suất các chi nhánh theo khu vực",
  "Phân tích xu hướng thu nhập lãi thuần 6 tháng qua",
];

export function AgentPage({ tenantName }: { tenantName: string }) {
  const { messages, busy, tools, send, clear } = useChatAgent();
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
    <div className="flex h-full flex-col bg-sf-blue-90 text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-3">
          <SalesforceBankIcon size={28} />
          <div>
            <span className="text-sm font-semibold text-white">AI Analytics Agent</span>
            <span className="ml-2 text-xs text-slate-400">{tenantName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {tools !== null && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400">
              {tools.length > 0 ? `${tools.length} Tableau tools` : "General mode"}
            </span>
          )}
          {hasMessages && (
            <button
              onClick={clear}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-white/20 hover:text-white transition-colors"
            >
              Cuộc hội thoại mới
            </button>
          )}
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Hero / empty state */
          <div className="flex h-full flex-col items-center justify-center px-6 pb-24 pt-8">
            {/* Glowing orb */}
            <div className="relative mb-8">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 opacity-90 blur-sm absolute inset-0" />
              <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-2xl shadow-blue-500/40">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="white" fillOpacity="0.2"/>
                  <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
              Xin chào, tôi là AI Agent
            </h1>
            <p className="mb-10 max-w-md text-center text-base text-slate-400">
              Trợ lý phân tích dữ liệu của <span className="text-white font-medium">{tenantName}</span>. Hỏi tôi bất cứ điều gì về dữ liệu của bạn.
            </p>

            {/* Suggestion chips */}
            <div className="grid max-w-2xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="group rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-300 backdrop-blur-sm transition-all hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-white"
                >
                  <span className="mr-2 text-blue-400 group-hover:text-blue-300">→</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {busy && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input bar — floats at bottom */}
      <div className="border-t border-white/10 bg-sf-blue-90 px-4 py-4">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur-sm focus-within:border-sf-blue-60/60 transition-colors"
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
            placeholder={busy ? "Đang xử lý…" : "Hỏi AI agent về dữ liệu của bạn…"}
            disabled={busy}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-white placeholder-slate-500 outline-none disabled:opacity-50"
            style={{ maxHeight: "160px" }}
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sf-blue-60 text-white transition-all hover:bg-sf-blue-70 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-slate-600">
          Enter để gửi · Shift+Enter xuống dòng
        </p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl bg-white/8 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      {/* Agent avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 mt-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {/* Tool call pills */}
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolEvents.map((t) => (
              <span
                key={t.id}
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                  (t.status === "running"
                    ? "border border-white/10 bg-white/5 text-slate-400"
                    : t.status === "ok"
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border border-red-500/30 bg-red-500/10 text-red-400")
                }
              >
                {t.status === "running" && (
                  <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {t.status === "ok" && <span>✓</span>}
                {t.status === "error" && <span>✗</span>}
                <span className="font-mono">{t.name}</span>
              </span>
            ))}
          </div>
        )}

        {/* Rich blocks: images and tables */}
        {message.richBlocks?.map((block, i) => (
          <RichBlockView key={i} block={block} />
        ))}

        {/* Text */}
        {message.content && (
          <div className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

const MAX_VISIBLE_ROWS = 50;

function RichBlockView({ block }: { block: RichBlock }) {
  if (block.kind === "image") {
    return (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
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
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/4 backdrop-blur-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            {block.columns.map((col) => (
              <th key={col} className="px-3 py-2.5 text-left font-semibold text-slate-300 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 hover:bg-white/4 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-300 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="border-t border-white/8 px-3 py-2 text-xs text-slate-500">
          Hiển thị {MAX_VISIBLE_ROWS} / {block.rows.length} dòng
        </p>
      )}
    </div>
  );
}
