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
  // Tableau workbook IDs are UUIDs but may be uppercase — accept any non-empty string
  hiddenWorkbookIds: z.array(z.string().min(1)).max(2000),
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

  try {
    await setHiddenWorkbookIds(parsed.data.hiddenWorkbookIds);
  } catch (e) {
    console.error("[catalog-filter] setHiddenWorkbookIds failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "KV write failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, count: parsed.data.hiddenWorkbookIds.length });
}

const patchSchema = z.object({
  unhide: z.array(z.string().min(1)).max(200),
});

/** PATCH — remove specific IDs from the hidden list without touching the rest. */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const toUnhide = new Set(parsed.data.unhide);
  const current = [...(await getHiddenWorkbookIds())];
  const next = current.filter((id) => !toUnhide.has(id));

  try {
    await setHiddenWorkbookIds(next);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "KV write failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, removed: current.length - next.length, remaining: next.length });
}
