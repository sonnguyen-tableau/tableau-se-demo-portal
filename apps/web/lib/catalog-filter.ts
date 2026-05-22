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
