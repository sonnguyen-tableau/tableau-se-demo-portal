"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useVizContext } from "@/components/bridge/VizContextProvider";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

interface ChatPanelCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
}
const Ctx = createContext<ChatPanelCtx>({ open: false, toggle: () => {}, close: () => {} });
export function useChatPanel() {
  return useContext(Ctx);
}

const OPEN_KEY = "agentPanelOpen";

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  // Hidden by default so the report uses full width; the open/closed choice is
  // then persisted (RV-07). SSR renders closed, then we read localStorage on
  // mount — a brief flash to open is acceptable.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const persist = (v: boolean) => {
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const toggle = useCallback(() => setOpen((v) => { persist(!v); return !v; }), []);
  const close = useCallback(() => { persist(false); setOpen(false); }, []);
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}

const MIN_W = 340;
const MAX_W = 560;
const DEFAULT_W = 400;
const WIDTH_KEY = "agentPanelWidth";
type Mode = "docked" | "overlay" | "sheet";

/**
 * Agent panel frame (RV-07, DESIGN §3.2). ≥xl: docked + drag-resizable
 * (340–560px, pointer + ←/→ keyboard on the handle, double-click resets to 400,
 * width persisted). lg–xl: right overlay sheet. <lg: bottom sheet (88dvh). The
 * docked width change is picked up by TableauVizShell's ResizeObserver, so the
 * viz reflows with no horizontal scrollbar.
 */
export function ChatPanelWrapper({ children, locale = DEFAULT_LOCALE }: { children: ReactNode; locale?: Locale }) {
  const { open, close } = useChatPanel();
  const t = translator(locale);
  const [width, setWidth] = useState(DEFAULT_W);
  const [mode, setMode] = useState<Mode>("docked");
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(WIDTH_KEY));
      if (w >= MIN_W && w <= MAX_W) setWidth(w);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const docked = window.matchMedia("(min-width: 1280px)");
    const sheet = window.matchMedia("(max-width: 1023px)");
    const compute = () => setMode(docked.matches ? "docked" : sheet.matches ? "sheet" : "overlay");
    compute();
    docked.addEventListener("change", compute);
    sheet.addEventListener("change", compute);
    return () => {
      docked.removeEventListener("change", compute);
      sheet.removeEventListener("change", compute);
    };
  }, []);

  const clamp = (w: number) => Math.min(MAX_W, Math.max(MIN_W, w));
  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    // Capture the pointer so drag keeps working OVER the viz iframe (FX-03) — a
    // bare window listener loses events once the cursor enters the <iframe>.
    try { handle.setPointerCapture(pid); } catch { /* older browsers */ }
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev: PointerEvent) => setWidth(clamp(startW + (startX - ev.clientX)));
    const onUp = () => {
      try { handle.releasePointerCapture(pid); } catch { /* ignore */ }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };
  const onHandleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidth((w) => clamp(w + 16)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidth((w) => clamp(w - 16)); }
  };

  // Esc closes the overlay / bottom sheet (FX-03 a11y).
  useEffect(() => {
    if (!open || mode === "docked") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, close]);

  const panel = <div className="h-full w-full min-h-0">{children}</div>;

  // ── Docked (≥ xl): in-flow, resizable ──────────────────────────────────────
  if (mode === "docked") {
    return (
      <div
        className="relative flex shrink-0 min-h-0 overflow-hidden transition-[width,padding] duration-200 ease-in-out"
        style={open ? { width: width + 12, paddingLeft: 12 } : { width: 0, paddingLeft: 0 }}
        inert={!open}
      >
        {open && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("agent.resizePanel")}
            aria-valuenow={width}
            aria-valuemin={MIN_W}
            aria-valuemax={MAX_W}
            tabIndex={0}
            onPointerDown={onHandlePointerDown}
            onKeyDown={onHandleKeyDown}
            onDoubleClick={() => setWidth(DEFAULT_W)}
            className="group absolute left-0 top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center outline-none"
          >
            <span className="h-10 w-1 rounded-full bg-sf-neutral-3 transition-colors group-hover:bg-brand/50 group-focus-visible:bg-brand" aria-hidden="true" />
          </div>
        )}
        <div className="h-full" style={{ width }}>{panel}</div>
      </div>
    );
  }

  // ── Overlay (lg–xl) / bottom sheet (< lg): fixed, with a backdrop ───────────
  // Kept MOUNTED when closed (hidden + inert), so close/reopen preserves the
  // conversation instead of unmounting it (review C5).
  const isSheet = mode === "sheet";
  return (
    <div
      className={`fixed inset-0 z-40 flex transition-opacity duration-200 ${open ? "" : "pointer-events-none opacity-0"}`}
      onClick={open ? close : undefined}
    >
      <div className={`absolute inset-0 bg-sf-neutral-10/40 backdrop-blur-sm ${open ? "" : "opacity-0"}`} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal={open}
        aria-label={t("nav.aiAgent")}
        aria-hidden={!open}
        inert={!open}
        onClick={(e) => e.stopPropagation()}
        className={`absolute flex flex-col bg-white shadow-elev-4 transition-transform duration-200 ease-smooth ${
          isSheet
            ? `inset-x-0 bottom-0 h-[88dvh] rounded-t-2xl ${open ? "translate-y-0" : "translate-y-full"}`
            : `right-0 top-0 h-full w-[400px] max-w-[90vw] ${open ? "translate-x-0" : "translate-x-full"}`
        }`}
      >
        {/* Dedicated control row so the close × never sits on top of the panel
            header's ⤢/＋ buttons (review C5). Sheet mode shows a drag handle. */}
        <div className="relative flex shrink-0 items-center justify-end px-2 pt-2">
          {isSheet && (
            <div className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-sf-neutral-3" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={close}
            aria-label={t("agent.closePanel")}
            className="btn-icon"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </aside>
    </div>
  );
}

/**
 * Labeled "✦ Hỏi AI" entry point (DESIGN v2 §4.5). Brand-tinted when the panel
 * is open; shows a count badge equal to the number of selected marks so the user
 * knows the agent can act on their selection. Must live inside VizContextProvider.
 */
export function ChatPanelToggle({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const { open, toggle } = useChatPanel();
  const { state } = useVizContext();
  const t = translator(locale);
  const n = state.selectedMarks.length;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-body-sm font-semibold transition-colors duration-base ease-smooth ${
        open
          ? "border-brand/40 bg-brand/8 text-brand-text"
          : "border-sf-neutral-3 bg-white text-sf-neutral-8 hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
      }`}
    >
      <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{t("view.askAi")}</span>
      {n > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold tabular-nums text-brand-on">
          {n}
        </span>
      )}
    </button>
  );
}
