/**
 * Tenant registry — persisted to Vercel KV (prod) or data/tenants.json (dev).
 */

import { slugify } from "@/lib/tenant";
import { join } from "path";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  industry: string;
  sourceUrl?: string;
  createdAt: string;
  /** "active" = visible in portal list; "archived" = soft-deleted. */
  status: "active" | "archived";
  /** ID of the SiteConfig this tenant is assigned to. Undefined = use deployment env vars. */
  siteId?: string;
  /**
   * Tableau project folder names this tenant is allowed to see.
   * When set, the sidebar and catalog only show workbooks in these folders.
   * When undefined/empty, tenant sees ALL projects.
   * Example: ["Demo/VinCommerce"] or ["Banking", "Samples"]
   */
  allowedProjects?: string[];
  /**
   * When true, this tenant is the default landing portal shown at the root URL.
   * Only one tenant should have isDefault=true at a time.
   */
  isDefault?: boolean;
}

// ── Storage ───────────────────────────────────────────────────────────────────

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function kvKey(slug: string): string {
  return `tenant:${slug}`;
}

const INDEX_KEY = "tenant:__index__";

async function readIndexFromKv(): Promise<string[]> {
  const { kv } = await import("@vercel/kv");
  return (await kv.get<string[]>(INDEX_KEY)) ?? [];
}

async function writeIndexToKv(slugs: string[]): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(INDEX_KEY, slugs);
}

async function readFromKv(slug: string): Promise<TenantRecord | null> {
  const { kv } = await import("@vercel/kv");
  return kv.get<TenantRecord>(kvKey(slug));
}

async function writeToKv(t: TenantRecord): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(kvKey(t.slug), t);
  const index = await readIndexFromKv();
  if (!index.includes(t.slug)) {
    await writeIndexToKv([...index, t.slug]);
  }
}

async function deleteFromKv(slug: string): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.del(kvKey(slug));
  const index = await readIndexFromKv();
  await writeIndexToKv(index.filter((s) => s !== slug));
}

async function readAllFromFile(): Promise<Map<string, TenantRecord>> {
  const { readFile } = await import("fs/promises");
  try {
    const raw = await readFile(join(process.cwd(), "data", "tenants.json"), "utf-8");
    const arr = JSON.parse(raw) as TenantRecord[];
    return new Map(arr.map((t) => [t.slug, t]));
  } catch {
    return new Map();
  }
}

async function writeAllToFile(store: Map<string, TenantRecord>): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const dir = join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  const arr = [...store.values()].sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(dir, "tenants.json"), JSON.stringify(arr, null, 2) + "\n", "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantRecord[]> {
  // Merge KV + file: file gives the baseline set of tenants shipped with the
  // deploy; KV overrides per-slug when the admin has edited a record. Without
  // the merge, tenants added to the seed file after the initial KV populate
  // (e.g. `mediamart` on 2026-06-30) never appear until an explicit re-seed.
  const fileStore = await readAllFromFile();
  const merged = new Map<string, TenantRecord>(fileStore);

  if (hasKv()) {
    const index = await readIndexFromKv();
    if (index.length > 0) {
      const records = await Promise.all(index.map(readFromKv));
      for (const r of records) {
        if (r !== null) merged.set(r.slug, r);
      }
    }
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTenant(slug: string): Promise<TenantRecord | undefined> {
  if (hasKv()) {
    const fromKv = await readFromKv(slug);
    if (fromKv !== null) return fromKv;
    // KV miss — fall back to bundled data/tenants.json so allowedProjects works
    // even before the first seed run.
  }
  const store = await readAllFromFile();
  return store.get(slug);
}

export async function upsertTenant(
  input: Partial<TenantRecord> & { name: string; industry: string },
): Promise<TenantRecord> {
  const slug = input.slug ?? slugify(input.name) ?? "tenant";
  const existing = await getTenant(slug);
  const next: TenantRecord = {
    id: slug,
    slug,
    name: input.name.slice(0, 120),
    industry: input.industry,
    ...(input.sourceUrl !== undefined
      ? { sourceUrl: input.sourceUrl }
      : existing?.sourceUrl !== undefined
        ? { sourceUrl: existing.sourceUrl }
        : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    status: input.status ?? existing?.status ?? "active",
    ...(input.siteId !== undefined
      ? { siteId: input.siteId }
      : existing?.siteId !== undefined
        ? { siteId: existing.siteId }
        : {}),
    ...(input.allowedProjects !== undefined
      ? { allowedProjects: input.allowedProjects }
      : existing?.allowedProjects !== undefined
        ? { allowedProjects: existing.allowedProjects }
        : {}),
    ...(input.isDefault !== undefined
      ? { isDefault: input.isDefault }
      : existing?.isDefault !== undefined
        ? { isDefault: existing.isDefault }
        : {}),
  };

  if (hasKv()) {
    await writeToKv(next);
  } else {
    const store = await readAllFromFile();
    store.set(slug, next);
    await writeAllToFile(store);
  }
  return next;
}

export async function setDefaultTenant(slug: string): Promise<void> {
  const all = await listTenants();
  await Promise.all(
    all.map((t) => {
      const shouldBeDefault = t.slug === slug;
      if (!!t.isDefault === shouldBeDefault) return Promise.resolve();
      return upsertTenant({ ...t, isDefault: shouldBeDefault });
    }),
  );
}

export async function getDefaultTenant(): Promise<TenantRecord | undefined> {
  const all = await listTenants();
  return all.find((t) => t.isDefault && t.status === "active");
}

export async function deleteTenant(slug: string): Promise<boolean> {
  const existing = await getTenant(slug);
  if (!existing) return false;
  if (hasKv()) {
    await deleteFromKv(slug);
  } else {
    const store = await readAllFromFile();
    store.delete(slug);
    await writeAllToFile(store);
  }
  return true;
}

export async function archiveTenant(slug: string): Promise<TenantRecord | null> {
  const t = await getTenant(slug);
  if (!t) return null;
  return upsertTenant({ ...t, status: "archived" });
}
