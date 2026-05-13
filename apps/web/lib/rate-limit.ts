/**
 * Sliding-window rate limiter (in-memory). Stub for Phase 6; replaced by a
 * Redis-backed implementation in production. The interface is async so the
 * swap is invisible.
 */

interface Window {
  timestamps: number[];
}

const buckets = new Map<string, Window>();

export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Maximum events allowed within the window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkAndRecord(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= opts.max) {
    const oldest = bucket.timestamps[0] ?? now;
    const retry = Math.ceil((windowMs - (now - oldest)) / 1000);
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retry) };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: opts.max - bucket.timestamps.length,
    retryAfterSeconds: 0,
  };
}

export function resetForTests(): void {
  buckets.clear();
}
