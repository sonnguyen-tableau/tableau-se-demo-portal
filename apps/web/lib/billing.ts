import { env } from "@/lib/env";

/**
 * Per-tenant daily impression counter — in-memory stub for Phase 2. Phase 6
 * swaps this for a durable store (Redis or Postgres) with cross-instance
 * accuracy. The interface here is intentionally async so the swap is invisible
 * to callers.
 */
const counters = new Map<string, { day: string; count: number }>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ImpressionStatus {
  tenantId: string;
  used: number;
  cap: number;
  remaining: number;
  blocked: boolean;
}

export async function recordImpression(tenantId: string): Promise<ImpressionStatus> {
  const day = today();
  const entry = counters.get(tenantId);
  const next = entry && entry.day === day ? { day, count: entry.count + 1 } : { day, count: 1 };
  counters.set(tenantId, next);
  const cap = env.IMPRESSION_DAILY_CAP_PER_TENANT;
  return {
    tenantId,
    used: next.count,
    cap,
    remaining: Math.max(0, cap - next.count),
    blocked: next.count > cap,
  };
}

export async function getImpressionStatus(tenantId: string): Promise<ImpressionStatus> {
  const day = today();
  const entry = counters.get(tenantId);
  const used = entry && entry.day === day ? entry.count : 0;
  const cap = env.IMPRESSION_DAILY_CAP_PER_TENANT;
  return { tenantId, used, cap, remaining: Math.max(0, cap - used), blocked: used >= cap };
}

export class ImpressionBudgetExceededError extends Error {
  constructor(public readonly status: ImpressionStatus) {
    super(
      `Impression budget exceeded for tenant ${status.tenantId}: ${status.used}/${status.cap}`,
    );
    this.name = "ImpressionBudgetExceededError";
  }
}

/**
 * Soft-enforced gate that runs at JWT-mint time. Increments the counter and
 * throws when the tenant has consumed its daily cap. The endpoint should
 * translate the exception into HTTP 429.
 */
export async function enforceImpressionBudget(tenantId: string): Promise<ImpressionStatus> {
  const status = await recordImpression(tenantId);
  if (status.blocked) throw new ImpressionBudgetExceededError(status);
  return status;
}
