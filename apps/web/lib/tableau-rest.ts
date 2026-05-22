/**
 * Thin wrapper around the Tableau REST API (v3.x).
 * Uses the service-account PAT from env to sign in once per request and
 * fetch projects + workbooks for the configured site.
 *
 * All calls are server-side only — never import from client components.
 */
import { env } from "@/lib/env";
import { tableauOrigin } from "@/lib/tableau-config";
import { getHiddenWorkbookIds } from "@/lib/catalog-filter";

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
  workbookName: string;
  viewName: string;
  viewPath: string;     // "<workbookContentUrl>/<viewName>" for embed URL
  projectId: string;
  projectName: string;
}

interface LiveCatalog {
  projects: LiveProject[];
  dashboards: LiveDashboard[];
  fetchedAt: number;
}

// ── In-memory cache (per process, TTL = 5 min) ────────────────────────────
let _cache: LiveCatalog | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// In-flight deduplication: concurrent callers share one fetch instead of
// each triggering a separate PAT sign-in (which would cause 401s).
let _inFlight: Promise<LiveCatalog> | null = null;

export async function getLiveCatalog(): Promise<LiveCatalog> {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;
  if (_inFlight) return _inFlight;

  if (!env.TABLEAU_PAT_NAME || !env.TABLEAU_PAT_SECRET) {
    return { projects: [], dashboards: [], fetchedAt: now };
  }

  _inFlight = fetchFromTableau()
    .then((catalog) => {
      _cache = catalog;
      _cacheTs = Date.now();
      _inFlight = null;
      return catalog;
    })
    .catch((e) => {
      console.error("[tableau-rest] Failed to fetch live catalog:", e);
      _inFlight = null;
      return _cache ?? { projects: [], dashboards: [], fetchedAt: Date.now() };
    });

  return _inFlight;
}

/** Force-refresh ignoring TTL (useful for a manual refresh button later) */
export function invalidateCatalogCache() {
  _cache = null;
  _cacheTs = 0;
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

async function fetchFromTableau(): Promise<LiveCatalog> {
  const origin = tableauOrigin();
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
          site: { contentUrl: env.TABLEAU_SITE_NAME },
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
      workbookName: wb.name,
      viewName: view.name,
      viewPath,
      projectId: wb.project.id,
      projectName: wb.project.name,
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
