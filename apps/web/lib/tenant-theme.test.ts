import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_THEME,
  deleteTenantTheme,
  ensureContrastOnWhite,
  getTenantTheme,
  hexToRgbTriplet,
  resolveChartPalette,
  setTenantTheme,
  themeToCssVariables,
} from "./tenant-theme";

describe("tenant-theme", () => {
  it("returns defaults when none stored", async () => {
    const t = await getTenantTheme("missing");
    expect(t.primaryColor).toBe("#0176d3");
    expect(t.tone).toBe("professional");
  });

  it("stores valid hex and rejects invalid", async () => {
    await setTenantTheme({ tenantId: "t-a", primaryColor: "#ABCDEF", secondaryColor: "not-a-color" });
    const t = await getTenantTheme("t-a");
    expect(t.primaryColor).toBe("#abcdef");
    // invalid secondary is rejected → keeps the default (#f5a623)
    expect(t.secondaryColor).toBe("#f5a623");
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

  it("persists a tagline, preserves it across unrelated updates, and clears on empty (SH-05)", async () => {
    const t = await setTenantTheme({ tenantId: "t-tag", tagline: "Retail Intelligence" });
    expect(t.tagline).toBe("Retail Intelligence");
    const t2 = await setTenantTheme({ tenantId: "t-tag", primaryColor: "#111111" });
    expect(t2.tagline).toBe("Retail Intelligence"); // unrelated update keeps it
    const t3 = await setTenantTheme({ tenantId: "t-tag", tagline: "" });
    expect(t3.tagline).toBe(""); // empty clears it → sidebar falls back to the generic label
    await deleteTenantTheme("t-tag");
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

describe("color math", () => {
  it("hexToRgbTriplet parses #rrggbb to a space-separated triplet", () => {
    expect(hexToRgbTriplet("#0176d3")).toBe("1 118 211");
    expect(hexToRgbTriplet("#000000")).toBe("0 0 0");
    expect(hexToRgbTriplet("#ffffff")).toBe("255 255 255");
    // uppercase is accepted
    expect(hexToRgbTriplet("#F5B400")).toBe("245 180 0");
    // malformed → SF Blue fallback
    expect(hexToRgbTriplet("nope")).toBe("1 118 211");
  });

  it("contrastRatio matches known WCAG pairs", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // order does not matter
    expect(contrastRatio("#0176d3", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#0176d3"),
      5,
    );
    // SF Blue clears AA on white
    expect(contrastRatio("#0176d3", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("ensureContrastOnWhite keeps a dark-enough color and darkens a light one", () => {
    // already AA on white → unchanged (lowercased)
    expect(ensureContrastOnWhite("#0176d3")).toBe("#0176d3");
    // amber fails AA as text on white → darkened until it passes
    const darkened = ensureContrastOnWhite("#f5b400");
    expect(darkened).not.toBe("#f5b400");
    expect(contrastRatio(darkened, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("derives on-primary and primary-text for a low-contrast primary (#f5b400)", () => {
    const css = themeToCssVariables({
      tenantId: "t-amber",
      ...DEFAULT_THEME,
      primaryColor: "#f5b400",
    });
    // white text fails on amber → dark ink
    expect(css).toMatch(/--brand-on-primary: #0b1220;/);
    // rgb triplet emitted for alpha utilities
    expect(css).toMatch(/--brand-primary-rgb: 245 180 0;/);
    // brand text var is present and AA-legible on white
    const m = /--brand-primary-text: (#[0-9a-f]{6});/.exec(css);
    expect(m).not.toBeNull();
    expect(contrastRatio(m![1]!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("derives white on-primary for the default blue and emits alpha triplets", () => {
    const css = themeToCssVariables({ tenantId: "t-blue", ...DEFAULT_THEME });
    expect(css).toMatch(/--brand-on-primary: #ffffff;/);
    expect(css).toMatch(/--brand-primary-rgb: 1 118 211;/);
    expect(css).toMatch(/--brand-neutral-rgb: 3 45 96;/);
    expect(css).toMatch(/--brand-primary-hover: color-mix\(in oklab/);
    expect(css).toMatch(/--brand-primary-subtle: color-mix\(in oklab/);
  });
});

// ── Sidebar contrast (FX-08) ─────────────────────────────────────────────────
// Sidebar text is `var(--sidebar-text)` at some opacity over the sidebar bg
// (= brand-neutral, the lightest end of its gradient). Secondary text must stay
// ≥ 65% so it clears WCAG AA (4.5:1) on BOTH the dark default and the light
// preset — the SH-02 regression was 40–58% mixes failing on a light sidebar.
function blendOver(fg: string, bg: string, alpha: number): string {
  const parse = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const f = parse(fg);
  const b = parse(bg);
  const mix = [0, 1, 2].map((i) => Math.round(f[i as 0]! * alpha + b[i as 0]! * (1 - alpha)));
  return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("");
}

describe("sidebar contrast (FX-08)", () => {
  const PRESETS = [
    { name: "dark default (#032d60 / #ffffff)", bg: "#032d60", text: "#ffffff" },
    { name: "light preset (#ffffff / #1f2937)", bg: "#ffffff", text: "#1f2937" },
  ];

  for (const p of PRESETS) {
    it(`full + 65% sidebar text clears AA on ${p.name}`, () => {
      expect(contrastRatio(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(blendOver(p.text, p.bg, 0.65), p.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("documents why ≥65% is required: 50% fails AA on the light preset", () => {
    expect(contrastRatio(blendOver("#1f2937", "#ffffff", 0.5), "#ffffff")).toBeLessThan(4.5);
  });
});
