---
name: Portal Catalog Isolation
description: Use when working with per-portal Tableau folder filtering — allowedProjects, getLiveCatalog, KV/file storage, seed/reset flow, or the admin Portal Catalog UI. Covers the in-memory cache bug, correct call patterns, and the theme+tenant config system.
---

# Portal Catalog Isolation

Use this skill when touching `getLiveCatalog`, `TenantRecord.allowedProjects`, the admin portal catalog UI, theme configuration, or the KV/JSON persistence layer.

## The Core Invariant

Every call to `getLiveCatalog` in a tenant-scoped page **must** pass `allowedProjects`:

```ts
// ✅ Correct
const tenantRecord = await getTenant(tenantSlug);
const catalog = await getLiveCatalog(ctx?.tenantId, tenantRecord?.allowedProjects);

// ❌ Wrong — shows full Tableau site to everyone
const catalog = await getLiveCatalog(ctx?.tenantId);
```

Pages that need this: `page.tsx`, `dashboards/page.tsx`, `dashboards/[wb]/page.tsx`, `dashboards/[wb]/[view]/page.tsx`.

Layout (`layout.tsx`) already does this correctly — but child pages render independently and must each load their own filtered catalog.

## Why the cache doesn't save you

`_cacheBysite` in `tableau-rest.ts` is keyed by **Tableau site name** — shared across all portals on the same site. If portal A loads first and populates cache, portal B hits the cache and gets portal A's unfiltered catalog. `filterCatalog()` must be called at every return path:

```ts
// tableau-rest.ts — all three paths apply the filter
if (cached) return filterCatalog(cached.catalog, allowedProjects);       // cache hit
if (inFlight) return inFlight.then(c => filterCatalog(c, allowedProjects)); // in-flight
return filterCatalog(freshCatalog, allowedProjects);                       // fresh fetch
```

## allowedProjects path matching

- `["Demo/Vincom Retail"]` — matches the project named "Vincom Retail" inside "Demo"
- `["Vincom Retail"]` — matches any top-level project named "Vincom Retail"
- Case-insensitive, exact match or Parent/Child path
- Empty array or `undefined` → no filter, show full site

## KV + file storage

| Operation | Code |
|---|---|
| Read tenant | `getTenant(slug)` → KV first, file fallback on null |
| Write tenant | `upsertTenant(input)` |
| Read theme | `getTenantTheme(tenantId)` → KV first, file fallback |
| Write theme | `setTenantTheme(input)` |
| Force reset KV | `POST /api/admin/seed?force=true` |

KV keys: `tenant:{slug}`, `tenant-theme:{tenantId}`, `tenant:__index__`

File fallback was added in `e8b590b` — before that, KV miss = "not found". Now KV miss = check bundled JSON file.

## Admin UI flow

1. `/admin/portals` → `PortalCatalogManager` component
2. "Gắn folders" expands the row — shows checkboxes from `/api/admin/tableau/demo-projects`
3. Check/uncheck folders → "Lưu cấu hình" → `PATCH /api/admin/tenants/{slug}` with `{ allowedProjects: [...] }`
4. KV updated immediately; next page load sees new filter

## TenantTheme fields

```ts
interface TenantTheme {
  tenantId: string;
  companyName: string;
  primaryColor: string;       // --brand-primary CSS var
  secondaryColor: string;     // --brand-secondary
  neutralColor: string;       // --brand-neutral (sidebar background)
  sidebarTextColor: string;   // --sidebar-text (text on sidebar, default #ffffff)
  fontFamily: string;
  logoUrl?: string;
  tone: "professional" | "playful" | "technical";
}
```

Sidebar text uses `color-mix(in srgb, var(--sidebar-text, #fff) X%, transparent)` — never `text-white` hardcoded.

## Seed route reference

`POST /api/admin/seed` — idempotent upsert (KV merge)
`POST /api/admin/seed?force=true` — delete KV keys first, then write clean values

Use `?force=true` when KV has stale data from old admin edits. Source of truth for demo portals is the `TENANTS`/`THEMES` arrays in `apps/web/app/api/admin/seed/route.ts`.
