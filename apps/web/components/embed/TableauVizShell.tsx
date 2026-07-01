"use client";

import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useVizContext, type VizAction, type VizActionResult } from "@/components/bridge/VizContextProvider";

interface Props {
  src: string;
  initialToken: string;
  height?: string;
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

export function TableauVizShell({ src, initialToken, height = "700px", viewMeta }: Props): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<AnyRecord | null>(null);
  const { update, snapshot, registerVizExecutor } = useVizContext();
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchToken = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/tableau/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["tableau:views:embed"] }),
        credentials: "include",
      });
      if (!res.ok) { setError(`Token refresh failed (HTTP ${res.status})`); return; }
      const data = (await res.json()) as { token: string };
      setToken(data.token);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token refresh failed");
    }
  }, []);

  useEffect(() => { setToken(initialToken); }, [initialToken]);

  useEffect(() => {
    return registerVizExecutor(async (action: VizAction): Promise<VizActionResult> => {
      const viz = vizRef.current;
      if (!viz) return { ok: false, error: "viz not ready" };
      const sheet = (viz["workbook"] as AnyRecord | undefined)?.["activeSheet"] as AnyRecord | undefined;
      const workbook = viz["workbook"] as AnyRecord | undefined;
      try {
        switch (action.kind) {
          case "applyFilter":
            await (sheet?.applyFilterAsync as ((f: string, v: string[], t: string) => Promise<unknown>) | undefined)?.(action.field, action.values, action.updateType ?? "REPLACE");
            return { ok: true };
          case "clearFilter":
            await (sheet?.clearFilterAsync as ((f: string) => Promise<unknown>) | undefined)?.(action.field);
            return { ok: true };
          case "switchTab":
            await (workbook?.activateSheetAsync as ((s: string) => Promise<unknown>) | undefined)?.(action.sheetName);
            return { ok: true };
          case "setParameter":
            await (workbook?.changeParameterValueAsync as ((n: string, v: string) => Promise<unknown>) | undefined)?.(action.name, action.value);
            return { ok: true };
          default:
            return { ok: false, error: "unknown action kind" };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "action failed" };
      }
    });
  }, [registerVizExecutor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    // Derive origin from src URL for CDN loading
    let origin = "https://prod-apsoutheast-c.online.tableau.com";
    try { origin = new URL(src).origin; } catch { /* keep default */ }

    loadTableauCdn(origin).then(() => {
      const viz = document.createElement("tableau-viz") as unknown as AnyRecord;
      const el = viz as unknown as HTMLElement;

      // Set as properties (not attributes) for proper web component initialization
      viz["src"] = src;
      viz["token"] = token;
      viz["toolbar"] = "bottom";
      viz["hideTabs"] = true;
      // Force desktop layout regardless of container width — otherwise Tableau
      // auto-picks Phone (min-height 700) when container drops below ~1400px,
      // producing a stacked scroll view instead of the intended dashboard grid.
      viz["device"] = "desktop";
      el.style.cssText = `width:100%;height:${height};`;

      el.addEventListener("firstinteractive", () => {
        setLoading(false);
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

        if (errorCode === "unknown-auth-error") {
          void refetchToken();
          return;
        }
        setError(errorMessage ? `${errorCode}: ${errorMessage}` : errorCode);
      });

      el.addEventListener("filterchanged", async (e: Event) => {
        const ev = e as CustomEvent<AnyRecord>;
        const filter = await (ev.detail?.["getFilterAsync"] as (() => Promise<AnyRecord>) | undefined)?.().catch(() => null);
        if (!filter) return;
        const fieldName = String(filter["fieldName"] ?? "");
        if (!fieldName) return;
        const applied = Array.isArray(filter["appliedValues"])
          ? (filter["appliedValues"] as AnyRecord[]).map((v) => String(v["value"] ?? ""))
          : [];
        update({ filters: [...snapshot().filters.filter((f) => f.field !== fieldName), { field: fieldName, values: applied }] });
      });

      el.addEventListener("markselectionchanged", async (e: Event) => {
        const ev = e as CustomEvent<AnyRecord>;
        const marks = await (ev.detail?.["getMarksAsync"] as (() => Promise<AnyRecord>) | undefined)?.().catch(() => null);
        update({ selectedMarks: readMarkRows(marks ?? null, 20) });
      });

      container.innerHTML = "";
      container.appendChild(el);
    }).catch((err: unknown) => {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Failed to load Tableau CDN");
    });

    return () => { container.innerHTML = ""; vizRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, token, height]);

  const isFill = height === "100%";

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm"
      style={isFill ? { width: "100%", height: "100%" } : { minHeight: height }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Đang tải dashboard…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center max-w-md w-full">
            <p className="text-sm font-semibold text-red-800 mb-1">Lỗi tải dashboard</p>
            <p className="text-xs text-red-600 font-mono break-all">{error}</p>
            <button
              onClick={() => { setError(null); setLoading(true); void refetchToken(); }}
              className="mt-3 rounded-lg bg-red-100 px-4 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 transition-colors"
            >
              Thử lại
            </button>
          </div>
          <p className="text-xs text-slate-400 max-w-sm text-center">
            Nếu là lỗi xác thực, kiểm tra <code>localhost:3000</code> đã được thêm vào danh sách domain của Connected App trên Tableau Cloud chưa.
          </p>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: isFill ? "100%" : height }} />
    </div>
  );
}
