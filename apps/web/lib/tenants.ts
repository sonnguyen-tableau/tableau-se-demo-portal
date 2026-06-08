/**
 * Tenant registry. Phase 11 ships an in-memory store; Phase 12+ swaps for
 * Postgres. The interface is async so the swap is invisible.
 */

import { slugify } from "@/lib/tenant";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  industry: string;
  sourceUrl?: string;
  createdAt: string;
  /** "active" = visible; "archived" = soft-deleted. */
  status: "active" | "archived";
  /** ID of the SiteConfig this tenant is assigned to. Undefined = use deployment env vars. */
  siteId?: string;
}

const STORE = new Map<string, TenantRecord>();

// Seed two demo tenants so the admin UI is non-empty in dev.
function seed(): void {
  if (STORE.size > 0) return;
  const now = new Date().toISOString();
  STORE.set("tenant-acme", {
    id: "tenant-acme",
    slug: "tenant-acme",
    name: "Acme Bikes",
    industry: "retail-ecommerce",
    sourceUrl: "https://example.com/",
    createdAt: now,
    status: "active",
  });
  STORE.set("tenant-globex", {
    id: "tenant-globex",
    slug: "tenant-globex",
    name: "Globex Logistics",
    industry: "logistics",
    sourceUrl: "https://example.org/",
    createdAt: now,
    status: "active",
  });
}

export async function listTenants(): Promise<TenantRecord[]> {
  seed();
  return [...STORE.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTenant(slug: string): Promise<TenantRecord | undefined> {
  seed();
  return STORE.get(slug);
}

export async function upsertTenant(input: Partial<TenantRecord> & { name: string; industry: string }): Promise<TenantRecord> {
  seed();
  const slug = input.slug ?? slugify(input.name) ?? "tenant";
  const existing = STORE.get(slug);
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
  };
  STORE.set(slug, next);
  return next;
}

export async function deleteTenant(slug: string): Promise<boolean> {
  return STORE.delete(slug);
}

export async function archiveTenant(slug: string): Promise<TenantRecord | null> {
  const t = STORE.get(slug);
  if (!t) return null;
  const updated: TenantRecord = { ...t, status: "archived" };
  STORE.set(slug, updated);
  return updated;
}
