"use client";

import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
  TableauViz,
  useTableauVizRef,
  useTableauVizFirstInteractiveCallback,
  useTableauVizFilterChangedCallback,
  useTableauVizMarksSelectedCallback,
  useTableauVizParameterChangedCallback,
  useTableauVizTabSwitchedCallback,
  useTableauVizCustomMarkContextMenuCallback,
} from "@tableau/embedding-api-react";
import { useVizContext, type VizAction, type VizActionResult } from "@/components/bridge/VizContextProvider";

interface Props {
  /** Canonical Tableau view URL — `tableauViewUrl()` builds this. */
  src: string;
  /** Initial JWT minted server-side; the component refreshes on auth error. */
  initialToken: string;
  /** Embedded viz height in CSS units. */
  height?: string;
}

/**
 * Client-only shell around `<TableauViz>` with:
 *   - automatic token refresh on `unknown-auth-error`
 *   - a stable container size (Tableau collapses without one)
 *   - first-interactive logging hook (Phase 4 wires this into the context bridge)
 */
// Lightweight readers for Tableau's untyped event payloads. We define them
// here rather than relying on the npm package's deeper types because the
// React wrapper does not export every event payload type publicly.
type AnyRecord = Record<string, unknown>;

function readMarkRows(
  marksRoot: AnyRecord | null,
  cap: number,
): Array<Record<string, string>> {
  if (!marksRoot) return [];
  const data = Array.isArray(marksRoot.data) ? (marksRoot.data as AnyRecord[]) : [];
  const out: Array<Record<string, string>> = [];
  for (const sheet of data) {
    const cols = Array.isArray(sheet.columns) ? (sheet.columns as AnyRecord[]) : [];
    const rows = Array.isArray(sheet.data) ? (sheet.data as AnyRecord[][]) : [];
    for (const row of rows) {
      const entry: Record<string, string> = {};
      cols.forEach((col, i) => {
        const cell = row[i] as AnyRecord | undefined;
        const fieldName = String((col as AnyRecord).fieldName ?? "");
        if (!fieldName) return;
        const v = cell ? String(cell.formattedValue ?? cell.value ?? "") : "";
        entry[fieldName] = v;
      });
      out.push(entry);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

export function TableauVizShell({ src, initialToken, height = "640px" }: Props): ReactElement {
  const vizRef = useTableauVizRef();
  const { update, askAi, snapshot, registerVizExecutor } = useVizContext();
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);

  // Register the agent-driven action executor. The chat route dispatches
  // viz_action SSE events; the chat panel forwards them via `applyVizAction`.
  useEffect(() => {
    return registerVizExecutor(async (action: VizAction): Promise<VizActionResult> => {
      const viz = vizRef.current;
      if (!viz) return { ok: false, error: "viz not ready" };
      const sheet = viz.workbook.activeSheet as unknown as {
        applyFilterAsync?: (field: string, values: string[], updateType: string) => Promise<unknown>;
        clearFilterAsync?: (field: string) => Promise<unknown>;
        selectMarksByValueAsync?: (
          values: Array<{ fieldName: string; value: string }>,
          updateType: string,
        ) => Promise<unknown>;
        clearSelectedMarksAsync?: () => Promise<unknown>;
      };
      const workbook = viz.workbook as unknown as {
        activateSheetAsync?: (sheet: string) => Promise<unknown>;
        changeParameterValueAsync?: (name: string, value: string) => Promise<unknown>;
      };
      try {
        switch (action.kind) {
          case "applyFilter":
            await sheet.applyFilterAsync?.(action.field, action.values, action.updateType ?? "REPLACE");
            return { ok: true };
          case "clearFilter":
            await sheet.clearFilterAsync?.(action.field);
            return { ok: true };
          case "selectMarks":
            await sheet.selectMarksByValueAsync?.(
              action.values.map((v) => ({ fieldName: action.field, value: v })),
              "REPLACE",
            );
            return { ok: true };
          case "clearSelectedMarks":
            await sheet.clearSelectedMarksAsync?.();
            return { ok: true };
          case "switchTab":
            await workbook.activateSheetAsync?.(action.sheetName);
            return { ok: true };
          case "setParameter":
            await workbook.changeParameterValueAsync?.(action.name, action.value);
            return { ok: true };
          default:
            return { ok: false, error: "unknown action kind" };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "action failed" };
      }
    });
  }, [registerVizExecutor, vizRef]);

  const onFirstInteractive = useTableauVizFirstInteractiveCallback(() => {
    const viz = vizRef.current;
    if (!viz) return;
    update({
      workbook: viz.workbook.name,
      activeSheet: viz.workbook.activeSheet.name,
      ready: true,
    });
  }, []);

  const onFilterChanged = useTableauVizFilterChangedCallback(async (event) => {
    const filter = (await (
      event.detail as unknown as { getFilterAsync?: () => Promise<AnyRecord> }
    ).getFilterAsync?.().catch(() => null)) as AnyRecord | null;
    if (!filter) return;
    const fieldName = String(filter.fieldName ?? "");
    if (!fieldName) return;
    const applied = Array.isArray(filter.appliedValues)
      ? (filter.appliedValues as AnyRecord[]).map((v) => String(v.value ?? ""))
      : [];
    const existing = snapshot().filters;
    update({
      filters: [...existing.filter((f) => f.field !== fieldName), { field: fieldName, values: applied }],
    });
  }, []);

  const onMarksSelected = useTableauVizMarksSelectedCallback(async (event) => {
    const marks = (await (
      event.detail as unknown as { getMarksAsync?: () => Promise<AnyRecord> }
    ).getMarksAsync?.().catch(() => null)) as AnyRecord | null;
    update({ selectedMarks: readMarkRows(marks, 20) });
  }, []);

  const onParameterChanged = useTableauVizParameterChangedCallback(async (event) => {
    const param = event.detail as unknown as AnyRecord;
    const name = typeof param.fieldName === "string" ? param.fieldName : null;
    const getter = param.getValueAsync as (() => Promise<AnyRecord>) | undefined;
    if (!name || !getter) return;
    const v = await getter().catch(() => null);
    if (!v) return;
    update({ parameters: { ...snapshot().parameters, [name]: String(v.value ?? "") } });
  }, []);

  const onTabSwitched = useTableauVizTabSwitchedCallback((event) => {
    const detail = event.detail as unknown as AnyRecord;
    const sheet = typeof detail.newSheetName === "string" ? detail.newSheetName : null;
    if (sheet) update({ activeSheet: sheet, selectedMarks: [], filters: [] });
  }, []);

  const onCustomContextMenu = useTableauVizCustomMarkContextMenuCallback(async (event) => {
    const detail = event.detail as unknown as AnyRecord;
    const menuId = typeof detail.menuId === "string" ? detail.menuId : null;
    if (menuId !== "ask-ai") return;
    const marks = (await (
      detail.getMarksAsync as (() => Promise<AnyRecord>) | undefined
    )?.().catch(() => null)) as AnyRecord | null;
    const rows = readMarkRows(marks, 5);
    const summary = rows
      .map((r) =>
        Object.entries(r)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
      )
      .join(" | ");
    askAi({
      source: "context-menu",
      prompt:
        summary.length > 0
          ? `Tell me about the selected mark(s): ${summary}. What's notable and what would you investigate next?`
          : "Tell me about the selected mark and what would you investigate next?",
    });
  }, []);

  const refetchToken = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/tableau/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["tableau:views:embed"] }),
        credentials: "include",
      });
      if (!res.ok) {
        setError(`Token refresh failed (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { token: string };
      setToken(data.token);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Token refresh failed");
    }
  }, []);

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  // Tableau emits the load-error event with a lowercase attribute name. We
  // listen via the ref so we don't depend on the React wrapper's prop casing.
  useEffect(() => {
    const viz = vizRef.current;
    if (!viz) return;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ message: string }>;
      try {
        const detail = JSON.parse(ev.detail.message) as { errorCode?: string };
        if (detail.errorCode === "unknown-auth-error") {
          void refetchToken();
          return;
        }
        setError(detail.errorCode ?? "Viz load failed");
      } catch {
        setError("Viz load failed");
      }
    };
    viz.addEventListener("vizloaderror", handler);
    return () => viz.removeEventListener("vizloaderror", handler);
  }, [refetchToken, vizRef]);

  return (
    <div className="w-full" style={{ minHeight: height }}>
      {error ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}{" "}
          <button onClick={() => void refetchToken()} className="ml-2 underline">
            Retry
          </button>
        </div>
      ) : null}
      <TableauViz
        ref={vizRef}
        src={src}
        token={token}
        toolbar="bottom"
        hideTabs
        height={height}
        onFirstInteractive={onFirstInteractive}
        onFilterChanged={onFilterChanged}
        onMarkSelectionChanged={onMarksSelected}
        onParameterChanged={onParameterChanged}
        onTabSwitched={onTabSwitched}
        onCustomMarkContextMenuEvent={onCustomContextMenu}
      />
    </div>
  );
}
