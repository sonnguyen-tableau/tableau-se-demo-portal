"use client";

import { useEffect, useState } from "react";
import { translator, type Locale } from "@/lib/i18n-shared";
import { OPEN_PALETTE_EVENT } from "@/components/layout/CommandPalette";

/**
 * ⌘K search trigger (SH-04). A pure trigger: clicking (or ⌘K, handled by the
 * single layout-mounted CommandPalette) opens the palette via a window event.
 * Rendered in both the desktop top bar and the mobile bar — neither owns the
 * dialog, so the two instances can't open duplicate palettes.
 */
export function SearchTrigger({ locale, variant = "bar" }: { locale: Locale; variant?: "bar" | "icon" }) {
  const t = translator(locale);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform));
  }, []);

  const openPalette = () => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openPalette}
        aria-label={t("search.ariaLabel")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sf-neutral-6 transition-colors duration-base ease-smooth hover:bg-sf-neutral-2 hover:text-sf-neutral-9 active:scale-95"
      >
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPalette}
      className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-sf-neutral-3 bg-sf-neutral-2 px-3 text-body-sm text-sf-neutral-6 transition-all duration-base ease-smooth hover:border-sf-neutral-4 hover:bg-white hover:text-sf-neutral-8"
      aria-label={t("search.ariaLabel")}
    >
      <svg className="h-4 w-4 text-sf-neutral-5 group-hover:text-sf-neutral-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
      </svg>
      <span className="flex-1 text-left">{t("search.trigger")}</span>
      <kbd className="hidden items-center gap-0.5 rounded border border-sf-neutral-3 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sf-neutral-6 group-hover:text-sf-neutral-8 sm:inline-flex">
        <span className="text-[11px]">{isMac ? "⌘" : "Ctrl"}</span>
        <span>K</span>
      </kbd>
    </button>
  );
}
