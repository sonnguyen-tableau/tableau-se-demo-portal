/**
 * PUT /api/admin/provision/user
 * Called by the factory sidecar to create the first admin user for a new tenant.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertPortalUser } from "@/lib/portal-users";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  tenantId: z.string().min(1).max(120),
  tenantName: z.string().min(1).max(120),
  groups: z.array(z.string().max(80)).default(["admin"]),
  region: z.enum(["NA", "EMEA", "APAC"]).optional(),
});

function authorized(req: Request): boolean {
  const secret = env.FACTORY_PROVISION_SECRET;
  if (!secret) return false;
  return req.headers.get("x-factory-secret") === secret;
}

export async function PUT(req: Request): Promise<Response> {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const { region, ...rest } = parsed.data;
  await upsertPortalUser({
    ...rest,
    allowedWorkbookIds: null,
    ...(region ? { region } : {}),
  });
  return NextResponse.json({ email: parsed.data.email, tenantId: parsed.data.tenantId }, { status: 201 });
}
