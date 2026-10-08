/**
 * Pure Tableau Embedding-API action executor (extracted from TableauVizShell for
 * testability — FX-01). Every method is called BOUND to its owner object
 * (`fn.call(owner, …)`): the v3 SDK models (Workbook/Worksheet/Dashboard) use
 * `this` internally, so a detached call (`const fn = obj.m; fn()`) throws. The
 * unit test uses class-based fakes that read `this`, which a plain-object mock
 * would not have caught.
 */
import type { VizAction, VizActionResult } from "@/components/bridge/VizContextProvider";

type AnyRecord = Record<string, unknown>;

export interface VizExecutorHooks {
  /** Tag a field as agent-applied (FilterChips "ai" tint). */
  markAiField: (field: string) => void;
  unmarkAiField: (field: string) => void;
  clearAiFields: () => void;
  /** Flash the brand ring after a successful agent action. */
  flashAiChange: () => void;
}

/**
 * Embedding API FilterUpdateType values are lowercase ("replace"/"add"/
 * "remove"); the agent tool uses the uppercase form. Normalize for the SDK (C2).
 */
export function sdkUpdateType(ut: string | undefined): string {
  return (ut ?? "REPLACE").toLowerCase();
}

/**
 * Worksheets to operate on for mark/filter clearing: a Dashboard's child
 * worksheets (clearSelectedMarksAsync / clearFilterAsync are Worksheet-only), or
 * the sheet itself when it is already a worksheet.
 */
export function worksheetTargets(sheet: AnyRecord | undefined): AnyRecord[] {
  const ws = sheet?.["worksheets"] as AnyRecord[] | undefined;
  if (Array.isArray(ws) && ws.length > 0) return ws;
  return sheet ? [sheet] : [];
}

async function priorFilterValues(sheet: AnyRecord | undefined, field: string): Promise<string[]> {
  const getFilters = sheet?.["getFiltersAsync"] as (() => Promise<AnyRecord[]>) | undefined;
  if (!getFilters || !sheet) return [];
  try {
    const filters = await getFilters.call(sheet);
    const f = filters.find((x) => String(x["fieldName"] ?? "") === field);
    return f && Array.isArray(f["appliedValues"])
      ? (f["appliedValues"] as AnyRecord[]).map((v) => String(v["value"] ?? ""))
      : [];
  } catch {
    return [];
  }
}

async function priorParamValue(workbook: AnyRecord | undefined, name: string): Promise<string | undefined> {
  const getParams = workbook?.["getParametersAsync"] as (() => Promise<AnyRecord[]>) | undefined;
  if (!getParams || !workbook) return undefined;
  try {
    const params = await getParams.call(workbook);
    const p = params.find((x) => String(x["name"] ?? "") === name);
    const cv = p?.["currentValue"] as AnyRecord | undefined;
    return cv ? String(cv["value"] ?? "") : undefined;
  } catch {
    return undefined;
  }
}

async function selectMarksByValue(target: AnyRecord, field: string, values: string[]): Promise<boolean> {
  const fn = target["selectMarksByValueAsync"] as ((sel: unknown[], type: string) => Promise<unknown>) | undefined;
  if (!fn) return false;
  await fn.call(target, [{ fieldName: field, value: values }], "select-replace");
  return true;
}

async function clearMarksOn(target: AnyRecord): Promise<boolean> {
  const fn = target["clearSelectedMarksAsync"] as (() => Promise<unknown>) | undefined;
  if (!fn) return false;
  await fn.call(target);
  return true;
}

async function clearFilterOn(target: AnyRecord, field: string): Promise<boolean> {
  const fn = target["clearFilterAsync"] as ((f: string) => Promise<unknown>) | undefined;
  if (!fn) return false;
  await fn.call(target, field);
  return true;
}

/** Execute one VizAction against the embedded viz. Reports the real outcome. */
export async function runVizAction(
  viz: AnyRecord | null,
  action: VizAction,
  hooks: VizExecutorHooks,
): Promise<VizActionResult> {
  if (!viz) return { ok: false, error: "viz not ready" };
  const workbook = viz["workbook"] as AnyRecord | undefined;
  const sheet = workbook?.["activeSheet"] as AnyRecord | undefined;
  const applyFilter = sheet?.["applyFilterAsync"] as ((f: string, v: string[], t: string) => Promise<unknown>) | undefined;
  const changeParam = workbook?.["changeParameterValueAsync"] as ((n: string, v: string) => Promise<unknown>) | undefined;
  const activate = workbook?.["activateSheetAsync"] as ((s: string) => Promise<unknown>) | undefined;

  const clearFilterAll = async (field: string): Promise<boolean> => {
    let any = false;
    for (const ws of worksheetTargets(sheet)) {
      if (await clearFilterOn(ws, field).catch(() => false)) any = true;
    }
    return any;
  };

  try {
    switch (action.kind) {
      case "applyFilter": {
        if (!applyFilter) return { ok: false, error: "filter not supported on this view" };
        const prior = await priorFilterValues(sheet, action.field);
        // Mark BEFORE awaiting the apply: the viz fires `filterchanged`
        // synchronously during applyFilterAsync, and the chip's source is read
        // from this set at that moment (FX-09).
        hooks.markAiField(action.field);
        try {
          await applyFilter.call(sheet, action.field, action.values, sdkUpdateType(action.updateType));
        } catch (e) {
          hooks.unmarkAiField(action.field);
          throw e;
        }
        hooks.flashAiChange();
        return {
          ok: true,
          undo: async () => {
            if (prior.length > 0) await applyFilter.call(sheet, action.field, prior, "replace");
            else await clearFilterAll(action.field);
            hooks.unmarkAiField(action.field);
          },
        };
      }
      case "clearFilter": {
        const prior = await priorFilterValues(sheet, action.field);
        const ok = await clearFilterAll(action.field);
        if (!ok) return { ok: false, error: "clear filter not supported on this view" };
        hooks.unmarkAiField(action.field);
        hooks.flashAiChange();
        return {
          ok: true,
          ...(prior.length > 0 && applyFilter
            ? { undo: async () => { await applyFilter.call(sheet, action.field, prior, "replace"); } }
            : {}),
        };
      }
      case "selectMarks": {
        let anyOk = false;
        for (const ws of worksheetTargets(sheet)) {
          try {
            if (await selectMarksByValue(ws, action.field, action.values)) anyOk = true;
          } catch {
            // ignore per-worksheet failures; report overall below
          }
        }
        if (!anyOk) return { ok: false, error: "highlight not supported on this view" };
        hooks.flashAiChange();
        return {
          ok: true,
          undo: async () => {
            for (const ws of worksheetTargets(sheet)) await clearMarksOn(ws).catch(() => false);
          },
        };
      }
      case "clearSelectedMarks": {
        let anyOk = false;
        for (const ws of worksheetTargets(sheet)) {
          if (await clearMarksOn(ws).catch(() => false)) anyOk = true;
        }
        return anyOk ? { ok: true } : { ok: false, error: "clear highlight not supported on this view" };
      }
      case "switchTab": {
        if (!activate) return { ok: false, error: "switch sheet not supported" };
        const prior = String(sheet?.["name"] ?? "");
        await activate.call(workbook, action.sheetName);
        hooks.flashAiChange();
        return { ok: true, ...(prior ? { undo: async () => { await activate.call(workbook, prior); } } : {}) };
      }
      case "setParameter": {
        if (!changeParam) return { ok: false, error: "parameter not supported" };
        const prior = await priorParamValue(workbook, action.name);
        await changeParam.call(workbook, action.name, action.value);
        hooks.flashAiChange();
        return {
          ok: true,
          ...(prior !== undefined ? { undo: async () => { await changeParam.call(workbook, action.name, prior); } } : {}),
        };
      }
      case "revertAll": {
        const revert = workbook?.["revertAllAsync"] as (() => Promise<unknown>) | undefined;
        if (!revert) return { ok: false, error: "reset not supported on this view" };
        await revert.call(workbook);
        hooks.clearAiFields();
        hooks.flashAiChange();
        return { ok: true };
      }
      case "refreshData": {
        const seen = new Set<string>();
        let any = false;
        for (const ws of worksheetTargets(sheet)) {
          const getDs = ws["getDataSourcesAsync"] as (() => Promise<AnyRecord[]>) | undefined;
          if (!getDs) continue;
          const dsList = await getDs.call(ws).catch(() => [] as AnyRecord[]);
          for (const ds of dsList) {
            const id = String(ds["id"] ?? ds["name"] ?? "");
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);
            const refresh = ds["refreshAsync"] as (() => Promise<unknown>) | undefined;
            if (refresh) {
              try {
                await refresh.call(ds);
                any = true;
              } catch {
                /* this datasource failed to refresh; others may still succeed */
              }
            }
          }
        }
        return any ? { ok: true } : { ok: false, error: "refresh not supported on this view" };
      }
      default:
        return { ok: false, error: "unknown action kind" };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "action failed" };
  }
}
