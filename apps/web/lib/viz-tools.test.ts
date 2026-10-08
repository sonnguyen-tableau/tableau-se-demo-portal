import { describe, expect, it } from "vitest";
import { VIZ_TOOLS, VIZ_TOOL_NAMES, isVizToolName } from "./viz-tools";

describe("VIZ_TOOL_NAMES (FX-04 validation allowlist)", () => {
  it("matches the actual VIZ_TOOLS names exactly (kept in sync)", () => {
    expect([...VIZ_TOOL_NAMES].sort()).toEqual(VIZ_TOOLS.map((t) => t.name).sort());
  });

  it("every allowlisted name is recognized as a viz tool", () => {
    for (const n of VIZ_TOOL_NAMES) expect(isVizToolName(n)).toBe(true);
  });

  it("rejects a spoofed name", () => {
    expect((VIZ_TOOL_NAMES as readonly string[]).includes("query-datasource")).toBe(false);
  });
});
