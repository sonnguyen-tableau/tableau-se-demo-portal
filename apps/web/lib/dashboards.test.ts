import { describe, expect, it } from "vitest";
import { DASHBOARD_CATALOG, getDashboard, listDashboardsForTenant } from "./dashboards";

describe("dashboard catalog", () => {
  it("has unique ids", () => {
    const ids = new Set(DASHBOARD_CATALOG.map((d) => d.id));
    expect(ids.size).toBe(DASHBOARD_CATALOG.length);
  });

  it("listDashboardsForTenant filters internal scope", () => {
    const visible = listDashboardsForTenant({ isInternal: false });
    expect(visible.every((d) => d.scope === "all")).toBe(true);
  });

  it("listDashboardsForTenant exposes internal scope to internal users", () => {
    const visible = listDashboardsForTenant({ isInternal: true });
    expect(visible.some((d) => d.scope === "internal")).toBe(true);
  });

  it("getDashboard returns the correct entry", () => {
    const d = getDashboard("retail-executive");
    expect(d?.industry).toBe("retail");
    expect(getDashboard("missing")).toBeUndefined();
  });
});
