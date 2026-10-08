import { describe, expect, it } from "vitest";
import { sanitizeVegaSpec } from "./VegaChart";

describe("sanitizeVegaSpec (FX-04)", () => {
  it("strips a top-level remote data loader but keeps inline values", () => {
    const spec = {
      mark: "bar",
      data: { url: "https://attacker.example/steal.csv" },
      encoding: { x: { field: "a" } },
    };
    const out = sanitizeVegaSpec(spec) as { data: Record<string, unknown>; mark: string };
    expect("url" in out.data).toBe(false);
    expect(out.mark).toBe("bar");
  });

  it("preserves data.values (the normal agent path)", () => {
    const spec = { mark: "line", data: { values: [{ x: 1, y: 2 }] } };
    const out = sanitizeVegaSpec(spec) as { data: { values: unknown[] } };
    expect(out.data.values).toEqual([{ x: 1, y: 2 }]);
  });

  it("strips url nested inside layers and transform.lookup", () => {
    const spec = {
      layer: [
        { mark: "line", data: { values: [{ x: 1 }] } },
        { mark: "point", data: { url: "https://x/evil" } },
      ],
      transform: [{ lookup: "k", from: { data: { url: "http://y/evil" }, key: "k" } }],
    };
    const out = sanitizeVegaSpec(spec);
    expect(JSON.stringify(out)).not.toContain("evil");
    expect(JSON.stringify(out)).toContain('"x":1');
  });

  it("does not mutate the input spec", () => {
    const spec = { data: { url: "https://x/evil" } };
    sanitizeVegaSpec(spec);
    expect(spec.data.url).toBe("https://x/evil");
  });
});
