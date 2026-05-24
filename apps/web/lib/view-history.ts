/**
 * Tracks per-user recent views and per-workbook view counts.
 * Stored in KV; gracefully no-ops if KV is unavailable.
 */

const RECENT_KEY = (email: string) => `recent-views:${email}`;
const POPULAR_KEY = "popular-views";
const MAX_RECENT = 10;

export interface RecentView {
  workbookSlug: string;
  viewSlug: string;
  workbookName: string;
  viewName: string;
  projectName: string;
  viewedAt: number;
}

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/** Record a view — call from the embed page when a view loads. */
export async function recordView(
  email: string,
  view: Omit<RecentView, "viewedAt">,
): Promise<void> {
  if (!hasKv() || !email) return;
  try {
    const { kv } = await import("@vercel/kv");
    const key = RECENT_KEY(email);

    // Update recent views
    const stored = await kv.get<RecentView[]>(key);
    const existing = Array.isArray(stored) ? stored : [];
    const deduped = existing.filter(
      (v) => !(v.workbookSlug === view.workbookSlug && v.viewSlug === view.viewSlug),
    );
    const next: RecentView[] = [{ ...view, viewedAt: Date.now() }, ...deduped].slice(
      0,
      MAX_RECENT,
    );
    await kv.set(key, next, { ex: 60 * 60 * 24 * 30 }); // 30 days TTL

    // Increment popular counter — use a hash: workbookId → count
    const countKey = `${view.workbookSlug}/${view.viewSlug}`;
    await kv.hincrby(POPULAR_KEY, countKey, 1);
  } catch {
    // Never block the page render
  }
}

/** Get recent views for a user. */
export async function getRecentViews(email: string): Promise<RecentView[]> {
  if (!hasKv() || !email) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const stored = await kv.get<RecentView[]>(RECENT_KEY(email));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export interface PopularView {
  workbookSlug: string;
  viewSlug: string;
  count: number;
}

/** Get top N most-viewed workbook/view pairs. */
export async function getPopularViews(top = 6): Promise<PopularView[]> {
  if (!hasKv()) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const hash = await kv.hgetall<Record<string, number>>(POPULAR_KEY);
    if (!hash) return [];
    return Object.entries(hash)
      .map(([key, count]) => {
        const [workbookSlug, viewSlug] = key.split("/");
        return { workbookSlug: workbookSlug ?? "", viewSlug: viewSlug ?? "", count: Number(count) };
      })
      .filter((v) => v.workbookSlug && v.viewSlug)
      .sort((a, b) => b.count - a.count)
      .slice(0, top);
  } catch {
    return [];
  }
}
