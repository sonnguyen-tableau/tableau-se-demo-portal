import { describe, expect, it } from "vitest";
import { filterPaletteItems, isViewRoute, type PaletteItem } from "./CommandPalette";

const ITEMS: PaletteItem[] = [
  { kind: "view", href: "/a", title: "Chi nhánh", subtitle: "Báo cáo vùng", projectName: "Sales" },
  { kind: "view", href: "/b", title: "Doanh thu", subtitle: "Tổng hợp", projectName: "Finance" },
  { kind: "workbook", href: "/c", title: "Overview", projectName: "Ops" },
];

describe("filterPaletteItems", () => {
  it("returns nothing for an empty query", () => {
    expect(filterPaletteItems(ITEMS, "")).toEqual([]);
    expect(filterPaletteItems(ITEMS, "   ")).toEqual([]);
  });

  it("matches diacritic-free queries against accented titles", () => {
    expect(filterPaletteItems(ITEMS, "chi nhanh").map((i) => i.href)).toEqual(["/a"]);
  });

  it("matches on project name", () => {
    expect(filterPaletteItems(ITEMS, "finance").map((i) => i.href)).toEqual(["/b"]);
  });

  it("matches on subtitle (workbook name)", () => {
    expect(filterPaletteItems(ITEMS, "tong hop").map((i) => i.href)).toEqual(["/b"]);
  });

  it("respects the result cap", () => {
    const many: PaletteItem[] = Array.from({ length: 20 }, (_, i) => ({
      kind: "view",
      href: `/x${i}`,
      title: `Report ${i}`,
      projectName: "P",
    }));
    expect(filterPaletteItems(many, "report", 8)).toHaveLength(8);
  });
});

describe("isViewRoute (FX-10)", () => {
  it("matches a report view route", () => {
    expect(isViewRoute("/t/acb/dashboards/overview/sales")).toBe(true);
    expect(isViewRoute("/t/acb/dashboards/overview/sales?f=abc")).toBe(true);
  });
  it("does not match the home, library, workbook, or agent routes", () => {
    expect(isViewRoute("/t/acb")).toBe(false);
    expect(isViewRoute("/t/acb/dashboards")).toBe(false);
    expect(isViewRoute("/t/acb/dashboards/overview")).toBe(false);
    expect(isViewRoute("/t/acb/agent")).toBe(false);
  });
});
