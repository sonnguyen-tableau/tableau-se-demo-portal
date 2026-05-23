import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const session = await auth();
    const ctx = tenantFromSession(session);

    return NextResponse.json({
      hasSession: !!session,
      user: session?.user
        ? {
            email: session.user.email,
            tenantId: session.user.tenantId,
            tenantName: session.user.tenantName,
            groups: session.user.groups,
            region: session.user.region,
          }
        : null,
      isInternal: ctx?.isInternal ?? false,
      portalEnv: env.PORTAL_ENV,
      hasKv: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 8) : undefined,
    }, { status: 500 });
  }
}
