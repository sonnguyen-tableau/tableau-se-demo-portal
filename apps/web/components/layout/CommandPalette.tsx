"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Sparkles, Clock, LayoutDashboard } from "lucide-react";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";
import { normalizeText } from "@/lib/normalize-text";
import { useChatPanel } from "@/components/layout/ChatPanelToggle";
import { ASK_AI_EVENT } from "@/components/bridge/VizContextProvider";

/** True on a report view route (/t/<slug>/dashboards/<wb>/<view>) where a viz +
 *  chat panel are mounted, so "Ask AI" can act in-place instead of navigating. */
export function isViewRoute(pathname: string): boolean {
  return /^\/t\/[^/]+\/dashboards\/[^/]+\/[^/]+/.test(pathname);
}

export interface PaletteItem {
  kind: "view" | "workbook";
  href: string;
  title: string;
  subtitle?: string | undefined;
  projectName: string;
}

/** Fire from the trigger buttons to open the single layout-mounted palette. */
export const OPEN_PALETTE_EVENT = "open-command-palette";

/** Diacritics-insensitive fuzzy match on title + project + subtitle. Exported for tests. */
export function filterPaletteItems(items: PaletteItem[], query: string, cap = 8): PaletteItem[] {
  const nq = normalizeText(query);
  if (!nq) return [];
  return items
    .filter((it) => normalizeText(`${it.title} ${it.projectName} ${it.subtitle ?? ""}`).includes(nq))
    .slice(0, cap);
}

type Row = { type: "item"; item: PaletteItem } | { type: "ask" };

/**
 * ⌘K command palette (SH-04, DESIGN §4.2). Mounted ONCE in the tenant layout;
 * the SearchTrigger buttons open it via a window event (so the two trigger
 * instances don't each bind ⌘K / render their own dialog). Groups: Recent (empty
 * query) / Dashboards (fuzzy) / Ask AI (always last). Fully keyboard-operable
 * with the combobox + listbox + aria-activedescendant pattern.
 */
export function CommandPalette({
  locale = DEFAULT_LOCALE,
  tenantSlug,
  items,
  recent,
}: {
  locale?: Locale;
  tenantSlug: string;
  items: PaletteItem[];
  recent: PaletteItem[];
}) {
  const t = translator(locale);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { open: panelOpen, toggle: togglePanel } = useChatPanel();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Element to restore focus to when the dialog closes (the trigger). a11y.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      // Remember the trigger so focus returns to it on close (a11y).
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  const showRecent = query.trim() === "";
  const listed = useMemo(
    () => (showRecent ? recent.slice(0, 5) : filterPaletteItems(items, query)),
    [showRecent, recent, items, query],
  );
  const rows = useMemo<Row[]>(
    () => [...listed.map((item) => ({ type: "item" as const, item })), { type: "ask" as const }],
    [listed],
  );

  useEffect(() => {
    setActive((a) => Math.max(0, Math.min(a, rows.length - 1)));
  }, [rows.length]);

  const close = useCallback(() => setOpen(false), []);
  const activate = useCallback(
    (row: Row) => {
      close();
      if (row.type === "ask") {
        const q = query.trim();
        // On a report view, act in place: open the chat panel and (if there's a
        // query) send it to the view's agent; elsewhere go to the Agent page with
        // the query (FX-10).
        if (isViewRoute(pathname)) {
          if (q) window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: { prompt: q } }));
          if (!panelOpen) togglePanel();
        } else {
          router.push(`/t/${tenantSlug}/agent${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        }
      } else {
        router.push(row.item.href);
      }
    },
    [close, query, router, tenantSlug, pathname, panelOpen, togglePanel],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) activate(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // The search input is the only tabbable element — trap focus so Tab can't
      // escape to the (visually hidden) page behind the modal (a11y).
      e.preventDefault();
    }
  };

  if (!open) return null;

  const groupLabel = showRecent
    ? recent.length > 0
      ? t("search.groupRecent")
      : null
    : listed.length > 0
      ? t("search.groupDashboards")
      : null;

  const rowCls = (isActive: boolean) =>
    `flex cursor-pointer items-center gap-3 px-4 py-2.5 text-body-sm ${
      isActive ? "bg-brand/8 text-sf-neutral-10" : "text-sf-neutral-8"
    }`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-sf-neutral-10/40 px-4 pt-24 backdrop-blur-sm animate-fade-in"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.dialogLabel")}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-sf-neutral-3 bg-white shadow-elev-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-sf-neutral-3 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-sf-neutral-5" strokeWidth={2} aria-hidden="true" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={`cmdk-opt-${active}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("search.inputPlaceholder")}
            className="flex-1 bg-transparent text-body text-sf-neutral-9 outline-none placeholder:text-sf-neutral-5"
          />
          <kbd className="rounded border border-sf-neutral-3 bg-sf-neutral-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sf-neutral-6">
            ESC
          </kbd>
        </div>

        <ul id="cmdk-listbox" role="listbox" aria-label={t("search.dialogLabel")} className="max-h-[52vh] overflow-y-auto py-2">
          {groupLabel && <GroupLabel>{groupLabel}</GroupLabel>}
          {listed.map((item, i) => (
            <li
              key={`${item.href}-${i}`}
              id={`cmdk-opt-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseEnter={() => setActive(i)}
              onClick={() => activate({ type: "item", item })}
              className={rowCls(active === i)}
            >
              {showRecent ? (
                <Clock className="h-4 w-4 shrink-0 text-sf-neutral-5" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <LayoutDashboard className="h-4 w-4 shrink-0 text-sf-neutral-5" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {item.subtitle && <span className="shrink-0 truncate text-caption text-sf-neutral-5">{item.subtitle}</span>}
            </li>
          ))}
          {!showRecent && listed.length === 0 && (
            <li role="presentation" className="px-4 py-2.5 text-body-sm text-sf-neutral-5">
              {t("search.noResults")}
            </li>
          )}

          <GroupLabel>{t("search.groupAskAi")}</GroupLabel>
          <li
            id={`cmdk-opt-${listed.length}`}
            role="option"
            aria-selected={active === listed.length}
            onMouseEnter={() => setActive(listed.length)}
            onClick={() => activate({ type: "ask" })}
            className={rowCls(active === listed.length)}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {t("search.askAi")}
              {query.trim() ? `: “${query.trim()}”` : ""}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li role="presentation" className="px-4 pb-1 pt-2 text-meta font-semibold uppercase tracking-[0.14em] text-sf-neutral-5">
      {children}
    </li>
  );
}
