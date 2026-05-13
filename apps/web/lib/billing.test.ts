import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    IMPRESSION_DAILY_CAP_PER_TENANT: 3,
    PORTAL_ENV: "dev",
  },
}));

import {
  ImpressionBudgetExceededError,
  enforceImpressionBudget,
  getImpressionStatus,
  recordImpression,
} from "./billing";

describe("billing impression budget", () => {
  const fresh = () => `t-${Math.random().toString(36).slice(2, 10)}`;

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts at zero for a new tenant", async () => {
    const status = await getImpressionStatus(fresh());
    expect(status.used).toBe(0);
    expect(status.cap).toBe(3);
    expect(status.blocked).toBe(false);
  });

  it("increments on recordImpression", async () => {
    const t = fresh();
    await recordImpression(t);
    await recordImpression(t);
    const status = await getImpressionStatus(t);
    expect(status.used).toBe(2);
    expect(status.remaining).toBe(1);
  });

  it("throws ImpressionBudgetExceededError when over cap", async () => {
    const t = fresh();
    await enforceImpressionBudget(t);
    await enforceImpressionBudget(t);
    await enforceImpressionBudget(t);
    await expect(enforceImpressionBudget(t)).rejects.toBeInstanceOf(
      ImpressionBudgetExceededError,
    );
  });

  it("isolates tenants", async () => {
    const a = fresh();
    const b = fresh();
    await recordImpression(a);
    await recordImpression(a);
    const sa = await getImpressionStatus(a);
    const sb = await getImpressionStatus(b);
    expect(sa.used).toBe(2);
    expect(sb.used).toBe(0);
  });
});
