/**
 * Pinned dashboards/views per user (HL-03).
 * - Production (Vercel): Vercel KV, key `pins:{tenantId}:{email}`.
 * - Local dev (no KV): data/pins.json keyed by `{tenantId}:{email}`.
 *
 * Server-side only — never import from client components. The capacity cap is
 * enforced here (newest kept) so every write path stays bounded.
 */
import "server-only";

export const MAX_PINS = 12;

export interface PinnedItem {
  /** Stable id: `wb/view` for a view pin, `wb` for a whole-workbook pin. */
  key: string;
  kind: "view" | "workbook";
  workbookSlug: string;
  viewSlug?: string | undefined;
  /** Display title — view name (view pin) or workbook name (workbook pin). */
  title: string;
  workbookName: string;
  projectName: string;
  pinnedAt: number;
}

/** A pin as the client submits it — the server stamps `pinnedAt`. */
export type PinInput = Omit<PinnedItem, "pinnedAt">;

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function kvKey(tenantId: string, email: string): string {
  return `pins:${tenantId}:${email}`;
}
function fileKey(tenantId: string, email: string): string {
  return `${tenantId}:${email}`;
}

async function readFromKv(tenantId: string, email: string): Promise<PinnedItem[]> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<PinnedItem[]>(kvKey(tenantId, email));
  return Array.isArray(stored) ? stored : [];
}
async function writeToKv(tenantId: string, email: string, pins: PinnedItem[]): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(kvKey(tenantId, email), pins);
}

async function readStore(): Promise<Record<string, PinnedItem[]>> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  try {
    const raw = await readFile(join(process.cwd(), "data", "pins.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PinnedItem[]>) : {};
  } catch {
    return {};
  }
}
async function writeStore(store: Record<string, PinnedItem[]>): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const dir = join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "pins.json"), JSON.stringify(store, null, 2) + "\n", "utf-8");
}

/** List a user's pins, newest first. */
export async function getPins(tenantId: string, email: string): Promise<PinnedItem[]> {
  if (!email) return [];
  const pins = hasKv()
    ? await readFromKv(tenantId, email)
    : (await readStore())[fileKey(tenantId, email)] ?? [];
  return [...pins].sort((a, b) => b.pinnedAt - a.pinnedAt);
}

async function savePins(tenantId: string, email: string, pins: PinnedItem[]): Promise<void> {
  if (hasKv()) {
    await writeToKv(tenantId, email, pins);
  } else {
    const store = await readStore();
    store[fileKey(tenantId, email)] = pins;
    await writeStore(store);
  }
}

/**
 * Add (or move-to-top) a pin. Idempotent on `key`; keeps at most MAX_PINS
 * (newest wins — the oldest is dropped). Returns the updated list.
 */
export async function addPin(tenantId: string, email: string, item: PinnedItem): Promise<PinnedItem[]> {
  const current = await getPins(tenantId, email);
  const without = current.filter((p) => p.key !== item.key);
  const next = [item, ...without].slice(0, MAX_PINS);
  await savePins(tenantId, email, next);
  return next;
}

/** Remove a pin by key. Returns the updated list. */
export async function removePin(tenantId: string, email: string, key: string): Promise<PinnedItem[]> {
  const current = await getPins(tenantId, email);
  const next = current.filter((p) => p.key !== key);
  if (next.length !== current.length) await savePins(tenantId, email, next);
  return next;
}
