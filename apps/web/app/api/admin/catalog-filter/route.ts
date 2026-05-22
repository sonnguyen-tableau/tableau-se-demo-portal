import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getHiddenWorkbookIds, setHiddenWorkbookIds } from "@/lib/catalog-filter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const ids = [...(await getHiddenWorkbookIds())];
  return NextResponse.json({ hiddenWorkbookIds: ids });
}

const putSchema = z.object({
  hiddenWorkbookIds: z.array(z.string().uuid()).max(2000),
});

export async function PUT(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await setHiddenWorkbookIds(parsed.data.hiddenWorkbookIds);
  return NextResponse.json({ ok: true, count: parsed.data.hiddenWorkbookIds.length });
}
