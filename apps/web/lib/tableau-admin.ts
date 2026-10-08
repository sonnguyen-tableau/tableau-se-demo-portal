/**
 * Destructive Tableau Cloud admin operations — project deletion for the
 * cascading tenant-delete flow, and existence checks for the drift-sync
 * endpoint. Kept separate from the read-only `tableau-rest.ts` so
 * destructive-capable code is easy to find, audit, and permission-gate.
 *
 * Server-side only — never import from client components.
 */
import { env } from "@/lib/env";
import { getSiteForTenant, resolvedSiteOrigin, type ResolvedSite } from "@/lib/tenant-site";
import { getLiveCatalog, invalidateCatalogCache } from "@/lib/tableau-rest";

const API_VERSION = "3.20";

interface SignInCredentials {
  token: string;
  siteId: string;
}

interface RawProject {
  id: string;
  name: string;
  parentProjectId?: string;
}

export interface DeleteProjectResult {
  deleted: boolean;
  projectId?: string;
  error?: string;
}

interface SignInResult {
  session: { base: string; creds: SignInCredentials } | null;
  /** Set only when session is null, so callers can report the real cause
   * (missing PAT vs. a failed sign-in call) instead of a single generic
   * message. Tableau PATs disallow concurrent sessions for the same token
   * (see Tableau docs: "Users can't request concurrent Tableau Server
   * sessions with a PAT") — two admin calls firing within the same instant
   * can transiently 401 here; this is a real Tableau-side constraint, not a
   * bug, but the error message should say so rather than claim "not
   * configured" when the PAT env vars were actually present. */
  error?: string;
}

async function signIn(site: ResolvedSite): Promise<SignInResult> {
  if (!env.TABLEAU_PAT_NAME || !env.TABLEAU_PAT_SECRET) {
    return { session: null, error: "Tableau PAT not configured" };
  }
  const origin = resolvedSiteOrigin(site);
  const base = `${origin}/api/${API_VERSION}`;
  const res = await fetch(`${base}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      credentials: {
        personalAccessTokenName: env.TABLEAU_PAT_NAME,
        personalAccessTokenSecret: env.TABLEAU_PAT_SECRET,
        site: { contentUrl: site.tableauSiteName },
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { session: null, error: `Tableau sign-in failed: HTTP ${res.status} ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { credentials: { token: string; site: { id: string } } };
  return { session: { base, creds: { token: data.credentials.token, siteId: data.credentials.site.id } } };
}

async function signOut(base: string, token: string): Promise<void> {
  await fetch(`${base}/auth/signout`, {
    method: "POST",
    headers: { "X-Tableau-Auth": token },
    cache: "no-store",
  }).catch(() => {});
}

async function fetchAllProjects(base: string, siteId: string, token: string): Promise<RawProject[]> {
  const headers = { "X-Tableau-Auth": token, Accept: "application/json" };
  const pageSize = 100;
  const all: RawProject[] = [];
  let pageNumber = 1;
  while (true) {
    const res = await fetch(
      `${base}/sites/${siteId}/projects?pageSize=${pageSize}&pageNumber=${pageNumber}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) break;
    const data = (await res.json()) as {
      projects?: { project?: RawProject[] };
      pagination?: { totalAvailable: string };
    };
    const page = data.projects?.project ?? [];
    all.push(...page);
    const total = data.pagination ? parseInt(data.pagination.totalAvailable, 10) : all.length;
    if (all.length >= total || page.length === 0) break;
    pageNumber++;
  }
  return all;
}

/**
 * Walk a "Parent/Child" project path to the leaf project's ID.
 * Returns null if any segment along the path doesn't exist.
 */
function resolveProjectIdFromList(path: string, projects: RawProject[]): string | null {
  const segments = path.split("/").filter(Boolean);
  let parentId: string | undefined = undefined;
  let leafId: string | null = null;
  for (const segment of segments) {
    const found = projects.find(
      (p) => p.name === segment && (p.parentProjectId ?? undefined) === parentId,
    );
    if (!found) return null;
    parentId = found.id;
    leafId = found.id;
  }
  return leafId;
}

/** Server-side project-path → project-ID resolution for a given site's live project list. */
export async function resolveProjectId(
  path: string,
  siteId: string,
  base: string,
  authToken: string,
): Promise<string | null> {
  const projects = await fetchAllProjects(base, siteId, authToken);
  return resolveProjectIdFromList(path, projects);
}

/**
 * Delete a Tableau Cloud project by "Parent/Child" path. Cascades — deletes
 * every workbook/datasource inside the project, permanently. Never throws;
 * callers get a result object instead of needing try/catch.
 *
 * A path that no longer resolves to a project is treated as an already-
 * satisfied delete (`deleted: false, error: "project not found"`), not a
 * failure — the caller (cascading tenant-delete) should proceed with portal
 * cleanup either way.
 */
export async function deleteTableauProject(path: string): Promise<DeleteProjectResult> {
  const site = await getSiteForTenant("");
  const { session, error: signInError } = await signIn(site);
  if (!session) return { deleted: false, error: signInError ?? "Tableau sign-in failed" };
  const { base, creds } = session;
  try {
    const projectId = await resolveProjectId(path, creds.siteId, base, creds.token);
    if (!projectId) return { deleted: false, error: "project not found" };
    const res = await fetch(`${base}/sites/${creds.siteId}/projects/${projectId}`, {
      method: "DELETE",
      headers: { "X-Tableau-Auth": creds.token },
      cache: "no-store",
    });
    if (res.status === 204 || res.ok) return { deleted: true, projectId };
    const text = await res.text().catch(() => "");
    return { deleted: false, projectId, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { deleted: false, error: e instanceof Error ? e.message : "unknown error" };
  } finally {
    await signOut(base, creds.token);
  }
}

/**
 * Checks whether a "Parent/Child" project path still exists on Tableau
 * Cloud. Always busts the catalog cache first so this reflects live state,
 * not a stale (up to 5-minute-old) cached read. Reuses getLiveCatalog's own
 * project list + "Parent/Child" path-matching (filterCatalog) rather than a
 * second, possibly-divergent matcher.
 */
export async function projectExists(path: string): Promise<boolean> {
  const site = await getSiteForTenant("");
  invalidateCatalogCache(site.tableauSiteName);
  const catalog = await getLiveCatalog(undefined, [path]);
  return catalog.projects.length > 0;
}
