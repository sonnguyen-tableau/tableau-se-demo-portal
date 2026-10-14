import { describe, expect, it } from "vitest";
import { filterToChip } from "./viz-filter-chip";

describe("filterToChip (FX-09)", () => {
  it("maps a categorical filter to its applied values (prefers formattedValue)", () => {
    expect(
      filterToChip({
        fieldName: "Region",
        filterType: "categorical",
        appliedValues: [{ value: "n", formattedValue: "North" }, { value: "s", formattedValue: "South" }],
      }),
    ).toEqual({ field: "Region", values: ["North", "South"] });
  });

  it("returns null for an all-selected categorical filter (no active state → no chip)", () => {
    expect(
      filterToChip({ fieldName: "Region", filterType: "categorical", isAllSelected: true, appliedValues: [] }),
    ).toBeNull();
  });

  it("returns null for an empty categorical filter", () => {
    expect(filterToChip({ fieldName: "Region", filterType: "categorical", appliedValues: [] })).toBeNull();
  });

  it("renders a quantitative/range filter as min – max", () => {
    expect(
      filterToChip({
        fieldName: "Sales",
        filterType: "quantitative",
        minValue: { value: 0, formattedValue: "0" },
        maxValue: { value: 1000, formattedValue: "1,000" },
      }),
    ).toEqual({ field: "Sales", values: ["0 – 1,000"] });
  });

  it("renders a relative-date filter as min – max", () => {
    expect(
      filterToChip({
        fieldName: "Order Date",
        filterType: "relative-date",
        min: { formattedValue: "Jan 2026" },
        max: { formattedValue: "Mar 2026" },
      }),
    ).toEqual({ field: "Order Date", values: ["Jan 2026 – Mar 2026"] });
  });

  it("returns null when there is no field name", () => {
    expect(filterToChip({ filterType: "categorical", appliedValues: [{ value: "x" }] })).toBeNull();
  });
});
