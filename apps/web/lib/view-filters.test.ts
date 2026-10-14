import { describe, expect, it } from "vitest";
import { encodeFilters, decodeFilters, type SharedFilter } from "./view-filters";

describe("view-filters codec (RV-02 share link)", () => {
  it("round-trips filters, including Unicode values", () => {
    const filters: SharedFilter[] = [
      { field: "Region", values: ["EMEA", "APAC"] },
      { field: "Chi nhánh", values: ["Hà Nội", "Hồ Chí Minh"] },
    ];
    const encoded = encodeFilters(filters);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe, no +/=
    expect(decodeFilters(encoded)).toEqual(filters);
  });

  it("encodes empty / value-less filters to an empty string", () => {
    expect(encodeFilters([])).toBe("");
    expect(encodeFilters([{ field: "X", values: [] }])).toBe("");
  });

  it("decodes empty / malformed input to []", () => {
    expect(decodeFilters("")).toEqual([]);
    expect(decodeFilters(null)).toEqual([]);
    expect(decodeFilters("!!!not-base64!!!")).toEqual([]);
    expect(decodeFilters(btoa("not-an-array"))).toEqual([]);
  });

  it("drops entries missing a field or values on decode", () => {
    const encoded = encodeFilters([{ field: "Region", values: ["NA"] }]);
    expect(decodeFilters(encoded)).toEqual([{ field: "Region", values: ["NA"] }]);
  });

  it("bounds a hostile link: ≤20 fields, ≤100 values, ≤200 chars each (FX-12)", () => {
    const huge = Array.from({ length: 50 }, (_, i) => ({
      field: `F${i}`,
      values: Array.from({ length: 500 }, (_, j) => `v${j}`),
    }));
    const payload = btoa(JSON.stringify(huge.map((f) => ({ f: f.field, v: f.values }))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const decoded = decodeFilters(payload);
    expect(decoded.length).toBe(20);
    expect(decoded[0]!.values.length).toBe(100);
  });

  it("truncates over-long field/value strings on decode (FX-12)", () => {
    const payload = btoa(JSON.stringify([{ f: "x".repeat(500), v: ["y".repeat(500)] }]))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const decoded = decodeFilters(payload);
    expect(decoded[0]!.field.length).toBe(200);
    expect(decoded[0]!.values[0]!.length).toBe(200);
  });
});
