/**
 * Persist hidden workbook IDs.
 * - Production (Vercel): uses Vercel KV (Redis)
 * - Local dev (no KV_REST_API_URL): falls back to data/hidden-workbooks.json
 *
 * Server-side only — never import from client components.
 */

const KV_KEY = "hidden-workbook-ids";

async function readIdsFromKv(): Promise<Set<string>> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<string[]>(KV_KEY);
  return new Set<string>(Array.isArray(stored) ? stored : []);
}

async function writeIdsToKv(ids: string[]): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(KV_KEY, ids);
}

async function readIdsFromFile(): Promise<Set<string>> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  try {
    const raw = await readFile(join(process.cwd(), "data", "hidden-workbooks.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set<string>(parsed as string[]);
  } catch {
    // missing or malformed — treat as empty
  }
  return new Set<string>();
}

async function writeIdsToFile(ids: string[]): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const dir = join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "hidden-workbooks.json"),
    JSON.stringify(ids, null, 2) + "\n",
    "utf-8",
  );
}

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getHiddenWorkbookIds(): Promise<Set<string>> {
  return hasKv() ? readIdsFromKv() : readIdsFromFile();
}

/**
 * Returns a combined filter: workbook is visible when it passes BOTH:
 *  1. Not in the global hidden set
 *  2. In the user's allowlist (if the user has one)
 *
 * Returns null when no filtering is needed (user sees all non-hidden workbooks).
 */
export async function getVisibleWorkbookIds(
  userEmail: string,
  tenantId?: string,
  allowedProjects?: string[],
): Promise<Set<string> | null> {
  if (!userEmail) return null;

  let hidden: Set<string>;
  let userAllowed: Set<string> | null;

  try {
    const { getWorkbookFilter } = await import("@/lib/portal-users");
    [hidden, userAllowed] = await Promise.all([
      getHiddenWorkbookIds(),
      getWorkbookFilter(userEmail),
    ]);
  } catch {
    // KV unavailable — don't restrict anything
    return null;
  }

  if (userAllowed === null && hidden.size === 0) return null; // fast path: no filtering

  // We need the full workbook list to compute the intersection.
  // getLiveCatalog() ensures the cache is warm.
  //
  // NOTE: pass tenantId but NOT allowedProjects here — the dashboards page
  // (page.tsx) already intersects visibleIds with the catalog it fetched
  // separately (with allowedProjects applied). If we pass allowedProjects
  // to both call sites we get a double-filter that can zero out the result
  // when the catalog cache is stale w.r.t. the allowedProjects config.
  const { getLiveCatalog } = await import("@/lib/tableau-rest");
  const catalog = await getLiveCatalog(tenantId);
  const all = catalog.dashboards.map((d) => d.workbookId);

  const visible = new Set(
    all.filter((id) => {
      if (hidden.has(id)) return false;
      if (userAllowed !== null && !userAllowed.has(id)) return false;
      return true;
    }),
  );
  return visible;
}

export async function setHiddenWorkbookIds(ids: string[]): Promise<void> {
  if (hasKv()) {
    await writeIdsToKv(ids);
  } else {
    await writeIdsToFile(ids);
  }
  // Bust the tableau-rest in-memory cache
  const { invalidateCatalogCache } = await import("@/lib/tableau-rest");
  invalidateCatalogCache();
}
