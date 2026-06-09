/**
 * POST /api/admin/provision/design
 * Called by the factory sidecar during Stage 11 (provision).
 * Stores a per-tenant DESIGN.md string for use by the AI chat system prompt.
 * KV key: tenant-design:{tenantId}
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  tenantId: z.string().regex(/^[a-z0-9-]{2,48}$/),
  content: z.string().min(1).max(32_768),
});

function authorized(req: Request): boolean {
  const secret = env.FACTORY_PROVISION_SECRET;
  if (!secret) return false;
  return req.headers.get("x-factory-secret") === secret;
}

async function store(tenantId: string, content: string): Promise<void> {
  const key = `tenant-design:${tenantId}`;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, content);
  } else {
    const { writeFile, mkdir } = await import("fs/promises");
    const { join } = await import("path");
    const dir = join(process.cwd(), "data", "tenant-designs");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${tenantId}.md`), content, "utf-8");
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  await store(parsed.data.tenantId, parsed.data.content);
  return NextResponse.json({ ok: true }, { status: 201 });
}
