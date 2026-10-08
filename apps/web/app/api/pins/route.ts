import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { addPin, getPins, removePin, type PinnedItem } from "@/lib/pins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pinSchema = z.object({
  key: z.string().min(1).max(300),
  kind: z.enum(["view", "workbook"]),
  workbookSlug: z.string().min(1).max(200),
  viewSlug: z.string().max(200).optional(),
  title: z.string().min(1).max(300),
  workbookName: z.string().min(1).max(300),
  projectName: z.string().max(300).default(""),
});

/** Resolve the authenticated user + tenant, or null. */
async function ctxOrNull() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const email = session?.user?.email ?? "";
  if (!ctx || !email) return null;
  return { tenantId: ctx.tenantId, email };
}

export async function GET(): Promise<Response> {
  const c = await ctxOrNull();
  if (!c) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.json({ pins: await getPins(c.tenantId, c.email) });
}

export async function POST(req: Request): Promise<Response> {
  const c = await ctxOrNull();
  if (!c) return new NextResponse("unauthorized", { status: 401 });

  const parsed = pinSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item: PinnedItem = {
    ...parsed.data,
    ...(parsed.data.viewSlug !== undefined ? { viewSlug: parsed.data.viewSlug } : {}),
    pinnedAt: Date.now(),
  };
  return NextResponse.json({ pins: await addPin(c.tenantId, c.email, item) });
}

export async function DELETE(req: Request): Promise<Response> {
  const c = await ctxOrNull();
  if (!c) return new NextResponse("unauthorized", { status: 401 });

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return new NextResponse("missing key", { status: 400 });
  return NextResponse.json({ pins: await removePin(c.tenantId, c.email, key) });
}
