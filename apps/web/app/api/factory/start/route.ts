import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession, slugify } from "@/lib/tenant";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().url().max(2048),
  tenant_slug: z
    .string()
    .regex(/^[a-z0-9-]{2,48}$/i)
    .optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden — internal only", { status: 403 });
  }
  if (!env.FACTORY_URL) {
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

  const upstream = await fetch(new URL("/factory/start", env.FACTORY_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: parsed.data.url, tenant_slug: slug }),
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

  return NextResponse.redirect(new URL(`/factory/${job.job_id}`, req.url), 303);
}
