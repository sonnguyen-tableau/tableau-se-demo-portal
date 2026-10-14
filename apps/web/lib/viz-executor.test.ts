import { describe, expect, it, vi } from "vitest";
import { runVizAction, sdkUpdateType, type VizExecutorHooks } from "./viz-executor";

/**
 * CLASS-based fakes whose methods read `this` — exactly like the real Embedding
 * API models. A plain-object mock would pass even with the C1 unbound-call bug,
 * so the executor MUST call every method bound to its owner (fn.call(owner,…)).
 */
class FakeWorksheet {
  readonly name: string;
  readonly _impl = { tag: "ws" };
  applied: Array<{ field: string; values: string[]; updateType: string }> = [];
  cleared: string[] = [];
  marks: Array<{ field: string; values: string[] }> = [];
  marksCleared = 0;
  refreshed = 0;
  private _filters: Array<{ fieldName: string; appliedValues: { value: string }[] }>;
  constructor(name: string, filters: Record<string, string[]> = {}) {
    this.name = name;
    this._filters = Object.entries(filters).map(([fieldName, vals]) => ({
      fieldName,
      appliedValues: vals.map((value) => ({ value })),
    }));
  }
  async applyFilterAsync(field: string, values: string[], updateType: string) {
    if (!this._impl) throw new TypeError("detached: this is undefined"); // the C1 trap
    this.applied.push({ field, values, updateType });
  }
  async clearFilterAsync(field: string) {
    if (!this._impl) throw new TypeError("detached");
    this.cleared.push(field);
  }
  async getFiltersAsync() {
    if (!this._impl) throw new TypeError("detached");
    return this._filters;
  }
  async selectMarksByValueAsync(sel: Array<{ fieldName: string; value: string[] }>, type: string) {
    if (!this._impl || type !== "select-replace") throw new TypeError("detached/bad-type");
    this.marks.push({ field: sel[0]!.fieldName, values: sel[0]!.value });
  }
  async clearSelectedMarksAsync() {
    if (!this._impl) throw new TypeError("detached");
    this.marksCleared += 1;
  }
  async getDataSourcesAsync() {
    if (!this._impl) throw new TypeError("detached");
    return [new FakeDataSource(this)];
  }
}

class FakeDataSource {
  readonly id = "ds-1";
  readonly _impl = { tag: "ds" };
  constructor(private ws: FakeWorksheet) {}
  async refreshAsync() {
    if (!this._impl) throw new TypeError("detached");
    this.ws.refreshed += 1;
  }
}

class FakeDashboard {
  readonly name = "Dash";
  readonly _impl = { tag: "dash" };
  constructor(public worksheets: FakeWorksheet[]) {}
  // Dashboard-level applyFilter fans out to its worksheets.
  async applyFilterAsync(field: string, values: string[], updateType: string) {
    if (!this._impl) throw new TypeError("detached");
    for (const ws of this.worksheets) await ws.applyFilterAsync(field, values, updateType);
  }
  async getFiltersAsync() {
    if (!this._impl) throw new TypeError("detached");
    return this.worksheets[0]!.getFiltersAsync();
  }
}

class FakeWorkbook {
  readonly _impl = { tag: "wb" };
  activeSheet: FakeDashboard;
  reverted = 0;
  activated: string[] = [];
  params: Record<string, string>;
  constructor(dash: FakeDashboard, params: Record<string, string> = {}) {
    this.activeSheet = dash;
    this.params = params;
  }
  get name() {
    return "WB";
  }
  async activateSheetAsync(name: string) {
    if (!this._impl) throw new TypeError("detached");
    this.activated.push(name);
  }
  async changeParameterValueAsync(name: string, value: string) {
    if (!this._impl) throw new TypeError("detached");
    this.params[name] = value;
  }
  async getParametersAsync() {
    if (!this._impl) throw new TypeError("detached");
    return Object.entries(this.params).map(([name, v]) => ({ name, currentValue: { value: v } }));
  }
  async revertAllAsync() {
    if (!this._impl) throw new TypeError("detached");
    this.reverted += 1;
  }
}

function fakes(opts: { filters?: Record<string, string[]>; params?: Record<string, string> } = {}) {
  const ws1 = new FakeWorksheet("ws1", opts.filters);
  const ws2 = new FakeWorksheet("ws2", opts.filters);
  const dash = new FakeDashboard([ws1, ws2]);
  const wb = new FakeWorkbook(dash, opts.params);
  const viz = { workbook: wb } as unknown as Record<string, unknown>;
  return { viz, wb, dash, ws1, ws2 };
}

function hooks(): VizExecutorHooks & { ai: Set<string>; flashes: number } {
  const ai = new Set<string>();
  const h = {
    ai,
    flashes: 0,
    markAiField: (f: string) => ai.add(f),
    unmarkAiField: (f: string) => ai.delete(f),
    clearAiFields: () => ai.clear(),
    flashAiChange: vi.fn(() => {
      h.flashes += 1;
    }),
  };
  return h;
}

describe("sdkUpdateType", () => {
  it("lowercases the enum (C2)", () => {
    expect(sdkUpdateType("REPLACE")).toBe("replace");
    expect(sdkUpdateType("ADD")).toBe("add");
    expect(sdkUpdateType(undefined)).toBe("replace");
  });
});

describe("runVizAction (bound calls — C1)", () => {
  it("returns ok:false when there is no viz", async () => {
    expect(await runVizAction(null, { kind: "revertAll" }, hooks())).toEqual({ ok: false, error: "viz not ready" });
  });

  it("applies a dashboard filter with the lowercase enum and tags the field ai", async () => {
    const { viz, dash } = fakes();
    const h = hooks();
    const res = await runVizAction(viz, { kind: "applyFilter", field: "Region", values: ["EMEA"] }, h);
    expect(res.ok).toBe(true);
    expect(dash.worksheets[0]!.applied).toEqual([{ field: "Region", values: ["EMEA"], updateType: "replace" }]);
    expect(h.ai.has("Region")).toBe(true);
    expect(h.flashes).toBe(1);
  });

  it("undo restores the prior filter values (not a blind clear)", async () => {
    const { viz, dash } = fakes({ filters: { Region: ["NA", "APAC"] } });
    const res = await runVizAction(viz, { kind: "applyFilter", field: "Region", values: ["EMEA"] }, hooks());
    await res.undo!();
    const applied = dash.worksheets[0]!.applied;
    expect(applied.at(-1)).toEqual({ field: "Region", values: ["NA", "APAC"], updateType: "replace" });
  });

  it("clears a filter across both worksheets of a dashboard", async () => {
    const { viz, ws1, ws2 } = fakes({ filters: { Region: ["NA"] } });
    const res = await runVizAction(viz, { kind: "clearFilter", field: "Region" }, hooks());
    expect(res.ok).toBe(true);
    expect(ws1.cleared).toEqual(["Region"]);
    expect(ws2.cleared).toEqual(["Region"]);
  });

  it("selects marks (select-replace) on each worksheet", async () => {
    const { viz, ws1, ws2 } = fakes();
    const res = await runVizAction(viz, { kind: "selectMarks", field: "Country", values: ["DE"] }, hooks());
    expect(res.ok).toBe(true);
    expect(ws1.marks).toEqual([{ field: "Country", values: ["DE"] }]);
    expect(ws2.marks).toEqual([{ field: "Country", values: ["DE"] }]);
    await res.undo!();
    expect(ws1.marksCleared).toBe(1);
  });

  it("activates a sheet and reverts all", async () => {
    const { viz, wb } = fakes();
    expect((await runVizAction(viz, { kind: "switchTab", sheetName: "Detail" }, hooks())).ok).toBe(true);
    expect(wb.activated).toEqual(["Detail"]);
    expect((await runVizAction(viz, { kind: "revertAll" }, hooks())).ok).toBe(true);
    expect(wb.reverted).toBe(1);
  });

  it("sets a parameter and undo restores the prior value", async () => {
    const { viz, wb } = fakes({ params: { Year: "2024" } });
    const res = await runVizAction(viz, { kind: "setParameter", name: "Year", value: "2025" }, hooks());
    expect(wb.params["Year"]).toBe("2025");
    await res.undo!();
    expect(wb.params["Year"]).toBe("2024");
  });

  it("refreshes data sources", async () => {
    const { viz, ws1 } = fakes();
    expect((await runVizAction(viz, { kind: "refreshData" }, hooks())).ok).toBe(true);
    expect(ws1.refreshed).toBe(1);
  });

  it("reports ok:false when a method is absent on the view", async () => {
    const viz = { workbook: { _impl: {}, activeSheet: { _impl: {}, name: "x" } } } as unknown as Record<string, unknown>;
    expect((await runVizAction(viz, { kind: "applyFilter", field: "R", values: ["x"] }, hooks())).ok).toBe(false);
    expect((await runVizAction(viz, { kind: "switchTab", sheetName: "y" }, hooks())).ok).toBe(false);
  });
});
