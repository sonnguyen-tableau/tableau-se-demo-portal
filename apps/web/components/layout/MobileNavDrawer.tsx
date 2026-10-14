"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

interface MobileNavDrawerProps {
  /** The shared SidebarContent (server-rendered) shown inside the sheet. */
  children: ReactNode;
  openLabel: string;
  closeLabel: string;
}

// Same gradient as the desktop SidebarWrapper so the drawer reads identically.
const SIDEBAR_BG =
  "linear-gradient(180deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 92%, #000 8%) 100%)";

/**
 * Mobile/tablet (< lg) navigation. Renders the hamburger trigger and, when open,
 * a left sheet (300px) over a scrim holding the shared SidebarContent. Esc and
 * scrim close it, it closes on route change, Tab is trapped inside the sheet, and
 * focus returns to the hamburger on close (SH-01, DESIGN v2 §3.1/§6).
 */
export function MobileNavDrawer({ children, openLabel, closeLabel }: MobileNavDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open: focus the sheet, trap Tab, close on Esc, lock body scroll, and
  // restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const sheet = sheetRef.current;
    sheet?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !sheet) return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Resizing up to the desktop breakpoint hides the drawer (lg:hidden); close
    // it so the scroll lock + focus trap are released rather than left dangling.
    const mq = window.matchMedia("(min-width: 1024px)");
    const onViewportChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onViewportChange);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      mq.removeEventListener("change", onViewportChange);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openLabel}
        aria-expanded={open}
        {...(open ? { "aria-controls": "mobile-nav-drawer" } : {})}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sf-neutral-7 transition-colors hover:bg-sf-neutral-2 hover:text-sf-neutral-9 active:scale-95"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div className="lg:hidden" role="dialog" aria-modal="true" aria-label={openLabel}>
          {/* Scrim */}
          <button
            type="button"
            aria-label={closeLabel}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-sf-neutral-10/40 motion-safe:animate-fade-in"
          />
          {/* Sheet */}
          <div
            id="mobile-nav-drawer"
            ref={sheetRef}
            tabIndex={-1}
            className="fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col overflow-hidden border-r border-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)] shadow-elev-4 outline-none motion-safe:animate-fade-in"
            style={{ background: SIDEBAR_BG }}
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-text)_10%,transparent)]"
                style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 70%, transparent)" }}
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            {/* Tapping any nav link closes the drawer — even the current route's
                link, where the pathname effect wouldn't fire (FX-08). */}
            <div
              className="flex flex-1 flex-col overflow-y-auto"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
