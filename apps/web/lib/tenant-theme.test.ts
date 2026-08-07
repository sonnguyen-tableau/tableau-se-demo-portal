import { describe, expect, it } from "vitest";
import {
  deleteTenantTheme,
  getTenantTheme,
  resolveChartPalette,
  setTenantTheme,
  themeToCssVariables,
} from "./tenant-theme";

describe("tenant-theme", () => {
  it("returns defaults when none stored", async () => {
    const t = await getTenantTheme("missing");
    expect(t.primaryColor).toBe("#1a56db");
    expect(t.tone).toBe("professional");
  });

  it("stores valid hex and rejects invalid", async () => {
    await setTenantTheme({ tenantId: "t-a", primaryColor: "#ABCDEF", secondaryColor: "not-a-color" });
    const t = await getTenantTheme("t-a");
    expect(t.primaryColor).toBe("#abcdef");
    expect(t.secondaryColor).toBe("#f59e0b");
    await deleteTenantTheme("t-a");
  });

  it("themeToCssVariables emits expected CSS variable names", async () => {
    const t = await setTenantTheme({ tenantId: "t-b" });
    const css = themeToCssVariables(t);
    expect(css).toMatch(/--brand-primary:/);
    expect(css).toMatch(/--brand-secondary:/);
    expect(css).toMatch(/--brand-neutral:/);
    expect(css).toMatch(/--font-sans:/);
    await deleteTenantTheme("t-b");
  });

  it("accepts logoUrl and tone", async () => {
    const t = await setTenantTheme({
      tenantId: "t-c",
      logoUrl: "https://example.com/logo.png",
      tone: "playful",
    });
    expect(t.logoUrl).toBe("https://example.com/logo.png");
    expect(t.tone).toBe("playful");
    await deleteTenantTheme("t-c");
  });

  it("persists heroVariant and rejects invalid ones", async () => {
    const t = await setTenantTheme({ tenantId: "t-hero", heroVariant: "editorial" });
    expect(t.heroVariant).toBe("editorial");
    // invalid value is ignored → keeps the previously stored one
    const t2 = await setTenantTheme({ tenantId: "t-hero", heroVariant: "nope" as never });
    expect(t2.heroVariant).toBe("editorial");
    await deleteTenantTheme("t-hero");
  });

  it("sanitizes a stored chartPalette to valid lowercased hex", async () => {
    const t = await setTenantTheme({
      tenantId: "t-pal",
      chartPalette: ["#ABCDEF", "not-a-color", "#123456"],
    });
    expect(t.chartPalette).toEqual(["#abcdef", "#123456"]);
    await deleteTenantTheme("t-pal");
  });

  it("resolveChartPalette derives a brand-led palette when none stored", () => {
    const pal = resolveChartPalette({
      primaryColor: "#0176d3",
      secondaryColor: "#f5a623",
      neutralColor: "#032d60",
    });
    expect(pal).toHaveLength(8);
    // brand colors lead the palette
    expect(pal.slice(0, 3)).toEqual(["#0176d3", "#f5a623", "#032d60"]);
  });

  it("resolveChartPalette uses a stored palette and pads to 8", () => {
    const pal = resolveChartPalette({
      primaryColor: "#0176d3",
      secondaryColor: "#f5a623",
      neutralColor: "#032d60",
      chartPalette: ["#111111", "#222222"],
    });
    expect(pal).toHaveLength(8);
    expect(pal[0]).toBe("#111111");
    expect(pal[1]).toBe("#222222");
    // padding cycles through the seed
    expect(pal[2]).toBe("#111111");
  });

  it("themeToCssVariables emits chart palette vars", async () => {
    const t = await setTenantTheme({ tenantId: "t-css" });
    const css = themeToCssVariables(t);
    expect(css).toMatch(/--brand-chart-1:/);
    expect(css).toMatch(/--brand-chart-8:/);
    await deleteTenantTheme("t-css");
  });
});
