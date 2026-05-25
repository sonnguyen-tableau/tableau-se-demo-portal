"use client";

import { type ReactNode, createContext, useContext, useState } from "react";

interface ChatPanelCtx {
  open: boolean;
  toggle: () => void;
}
const Ctx = createContext<ChatPanelCtx>({ open: true, toggle: () => {} });
export function useChatPanel() { return useContext(Ctx); }

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Ctx.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

export function ChatPanelWrapper({ children }: { children: ReactNode }) {
  const { open } = useChatPanel();
  return (
    <div
      className={`shrink-0 min-h-0 transition-[width,padding] duration-200 ease-in-out overflow-hidden ${
        open ? "w-[360px] pl-3" : "w-0 pl-0"
      }`}
    >
      <div className="w-[360px] h-full">
        {children}
      </div>
    </div>
  );
}

export function ChatPanelToggle() {
  const { open, toggle } = useChatPanel();
  return (
    <button
      onClick={toggle}
      title={open ? "Ẩn AI Agent" : "Hiện AI Agent"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sf-neutral-5 transition-colors hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
      {open && (
        <span className="sr-only">Ẩn chat</span>
      )}
    </button>
  );
}
