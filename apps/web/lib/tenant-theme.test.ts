import { describe, expect, it } from "vitest";
import {
  deleteTenantTheme,
  getTenantTheme,
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
});
