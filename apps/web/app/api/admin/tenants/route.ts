import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { upsertTenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,48}$/),
  name: z.string().min(1).max(120),
  industry: z.string().max(80).optional().default(""),
  sourceUrl: z.string().url().max(2048).optional(),
  // When true, auto-create Demo/{name} project on Tableau and set allowedProjects
  createTableauProject: z.boolean().optional().default(false),
  tableauProjectName: z.string().max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const { slug, name, industry, sourceUrl, createTableauProject, tableauProjectName } = parsed.data;

  // Optionally create Tableau project Demo/{projectName}
  let allowedProjects: string[] | undefined;
  if (createTableauProject) {
    const projectName = tableauProjectName || name;
    try {
      const origin = req.headers.get("origin") ?? "";
      const res = await fetch(`${origin}/api/admin/tableau/demo-projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward session cookie so the nested request is authenticated
          Cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ name: projectName }),
      });
      if (res.ok) {
        const proj = (await res.json()) as { path?: string };
        if (proj.path) allowedProjects = [proj.path];
      }
    } catch {
      // Non-fatal — tenant still created even if Tableau project creation fails
    }
  }

  const tenant = await upsertTenant({
    slug,
    name,
    industry,
    status: "active",
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(allowedProjects ? { allowedProjects } : {}),
  });
  return NextResponse.json(tenant, { status: 201 });
}
