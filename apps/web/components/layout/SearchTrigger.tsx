"use client";

import { useEffect, useState } from "react";

/**
 * Visual ⌘K search trigger. Opens a placeholder dialog for now —
 * the actual command palette can be wired in a follow-up.
 */
export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-sf-neutral-3 bg-sf-neutral-2 px-3 text-body-sm text-sf-neutral-6 transition-all duration-base ease-smooth hover:border-sf-neutral-4 hover:bg-white hover:text-sf-neutral-8"
        aria-label="Tìm kiếm"
      >
        <svg className="h-4 w-4 text-sf-neutral-5 group-hover:text-sf-neutral-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
        </svg>
        <span className="flex-1 text-left">Tìm dashboards, dự án, AI prompt…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-sf-neutral-3 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sf-neutral-6 group-hover:text-sf-neutral-8 sm:inline-flex">
          <span className="text-[11px]">{isMac ? "⌘" : "Ctrl"}</span>
          <span>K</span>
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-sf-neutral-10/40 px-4 pt-24 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Tìm kiếm nhanh"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-sf-neutral-3 bg-white shadow-elev-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-sf-neutral-3 px-4 py-3">
              <svg className="h-4 w-4 text-sf-neutral-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
              </svg>
              <input
                autoFocus
                type="search"
                placeholder="Gõ để tìm dashboards, dự án, hoặc đặt câu hỏi cho AI…"
                className="flex-1 bg-transparent text-body text-sf-neutral-9 outline-none placeholder:text-sf-neutral-5"
              />
              <kbd className="rounded border border-sf-neutral-3 bg-sf-neutral-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sf-neutral-6">ESC</kbd>
            </div>
            <div className="px-4 py-12 text-center text-body-sm text-sf-neutral-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sf-neutral-2">
                <svg className="h-5 w-5 text-sf-neutral-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <p className="mt-3">Tìm kiếm nhanh sắp ra mắt — tạm thời dùng menu bên trái.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
