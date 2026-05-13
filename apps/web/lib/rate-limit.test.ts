import { beforeEach, describe, expect, it } from "vitest";
import { checkAndRecord, resetForTests } from "./rate-limit";

describe("rate limiter", () => {
  beforeEach(() => resetForTests());

  it("allows up to max requests in the window", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkAndRecord("k", { windowSeconds: 60, max: 3 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks the (max+1)th request", async () => {
    for (let i = 0; i < 3; i++) await checkAndRecord("k", { windowSeconds: 60, max: 3 });
    const r = await checkAndRecord("k", { windowSeconds: 60, max: 3 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys isolate independently", async () => {
    for (let i = 0; i < 3; i++) await checkAndRecord("a", { windowSeconds: 60, max: 3 });
    const r = await checkAndRecord("b", { windowSeconds: 60, max: 3 });
    expect(r.allowed).toBe(true);
  });
});
