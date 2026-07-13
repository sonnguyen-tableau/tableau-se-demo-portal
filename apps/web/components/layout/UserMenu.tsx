"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  email: string;
  signOut: () => Promise<void>;
  /** Localized labels (default Vietnamese for any legacy caller). */
  signedInAsLabel?: string;
  signOutLabel?: string;
}

export function UserMenu({
  email,
  signOut,
  signedInAsLabel = "Đăng nhập với",
  signOutLabel = "Đăng xuất",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const initial = email.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-1 transition-all duration-base ease-smooth hover:bg-sf-neutral-2"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sf-blue-60 to-sf-blue-90 text-body-sm font-bold text-white shadow-elev-1"
          aria-hidden="true"
        >
          {initial}
        </span>
        <svg className="h-4 w-4 text-sf-neutral-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-sf-neutral-3 bg-white shadow-elev-3 animate-slide-up"
        >
          <div className="border-b border-sf-neutral-3 px-4 py-3">
            <p className="text-meta font-semibold uppercase tracking-wider text-sf-neutral-5">{signedInAsLabel}</p>
            <p className="mt-0.5 truncate text-body-sm font-semibold text-sf-neutral-9">{email}</p>
          </div>
          <form action={async () => { await signOut(); }}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body-sm font-medium text-sf-neutral-8 transition-colors hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
            >
              <svg className="h-4 w-4 text-sf-neutral-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {signOutLabel}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
