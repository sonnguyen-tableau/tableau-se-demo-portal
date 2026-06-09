import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession, slugify } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { getSiteForTenant } from "@/lib/tenant-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().url().max(2048),
  tenant_slug: z.string().regex(/^[a-z0-9-]{2,48}$/i).optional(),
  site_id: z.string().regex(/^[a-z0-9-]{2,48}$/).optional(),
  admin_email: z.string().email().max(320).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden — internal only", { status: 403 });
  }
  const site = await getSiteForTenant(ctx.tenantId);
  const factoryUrl = site.factoryUrl ?? env.FACTORY_URL;
  if (!factoryUrl) {
    return new NextResponse("FACTORY_URL is not configured.", { status: 503 });
  }

  // Accept both JSON (programmatic) and HTML form posts.
  let body: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = (await req.json()) as Record<string, unknown>;
  } else {
    const form = await req.formData();
    body = Object.fromEntries(form.entries()) as Record<string, unknown>;
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.redirect(
      new URL(`/factory/new?error=${encodeURIComponent("Invalid URL")}`, req.url),
      303,
    );
  }

  const slug =
    parsed.data.tenant_slug?.toLowerCase() ??
    slugify(new URL(parsed.data.url).hostname.replace(/^www\./, ""));

  // Derive portal base URL so the factory can call back for provisioning
  const portalBase = (() => {
    try { return new URL(req.url).origin; } catch { return ""; }
  })();

  const upstream = await fetch(new URL("/factory/start", factoryUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: parsed.data.url,
      tenant_slug: slug,
      ...(parsed.data.site_id ? { site_id: parsed.data.site_id } : {}),
      ...(parsed.data.admin_email ? { admin_email: parsed.data.admin_email } : {}),
      ...(portalBase ? { portal_url: portalBase } : {}),
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return new NextResponse(`factory error: ${detail}`, { status: 502 });
  }
  const job = (await upstream.json()) as { job_id: string };

  audit.emit({
    kind: "chat.start", // closest existing event; Phase 11 adds a dedicated kind
    userId: session.user.email ?? "(none)",
    tenantId: ctx.tenantId,
    messageHash: job.job_id,
    messageLength: parsed.data.url.length,
    hasVizContext: false,
  });

  // JSON callers (LaunchWizard) get a JSON response; form POSTs get a redirect.
  if (ct.includes("application/json")) {
    return NextResponse.json({ job_id: job.job_id, redirect: `/factory/${job.job_id}` });
  }
  return NextResponse.redirect(new URL(`/factory/${job.job_id}`, req.url), 303);
}
