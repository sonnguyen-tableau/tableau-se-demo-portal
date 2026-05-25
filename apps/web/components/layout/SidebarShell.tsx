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
      className={`hidden lg:flex flex-col h-full overflow-hidden shrink-0 transition-[width] duration-base ease-smooth ${
        open ? "w-[260px]" : "w-0"
      }`}
      style={{
        background:
          "linear-gradient(180deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 92%, #000 8%) 100%)",
      }}
    >
      {/* Inner div keeps content at fixed width so it doesn't reflow */}
      <div className="w-[260px] flex flex-col h-full overflow-hidden border-r border-white/[0.06]">
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
      aria-label={open ? "Thu gọn menu" : "Mở rộng menu"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sf-neutral-6 transition-all duration-base ease-smooth hover:bg-sf-neutral-2 hover:text-sf-neutral-9 active:scale-95"
    >
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        {open ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h11M4 12h16M9 19h11M4 5l-1 7 1 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16" />
        )}
      </svg>
    </button>
  );
}
