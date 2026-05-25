"use client";

import { type ReactNode, createContext, useContext, useState } from "react";

// ── Context shared between sidebar and toggle button ──────────────────────────

interface SidebarCtx {
  open: boolean;
  toggle: () => void;
}
const Ctx = createContext<SidebarCtx>({ open: true, toggle: () => {} });
export function useSidebar() { return useContext(Ctx); }

// ── Provider (wraps the whole layout) ────────────────────────────────────────

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Ctx.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Collapsible sidebar wrapper ───────────────────────────────────────────────

export function SidebarWrapper({ children }: { children: ReactNode }) {
  const { open } = useSidebar();
  return (
    <aside
      className={`hidden lg:flex flex-col bg-brand-neutral h-full overflow-hidden shrink-0 transition-[width] duration-200 ease-in-out ${
        open ? "w-64" : "w-0"
      }`}
    >
      {/* Inner div keeps content at fixed width so it doesn't reflow */}
      <div className="w-64 flex flex-col h-full overflow-hidden">
        {children}
      </div>
    </aside>
  );
}

// ── Toggle button ─────────────────────────────────────────────────────────────

export function SidebarToggle() {
  const { open, toggle } = useSidebar();
  return (
    <button
      onClick={toggle}
      title={open ? "Thu gọn menu" : "Mở rộng menu"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sf-neutral-5 transition-colors hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {open ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        )}
      </svg>
    </button>
  );
}
