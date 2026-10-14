"use client";

import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useVizContext } from "@/components/bridge/VizContextProvider";
import { runVizAction } from "@/lib/viz-executor";
import { filterToChip } from "@/lib/viz-filter-chip";
import { embedErrorKey } from "@/lib/embed-errors";
import { SelectionAskFab } from "@/components/report/SelectionAskFab";
import { decodeFilters } from "@/lib/view-filters";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

interface Props {
  src: string;
  initialToken: string;
  height?: string;
  locale?: Locale;
  /** Internal users see the technical error detail; end users get a human message (RV-04). */
  isInternal?: boolean;
  viewMeta?: {
    workbookSlug: string;
    viewSlug: string;
    workbookName: string;
    viewName: string;
    projectName: string;
  };
}

type AnyRecord = Record<string, unknown>;

// Load Tableau Embedding API v3 from CDN and wait for custom element registration.
let cdnPromise: Promise<void> | null = null;
function loadTableauCdn(origin: string): Promise<void> {
  if (cdnPromise) return cdnPromise;
  cdnPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") { resolve(); return; }
    const existing = document.querySelector('script[data-tableau-embed]');
    const afterLoad = () => {
      customElements.whenDefined("tableau-viz").then(() => resolve()).catch(() => resolve());
    };
    if (existing) { afterLoad(); return; }
    const s = document.createElement("script");
    s.type = "module";
    s.setAttribute("data-tableau-embed", "1");
    s.src = `${origin}/javascripts/api/tableau.embedding.3.latest.min.js`;
    s.onload = afterLoad;
    s.onerror = () => { cdnPromise = null; reject(new Error("Failed to load Tableau CDN")); };
    document.head.appendChild(s);
  });
  return cdnPromise;
}

function readMarkRows(marksRoot: AnyRecord | null, cap: number): Array<Record<string, string>> {
  if (!marksRoot) return [];
  const data = Array.isArray(marksRoot.data) ? (marksRoot.data as AnyRecord[]) : [];
  const out: Array<Record<string, string>> = [];
  for (const sheet of data) {
    const cols = Array.isArray(sheet.columns) ? (sheet.columns as AnyRecord[]) : [];
    const rows = Array.isArray(sheet.data) ? (sheet.data as AnyRecord[][]) : [];
    for (const row of rows) {
      const entry: Record<string, string> = {};
      cols.forEach((col, i) => {
        const fieldName = String((col as AnyRecord).fieldName ?? "");
        if (!fieldName) return;
        const cell = row[i] as AnyRecord | undefined;
        entry[fieldName] = cell ? String(cell.formattedValue ?? cell.value ?? "") : "";
      });
      out.push(entry);
      if (out.length >= cap) return out;
    }
  }
  return out;
}


export function TableauVizShell({ src, initialToken, height = "700px", locale = DEFAULT_LOCALE, isInternal = false, viewMeta }: Props): ReactElement {
  const t = translator(locale);
  const containerRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<AnyRecord | null>(null);
  const { update, registerVizExecutor } = useVizContext();
  // The freshest token to (re)mount with — a ref, not state, so there's no live
  // property-push onto the element (changing <tableau-viz> token reloads it —
  // review C3). A refreshed token reaches the viz only via a reloadNonce remount.
  const tokenRef = useRef(initialToken);
  const [error, setError] = useState<string | null>(null);
  // The viz error code (RV-04): drives the human-readable message everyone sees;
  // `error` keeps the raw technical detail, shown only to internal users.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped to force a clean remount (auth-retry recovery — review M2).
  const [reloadNonce, setReloadNonce] = useState(0);
  // At most one silent token re-mint per load before surfacing the error (RV-04).
  const authRetryRef = useRef(0);
  // Apply shared-link ?f= filters at most once (RV-02).
  const appliedSharedRef = useRef(false);
  // Flash a brand ring on the frame for 1.2s after a successful agent viz action (AG-05).
  const [aiFlash, setAiFlash] = useState(false);
  const aiFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashAiChange = useCallback(() => {
    setAiFlash(true);
    if (aiFlashTimer.current) clearTimeout(aiFlashTimer.current);
    aiFlashTimer.current = setTimeout(() => setAiFlash(false), 1200);
  }, []);
  useEffect(() => () => { if (aiFlashTimer.current) clearTimeout(aiFlashTimer.current); }, []);
  // Fields an agent action filtered — tagged source:"ai" in the bridge state.
  const aiFieldsRef = useRef<Set<string>>(new Set());

  const refetchToken = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/tableau/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["tableau:views:embed"] }),
        credentials: "include",
      });
      if (!res.ok) { setError(`Token refresh failed (HTTP ${res.status})`); return false; }
      const data = (await res.json()) as { token: string };
      tokenRef.current = data.token;
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token refresh failed");
      return false;
    }
  }, []);

  useEffect(() => {
    tokenRef.current = initialToken;
  }, [initialToken]);

  useEffect(() => {
    return registerVizExecutor((action, opts) =>
      runVizAction(vizRef.current, action, {
        markAiField: (f) => aiFieldsRef.current.add(f),
        unmarkAiField: (f) => aiFieldsRef.current.delete(f),
        clearAiFields: () => aiFieldsRef.current.clear(),
        // Only agent-originated actions flash the brand ring (FX-02); user tab
        // clicks / Reset / clear-chip do not.
        flashAiChange: opts?.origin === "user" ? () => {} : flashAiChange,
      }),
    );
  }, [registerVizExecutor, flashAiChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    // Cancel guard: if the effect re-runs (StrictMode double-mount, fast src
    // change) before the async CDN load resolves, don't append a stale element.
    let cancelled = false;

    // Derive origin from src URL for CDN loading
    let origin = "https://prod-apsoutheast-c.online.tableau.com";
    try { origin = new URL(src).origin; } catch { /* keep default */ }

    loadTableauCdn(origin).then(() => {
      if (cancelled || containerRef.current !== container) return;
      const viz = document.createElement("tableau-viz") as unknown as AnyRecord;
      const el = viz as unknown as HTMLElement;
      // Hold the element ref from creation so the executor can reach it; it still
      // guards on viz.workbook, which only exists after `firstinteractive`.
      vizRef.current = viz;

      // Set as properties (not attributes) for proper web component initialization
      viz["src"] = src;
      viz["token"] = tokenRef.current; // freshest token at mount (review M1/C3)
      viz["toolbar"] = "bottom";
      viz["hideTabs"] = true;
      // Force desktop layout regardless of container width — otherwise Tableau
      // auto-picks Phone (min-height 700) when container drops below ~1400px,
      // producing a stacked scroll view instead of the intended dashboard grid.
      viz["device"] = "desktop";
      el.style.cssText = `width:100%;height:${height};`;

      el.addEventListener("firstinteractive", () => {
        setLoading(false);
        authRetryRef.current = 0; // a clean load resets the silent-retry budget
        vizRef.current = viz;
        const wb = viz["workbook"] as AnyRecord | undefined;
        if (wb) {
          update({
            workbook: String(wb["name"] ?? ""),
            activeSheet: String((wb["activeSheet"] as AnyRecord | undefined)?.["name"] ?? ""),
            ready: true,
          });
          // Capture datasources powering this workbook for agent context injection.
          const dsFn = wb["getDataSourcesAsync"] as (() => Promise<AnyRecord[]>) | undefined;
          if (typeof dsFn === "function") {
            void dsFn.call(wb).then((dsList) => {
              const datasources = dsList.map((ds) => ({
                name: String(ds["name"] ?? ""),
                ...(ds["id"] ? { id: String(ds["id"]) } : {}),
              }));
              update({ datasources });
            }).catch(() => {});
          }
          // Seed chips from filters already active on load (FX-09). A dashboard
          // exposes its worksheets; a single-worksheet view is its own sheet.
          const activeSheet = wb["activeSheet"] as AnyRecord | undefined;
          const sheets: AnyRecord[] = Array.isArray(activeSheet?.["worksheets"])
            ? (activeSheet!["worksheets"] as AnyRecord[])
            : activeSheet
              ? [activeSheet]
              : [];
          void Promise.all(
            sheets.map((s) => {
              const getFilters = s["getFiltersAsync"] as (() => Promise<AnyRecord[]>) | undefined;
              return typeof getFilters === "function" ? getFilters.call(s).catch(() => []) : Promise.resolve([]);
            }),
          )
            .then((lists) => {
              const byField = new Map<string, { field: string; values: string[]; source: "ai" | "user" }>();
              for (const f of lists.flat()) {
                const chip = filterToChip(f as AnyRecord);
                if (chip) byField.set(chip.field, { ...chip, source: aiFieldsRef.current.has(chip.field) ? "ai" : "user" });
              }
              if (byField.size === 0) return;
              update((prev) => ({
                filters: [...prev.filters.filter((f) => !byField.has(f.field)), ...Array.from(byField.values())],
              }));
            })
            .catch(() => {});
        }
        // Apply shared-link filters once (RV-02). A ?f= param carries the
        // sender's filter state; reproduce it after the viz is interactive.
        if (!appliedSharedRef.current && wb) {
          appliedSharedRef.current = true;
          const shared = decodeFilters(new URLSearchParams(window.location.search).get("f"));
          if (shared.length > 0) {
            const activeSheet = wb["activeSheet"] as AnyRecord | undefined;
            const applyFilter = activeSheet?.["applyFilterAsync"] as
              | ((f: string, v: string[], t: string) => Promise<unknown>)
              | undefined;
            if (applyFilter && activeSheet) {
              void (async () => {
                for (const sf of shared) {
                  // .call + lowercase enum (FX-01)
                  await applyFilter.call(activeSheet, sf.field, sf.values, "replace").catch(() => {});
                }
              })();
            }
          }
        }
        // Record this view in history (fire-and-forget)
        if (viewMeta) {
          void fetch("/api/views/record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(viewMeta),
            credentials: "include",
          }).catch(() => {});
        }
      });

      el.addEventListener("vizloaderror", (e: Event) => {
        setLoading(false);
        const raw = e as CustomEvent;
        // detail is a VizLoadErrorEvent instance — use getters directly (not JSON.stringify,
        // which returns {} because the properties are defined as non-enumerable getters).
        const detail = raw.detail as { errorCode?: unknown; message?: unknown } | null;
        const errorCode = String(detail?.errorCode ?? "unknown-auth-error");
        const errorMessage = String(detail?.message ?? "");
        console.error("[TableauVizShell] vizloaderror:", errorCode, errorMessage);

        // One silent re-mint on an auth failure (RV-04 / FX-02): re-mint the
        // token then force a clean remount (reloadNonce) with it — don't rely on
        // a property-set reviving an already-errored element. One retry per load.
        if ((errorCode === "unknown-auth-error" || errorCode === "auth-failed") && authRetryRef.current < 1) {
          authRetryRef.current += 1;
          void refetchToken().then((ok) => {
            if (ok) setReloadNonce((n) => n + 1);
          });
          return;
        }
        setErrorCode(errorCode);
        setError(errorMessage ? `${errorCode}: ${errorMessage}` : errorCode);
      });

      el.addEventListener("filterchanged", async (e: Event) => {
        const ev = e as CustomEvent<AnyRecord>;
        const detail = ev.detail as AnyRecord | null;
        const getFilter = detail?.["getFilterAsync"] as (() => Promise<AnyRecord>) | undefined;
        const filter = getFilter && detail ? await getFilter.call(detail).catch(() => null) : null;
        if (!filter) return;
        const fieldName = String(filter["fieldName"] ?? "");
        if (!fieldName) return;
        const chip = filterToChip(filter);
        const source: "ai" | "user" = aiFieldsRef.current.has(fieldName) ? "ai" : "user";
        // Functional merge so rapid filterchanged events don't clobber each
        // other; a cleared filter (chip === null) is removed entirely (FX-09).
        update((prev) => ({
          filters: [
            ...prev.filters.filter((f) => f.field !== fieldName),
            ...(chip ? [{ field: chip.field, values: chip.values, source }] : []),
          ],
        }));
      });

      // Keep the bridge's activeSheet in sync when the sheet changes (RV-01).
      el.addEventListener("tabswitched", (e: Event) => {
        const ev = e as CustomEvent<AnyRecord>;
        const name = String((ev.detail?.["newSheetName"] ?? ev.detail?.["sheetName"] ?? "") || "");
        if (name) update({ activeSheet: name });
      });

      el.addEventListener("markselectionchanged", async (e: Event) => {
        const ev = e as CustomEvent<AnyRecord>;
        const detail = ev.detail as AnyRecord | null;
        const getMarks = detail?.["getMarksAsync"] as (() => Promise<AnyRecord>) | undefined;
        const marks = getMarks && detail ? await getMarks.call(detail).catch(() => null) : null;
        update({ selectedMarks: readMarkRows(marks ?? null, 20) });
      });

      container.innerHTML = "";
      container.appendChild(el);
    }).catch((err: unknown) => {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to load Tableau CDN");
    });

    return () => { cancelled = true; container.innerHTML = ""; vizRef.current = null; };
    // token is intentionally NOT a dep (it's a ref). A refreshed token reaches
    // the viz only via a reloadNonce remount — bumped once after an auth error
    // (FX-02/C3). Changing the live element's token would reload it anyway, so we
    // remount deliberately instead, which also re-runs auth cleanly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, height, reloadNonce]);

  // Re-fit the Tableau viz when its container width changes (e.g. the AI panel
  // is toggled). The embedded <tableau-viz> lays out once at mount width and
  // does NOT reflow on its own, so a wider container leaves the viz at its old
  // width and forces a horizontal scrollbar. A ResizeObserver that fires a
  // window `resize` — plus nudging the element width — makes the viz recompute.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    let lastWidth = container.clientWidth;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? container.clientWidth;
      if (Math.abs(w - lastWidth) < 2) return; // ignore sub-pixel jitter
      lastWidth = w;
      // Debounce to the next frame so we react once per settled size.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = vizRef.current as unknown as HTMLElement | null;
        if (!el) return;
        // The web component listens for window resize to recompute its layout.
        window.dispatchEvent(new Event("resize"));
      });
    });
    ro.observe(container);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const isFill = height === "100%";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-sf-neutral-3 bg-white transition-shadow duration-base ${aiFlash ? "shadow-ai-change" : "shadow-elev-1"}`}
      style={isFill ? { width: "100%", height: "100%" } : { minHeight: height }}
    >
      {loading && (
        // Skeleton (RV-04 / FX-12): a shimmer that roughly mimics a dashboard —
        // a toolbar strip + a chart grid — instead of a bare spinner.
        <div className="absolute inset-0 z-10 flex flex-col gap-3 bg-sf-neutral-2 p-4" aria-busy="true" aria-label={t("embed.loading")}>
          <div className="h-7 w-1/3 motion-safe:animate-pulse rounded-md bg-sf-neutral-3" />
          <div className="grid flex-1 grid-cols-2 gap-3">
            <div className="motion-safe:animate-pulse rounded-lg bg-sf-neutral-3" />
            <div className="motion-safe:animate-pulse rounded-lg bg-sf-neutral-3" />
            <div className="motion-safe:animate-pulse rounded-lg bg-sf-neutral-3" />
            <div className="motion-safe:animate-pulse rounded-lg bg-sf-neutral-3" />
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center max-w-md w-full">
            <p className="text-body-sm font-semibold text-red-800 mb-1">{t("embed.errorTitle")}</p>
            {/* Everyone gets a human, localized line keyed off the error code… */}
            <p className="text-caption text-red-700">{t(embedErrorKey(errorCode))}</p>
            {/* …and internal users additionally see the raw technical detail (RV-04). */}
            {isInternal && error && <p className="mt-1 text-caption text-red-600 font-mono break-all">{error}</p>}
            <button
              onClick={() => {
                setError(null);
                setErrorCode(null);
                setLoading(true);
                authRetryRef.current = 0;
                void refetchToken().then((ok) => { if (ok) setReloadNonce((n) => n + 1); });
              }}
              className="mt-3 rounded-lg bg-red-100 px-4 py-1.5 text-caption font-medium text-red-800 hover:bg-red-200 transition-colors"
            >
              {t("embed.retry")}
            </button>
          </div>
          {isInternal && (
            <p className="text-caption text-sf-neutral-4 max-w-sm text-center">
              {t("embed.authHint")}
            </p>
          )}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: isFill ? "100%" : height }} />
      <SelectionAskFab locale={locale} />
    </div>
  );
}
