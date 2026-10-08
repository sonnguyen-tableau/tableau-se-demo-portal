/**
 * Thin wrapper around the Tableau REST API (v3.x).
 * Uses the service-account PAT from env to sign in once per request and
 * fetch projects + workbooks for the configured site.
 *
 * Supports multi-site: getLiveCatalog(tenantId?) resolves which Tableau site
 * to use via getSiteForTenant, with an env-var fallback for existing deploys.
 *
 * All calls are server-side only — never import from client components.
 */
import { env } from "@/lib/env";
import { tableauOrigin } from "@/lib/tableau-config";
import { getHiddenWorkbookIds } from "@/lib/catalog-filter";
import { getSiteForTenant, resolvedSiteOrigin, type ResolvedSite } from "@/lib/tenant-site";

// Tableau supports up to 3.24 at time of writing; 3.20 is widely available
const API_VERSION = "3.20";

interface SignInResponse {
  credentials: {
    token: string;
    site: { id: string; contentUrl: string };
  };
}

interface Project {
  id: string;
  name: string;
  parentProjectId?: string;
}

interface Workbook {
  id: string;
  name: string;
  contentUrl: string; // e.g. "Superstore"
  project: { id: string; name: string };
}

// /sites/{id}/views response shape
interface SiteView {
  id: string;
  name: string;
  contentUrl: string; // e.g. "Superstore/sheets/Overview"
  owner: { id: string };
  workbook: { id: string };
  updatedAt?: string; // ISO timestamp of the last view update (freshness, RV-01/RV-02)
}

export interface LiveProject {
  id: string;
  name: string;
  parentProjectId?: string | undefined;
}

export interface LiveDashboard {
  id: string;           // legacy slug (workbookContentUrl-viewName)
  workbookSlug: string; // slugified workbook contentUrl — used in URL
  viewSlug: string;     // slugified view name — used in URL
  name: string;         // human-readable view name (sheet title)
  workbookId: string;   // Tableau workbook UUID — used for hide/show filtering
  viewId: string;       // Tableau view LUID — used for the previewImage thumbnail (HL-01)
  workbookName: string;
  viewName: string;
  viewPath: string;     // "<workbookContentUrl>/<viewName>" for embed URL
  projectId: string;
  projectName: string;
  updatedAt?: string | undefined; // ISO last-updated, for the view-header freshness label (RV-01)
}

interface LiveCatalog {
  projects: LiveProject[];
  dashboards: LiveDashboard[];
  fetchedAt: number;
}

// ── In-memory cache per site (TTL = 5 min) ───────────────────────────────
interface CacheEntry {
  catalog: LiveCatalog;
  ts: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cacheBysite = new Map<string, CacheEntry>();
const _inFlightBySite = new Map<string, Promise<LiveCatalog>>();

// ── REST auth-session reuse (FX-07) ──────────────────────────────────────────
// Signing in costs a round-trip; a cold library load fires one previewImage
// request per card. Cache one PAT session per site (Tableau tokens live ~240
// min) and coalesce concurrent sign-ins, so 20 thumbnails make ≤ 1 sign-in.
interface RestAuth {
  token: string;
  siteId: string;
  ts: number;
}
const REST_AUTH_TTL_MS = 3 * 60 * 60 * 1000; // 3h — under Tableau's ~4h token life
const _authBySite = new Map<string, RestAuth>();
const _authInFlight = new Map<string, Promise<RestAuth>>();

async function getRestAuth(site: ResolvedSite, forceNew = false): Promise<RestAuth> {
  const key = site.tableauSiteName;
  if (!forceNew) {
    const cached = _authBySite.get(key);
    if (cached && Date.now() - cached.ts < REST_AUTH_TTL_MS) return cached;
    const inFlight = _authInFlight.get(key);
    if (inFlight) return inFlight;
  } else {
    _authBySite.delete(key);
  }
  const base = `${resolvedSiteOrigin(site)}/api/${API_VERSION}`;
  const promise = apiFetch<{ credentials: SignInResponse["credentials"] }>(`${base}/auth/signin`, {
    method: "POST",
    body: JSON.stringify({
      credentials: {
        personalAccessTokenName: env.TABLEAU_PAT_NAME,
        personalAccessTokenSecret: env.TABLEAU_PAT_SECRET,
        site: { contentUrl: site.tableauSiteName },
      },
    }),
  })
    .then((r) => {
      const auth: RestAuth = { token: r.credentials.token, siteId: r.credentials.site.id, ts: Date.now() };
      _authBySite.set(key, auth);
      _authInFlight.delete(key);
      return auth;
    })
    .catch((e) => {
      _authInFlight.delete(key);
      throw e;
    });
  _authInFlight.set(key, promise);
  return promise;
}

// Coalesce concurrent misses for the same view into one upstream fetch.
const _previewInFlight = new Map<string, Promise<{ bytes: ArrayBuffer; contentType: string }>>();

/** Clear the cached REST sessions + in-flight preview requests (tests only). */
export function __resetThumbnailCachesForTests(): void {
  _authBySite.clear();
  _authInFlight.clear();
  _previewInFlight.clear();
}

/**
 * Fetch the live catalog for the given tenant's Tableau site.
 * Pass tenantId to resolve via the site registry; omit to use env-var defaults.
 * Pass allowedProjects to restrict the returned projects+dashboards to those
 * whose project name matches (case-insensitive prefix or exact match).
 */
export async function getLiveCatalog(tenantId?: string, allowedProjects?: string[]): Promise<LiveCatalog> {
  const now = Date.now();

  // Resolve which site to use — always go through getSiteForTenant so the
  // env-var fallback is applied in one place (fromEnv() in tenant-site.ts).
  const site: ResolvedSite = tenantId
    ? await getSiteForTenant(tenantId)
    : await getSiteForTenant("");

  const cacheKey = site.tableauSiteName;

  const cached = _cacheBysite.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL_MS) return filterCatalog(cached.catalog, allowedProjects);

  const inFlight = _inFlightBySite.get(cacheKey);
  if (inFlight) return inFlight.then((c) => filterCatalog(c, allowedProjects));

  if (!env.TABLEAU_PAT_NAME || !env.TABLEAU_PAT_SECRET) {
    return { projects: [], dashboards: [], fetchedAt: now };
  }

  const promise = fetchFromTableau(site)
    .then((catalog) => {
      _cacheBysite.set(cacheKey, { catalog, ts: Date.now() });
      _inFlightBySite.delete(cacheKey);
      return catalog;
    })
    .catch((e) => {
      console.error(`[tableau-rest] Failed to fetch catalog for site ${cacheKey}:`, e);
      _inFlightBySite.delete(cacheKey);
      return _cacheBysite.get(cacheKey)?.catalog ?? { projects: [], dashboards: [], fetchedAt: Date.now() };
    });

  _inFlightBySite.set(cacheKey, promise);
  const catalog = await promise;
  return filterCatalog(catalog, allowedProjects);
}

/**
 * Filter a catalog to only include projects (and their dashboards) whose
 * name matches one of the allowedProjects entries.
 * Matching is case-insensitive and supports exact name or "Parent/Child" path.
 * If allowedProjects is empty/undefined, the full catalog is returned.
 */
function filterCatalog(catalog: LiveCatalog, allowedProjects?: string[]): LiveCatalog {
  if (!allowedProjects || allowedProjects.length === 0) return catalog;

  const allowed = new Set(allowedProjects.map((p) => p.toLowerCase().trim()));

  // Build parent-name lookup for path matching (e.g. "Demo/VinCommerce")
  const projectNameById = new Map(catalog.projects.map((p) => [p.id, p.name]));

  function projectPath(p: LiveProject): string {
    if (!p.parentProjectId) return p.name;
    const parentName = projectNameById.get(p.parentProjectId);
    return parentName ? `${parentName}/${p.name}` : p.name;
  }

  const allowedProjectIds = new Set(
    catalog.projects
      .filter((p) => {
        const name = p.name.toLowerCase();
        const path = projectPath(p).toLowerCase();
        return allowed.has(name) || allowed.has(path);
      })
      .map((p) => p.id),
  );

  return {
    ...catalog,
    projects: catalog.projects.filter((p) => allowedProjectIds.has(p.id)),
    dashboards: catalog.dashboards.filter((d) => allowedProjectIds.has(d.projectId)),
  };
}

/** Force-refresh a specific site's cache (or all sites if no key given). */
export function invalidateCatalogCache(siteName?: string) {
  if (siteName) {
    _cacheBysite.delete(siteName);
  } else {
    _cacheBysite.clear();
  }
}

export interface LiveWorkbook {
  id: string;
  name: string;
  contentUrl: string;
  projectId: string;
  projectName: string;
}

// Raw workbook cache — populated alongside the main catalog, never filtered
let _workbookCache: LiveWorkbook[] | null = null;

export function getCachedWorkbooks(): LiveWorkbook[] {
  return _workbookCache ?? [];
}

// ── Implementation ─────────────────────────────────────────────────────────

async function fetchFromTableau(site: ResolvedSite): Promise<LiveCatalog> {
  const origin = resolvedSiteOrigin(site);
  const base = `${origin}/api/${API_VERSION}`;

  // 1. Sign in
  const signInRes = await apiFetch<{ credentials: SignInResponse["credentials"] }>(
    `${base}/auth/signin`,
    {
      method: "POST",
      body: JSON.stringify({
        credentials: {
          personalAccessTokenName: env.TABLEAU_PAT_NAME,
          personalAccessTokenSecret: env.TABLEAU_PAT_SECRET,
          site: { contentUrl: site.tableauSiteName },
        },
      }),
    },
  );
  const token = signInRes.credentials.token;
  const siteId = signInRes.credentials.site.id;
  const headers = { "X-Tableau-Auth": token };

  // 2. Fetch all projects (paginated)
  const projects = await fetchAllPages<Project>(
    `${base}/sites/${siteId}/projects`,
    "projects.project",
    headers,
  );

  // 3. Fetch all workbooks (paginated) — for project mapping
  const workbooks = await fetchAllPages<Workbook>(
    `${base}/sites/${siteId}/workbooks`,
    "workbooks.workbook",
    headers,
  );

  // 4. Fetch all views (paginated) — contains contentUrl for embed
  const siteViews = await fetchAllPages<SiteView>(
    `${base}/sites/${siteId}/views`,
    "views.view",
    headers,
  );

  // 5. Sign out (fire and forget)
  void apiFetch(`${base}/auth/signout`, { method: "POST", headers }).catch(() => {});

  // 6. Build workbook lookup by id, excluding hidden workbooks
  const hiddenIds = await getHiddenWorkbookIds();
  // Populate raw workbook cache (unfiltered) for admin UI
  _workbookCache = workbooks.map((wb) => ({
    id: wb.id,
    name: wb.name,
    contentUrl: wb.contentUrl,
    projectId: wb.project.id,
    projectName: wb.project.name,
  }));
  const workbookById = new Map<string, Workbook>(
    workbooks.filter((wb) => !hiddenIds.has(wb.id)).map((wb) => [wb.id, wb]),
  );

  // 7. Build LiveDashboard list from views
  const dashboards: LiveDashboard[] = [];
  // Group views by workbook to determine whether to include workbook name in display
  const viewsPerWorkbook = new Map<string, number>();
  for (const v of siteViews) {
    viewsPerWorkbook.set(v.workbook.id, (viewsPerWorkbook.get(v.workbook.id) ?? 0) + 1);
  }

  for (const view of siteViews) {
    const wb = workbookById.get(view.workbook.id);
    if (!wb) continue;

    const viewPath = buildViewPath(wb.contentUrl, view.contentUrl);
    if (!viewPath) continue;

    const workbookSlug = slugify(wb.contentUrl);
    const viewSlug = slugify(view.name);
    dashboards.push({
      id: slugify(`${wb.contentUrl}-${view.name}`),
      workbookSlug,
      viewSlug,
      name: view.name,
      workbookId: wb.id,
      viewId: view.id,
      workbookName: wb.name,
      viewName: view.name,
      viewPath,
      projectId: wb.project.id,
      projectName: wb.project.name,
      ...(view.updatedAt ? { updatedAt: view.updatedAt } : {}),
    });
  }

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.parentProjectId ? { parentProjectId: p.parentProjectId } : {}),
    })),
    dashboards,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch a view's preview thumbnail (PNG) using the service-account PAT (HL-01).
 *
 * The PAT is a privileged service credential, so the CALLER MUST authorize the
 * request first — confirm the (workbookId, viewId) belongs to the requesting
 * user's visible catalog before calling this. Signs in to the view's site,
 * GETs .../workbooks/{workbookId}/views/{viewId}/previewImage, signs out, and
 * returns the raw bytes. Throws on a missing PAT or a non-200 response.
 */
export async function fetchViewPreviewImage(
  tenantId: string | undefined,
  workbookId: string,
  viewId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!env.TABLEAU_PAT_NAME || !env.TABLEAU_PAT_SECRET) {
    throw new Error("Tableau PAT not configured");
  }

  const site = await getSiteForTenant(tenantId ?? "");
  // Coalesce concurrent misses for the same (site, view) — the thumbnail route
  // can fire the same request from several card loads at once (FX-07).
  const flightKey = `${site.tableauSiteName}:${viewId}`;
  const inFlight = _previewInFlight.get(flightKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const base = `${resolvedSiteOrigin(site)}/api/${API_VERSION}`;
    // Reuse the cached session; on a 401 (token aged out) re-auth once.
    for (let attempt = 0; attempt < 2; attempt++) {
      const auth = await getRestAuth(site, attempt === 1);
      const res = await fetch(
        `${base}/sites/${auth.siteId}/workbooks/${encodeURIComponent(workbookId)}/views/${encodeURIComponent(viewId)}/previewImage`,
        { headers: { "X-Tableau-Auth": auth.token }, cache: "no-store" },
      );
      if (res.status === 401 && attempt === 0) continue; // stale token — force a fresh sign-in
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Tableau previewImage ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
      }
      return {
        bytes: await res.arrayBuffer(),
        contentType: res.headers.get("content-type") ?? "image/png",
      };
    }
    throw new Error("Tableau previewImage: authentication failed");
  })().finally(() => {
    _previewInFlight.delete(flightKey);
  });
  _previewInFlight.set(flightKey, promise);
  return promise;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    // Don't cache — we manage our own TTL
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tableau REST ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

type NestedPath = `${string}.${string}`;

async function fetchAllPages<T>(
  url: string,
  path: NestedPath,
  headers: Record<string, string>,
): Promise<T[]> {
  const pageSize = 100;
  const all: T[] = [];
  let pageNumber = 1;

  while (true) {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${separator}pageSize=${pageSize}&pageNumber=${pageNumber}`;
    const data = await apiFetch<Record<string, unknown>>(pageUrl, { headers });

    // Navigate the dotted path: "workbooks.workbook" → data.workbooks.workbook
    const [top, key] = path.split(".") as [string, string];
    const container = data[top] as Record<string, unknown> | undefined;
    const items = container?.[key];
    const arr = Array.isArray(items) ? (items as T[]) : [];
    all.push(...arr);

    // Check pagination
    const pagination = data["pagination"] as { pageNumber: string; pageSize: string; totalAvailable: string } | undefined;
    if (!pagination) break;
    const total = parseInt(pagination.totalAvailable, 10);
    if (all.length >= total) break;
    pageNumber++;
  }

  return all;
}

/**
 * Build the viewPath for the embed URL.
 * Tableau view contentUrl: "WorkbookName/sheets/SheetName"
 * We need: "WorkbookName/SheetName" (without /sheets/)
 */
function buildViewPath(workbookContentUrl: string, viewContentUrl: string): string | null {
  // viewContentUrl is like "Superstore/sheets/Overview"
  const parts = viewContentUrl.split("/sheets/");
  if (parts.length === 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  // Fallback: try workbookContentUrl + view name fragment
  const lastSegment = viewContentUrl.split("/").pop();
  if (lastSegment) {
    return `${workbookContentUrl}/${lastSegment}`;
  }
  return null;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
