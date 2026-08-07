import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/env.ts is a module-scoped singleton, so each case resets modules and the
 * relevant env vars, then re-imports fresh. Covers the Heroku build fix: strict
 * at runtime, permissive during `next build`.
 */
describe("env", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("throws at runtime when AUTH_SECRET is missing", async () => {
    delete process.env.NEXT_PHASE;
    delete process.env.AUTH_SECRET;
    await expect(import("./env")).rejects.toThrow(/Invalid environment configuration/);
  });

  it("passes at runtime with a valid AUTH_SECRET", async () => {
    delete process.env.NEXT_PHASE;
    process.env.AUTH_SECRET = "x".repeat(40);
    const mod = await import("./env");
    expect(mod.env.PORTAL_ENV).toBe("dev");
  });

  it("does NOT throw during next build even without AUTH_SECRET", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.AUTH_SECRET;
    const mod = await import("./env");
    // Build stub keeps real defaults for other fields …
    expect(mod.env.PORTAL_ENV).toBe("dev");
    expect(mod.env.IMPRESSION_DAILY_CAP_PER_TENANT).toBe(2000);
  });
});
