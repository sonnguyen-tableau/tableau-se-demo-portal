import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return NextResponse.json({
      ok: false,
      error: "KV_REST_API_URL or KV_REST_API_TOKEN not set",
      hasUrl: !!kvUrl,
      hasToken: !!kvToken,
    });
  }

  try {
    const { kv } = await import("@vercel/kv");

    // Write test value
    await kv.set("__debug_test__", { ts: Date.now(), ok: true });

    // Read it back
    const val = await kv.get("__debug_test__");

    // Read current hidden workbooks
    const hidden = await kv.get("hidden-workbook-ids");

    // Read portal users (count only for safety)
    const users = await kv.get<unknown[]>("portal-users");
    const userCount = Array.isArray(users) ? users.length : 0;

    return NextResponse.json({
      ok: true,
      kvUrl: kvUrl.slice(0, 40) + "…",
      writeReadTest: val,
      hiddenWorkbookIds: hidden,
      portalUserCount: userCount,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 5) : undefined,
    });
  }
}
