import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listPortalUsers, upsertPortalUser, deletePortalUser } from "@/lib/portal-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return null;
  return ctx;
}

export async function GET(): Promise<Response> {
  if (!(await requireAdmin())) return new NextResponse("Forbidden", { status: 403 });
  const users = await listPortalUsers();
  return NextResponse.json({ users });
}

const regionEnum = z.enum(["NA", "EMEA", "APAC"]).optional();

const upsertSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  tenantId: z.string().min(1),
  tenantName: z.string().min(1),
  region: regionEnum,
  groups: z.array(z.string()).default([]),
  allowedWorkbookIds: z.array(z.string().min(1)).nullable(),
});

export async function PUT(req: Request): Promise<Response> {
  if (!(await requireAdmin())) return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { password, region, ...rest } = parsed.data;
  try {
    await upsertPortalUser({
      ...rest,
      ...(password ? { password } : {}),
      ...(region ? { region } : {}),
    });
  } catch (e) {
    console.error("[users] upsertPortalUser failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "KV write failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ email: z.string().email() });

export async function DELETE(req: Request): Promise<Response> {
  if (!(await requireAdmin())) return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await deletePortalUser(parsed.data.email);
  return NextResponse.json({ ok: true });
}
