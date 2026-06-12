/**
 * GET /api/admin/tableau/demo-projects
 * Returns Tableau projects that are children of "Demo" (or are named "Demo").
 * Used by the Portal Catalog registration form to populate the project picker.
 *
 * POST /api/admin/tableau/demo-projects
 * Creates a new child project under "Demo" on the Tableau site.
 * Body: { name: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { env } from "@/lib/env";
import { tableauOrigin } from "@/lib/tableau-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Shared auth helper ────────────────────────────────────────────────────────

async function signIn(): Promise<{ token: string; siteId: string; base: string }> {
  const origin = tableauOrigin();
  const siteName = env.TABLEAU_SITE_NAME ?? "";
  const base = `${origin}/api/3.20`;

  const res = await fetch(`${base}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      credentials: {
        personalAccessTokenName: env.TABLEAU_PAT_NAME,
        personalAccessTokenSecret: env.TABLEAU_PAT_SECRET,
        site: { contentUrl: siteName },
      },
    }),
  });
  if (!res.ok) throw new Error(`Tableau sign-in failed: ${res.status}`);
  const data = (await res.json()) as { credentials: { token: string; site: { id: string } } };
  return { token: data.credentials.token, siteId: data.credentials.site.id, base };
}

async function fetchAllProjects(base: string, siteId: string, token: string) {
  const all: { id: string; name: string; parentProjectId?: string }[] = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const url = `${base}/sites/${siteId}/projects?pageSize=${pageSize}&pageNumber=${page}`;
    const res = await fetch(url, {
      headers: { "X-Tableau-Auth": token, Accept: "application/json" },
    });
    if (!res.ok) break;
    const data = (await res.json()) as {
      projects: { project: { id: string; name: string; parentProjectId?: string }[] };
      pagination: { totalAvailable: number };
    };
    const items = data.projects.project ?? [];
    all.push(...items);
    if (all.length >= data.pagination.totalAvailable) break;
    page++;
  }
  return all;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  if (!env.TABLEAU_PAT_NAME || !env.TABLEAU_PAT_SECRET) {
    return NextResponse.json({ projects: [] });
  }

  try {
    const { token, siteId, base } = await signIn();
    const all = await fetchAllProjects(base, siteId, token);
    void fetch(`${base}/auth/signout`, {
      method: "POST",
      headers: { "X-Tableau-Auth": token },
    }).catch(() => {});

    // Find the "Demo" parent project (top-level)
    const demoParent = all.find(
      (p) => p.name.toLowerCase() === "demo" && !p.parentProjectId,
    );

    // Return only direct children of "Demo", or all top-level if "Demo" not found
    const projects = demoParent
      ? all
          .filter((p) => p.parentProjectId === demoParent.id)
          .map((p) => ({ id: p.id, name: p.name, path: `Demo/${p.name}` }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    return NextResponse.json({ projects, demoParentId: demoParent?.id ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ projects: [], error: msg });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

const createSchema = z.object({ name: z.string().min(1).max(120) });

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!env.TABLEAU_PAT_NAME || !env.TABLEAU_PAT_SECRET) {
    return NextResponse.json({ error: "Tableau PAT not configured" }, { status: 503 });
  }

  try {
    const { token, siteId, base } = await signIn();
    const all = await fetchAllProjects(base, siteId, token);

    // Ensure "Demo" parent exists
    let demoParentId = all.find(
      (p) => p.name.toLowerCase() === "demo" && !p.parentProjectId,
    )?.id;

    if (!demoParentId) {
      const createRes = await fetch(`${base}/sites/${siteId}/projects`, {
        method: "POST",
        headers: {
          "X-Tableau-Auth": token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ project: { name: "Demo", description: "Demo portals" } }),
      });
      if (!createRes.ok) throw new Error(`Failed to create Demo parent: ${createRes.status}`);
      const cd = (await createRes.json()) as { project: { id: string } };
      demoParentId = cd.project.id;
    }

    // Check if child already exists
    const existing = all.find(
      (p) => p.parentProjectId === demoParentId && p.name === parsed.data.name,
    );
    let projectId = existing?.id;

    if (!projectId) {
      const createRes = await fetch(`${base}/sites/${siteId}/projects`, {
        method: "POST",
        headers: {
          "X-Tableau-Auth": token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          project: {
            name: parsed.data.name,
            parentProjectId: demoParentId,
            description: `Portal demo: ${parsed.data.name}`,
          },
        }),
      });
      if (!createRes.ok) throw new Error(`Failed to create project: ${createRes.status}`);
      const cd = (await createRes.json()) as { project: { id: string } };
      projectId = cd.project.id;
    }

    void fetch(`${base}/auth/signout`, {
      method: "POST",
      headers: { "X-Tableau-Auth": token },
    }).catch(() => {});

    return NextResponse.json({
      id: projectId,
      name: parsed.data.name,
      path: `Demo/${parsed.data.name}`,
      created: !existing,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
