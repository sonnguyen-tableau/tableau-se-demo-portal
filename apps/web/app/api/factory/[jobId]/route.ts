import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!env.FACTORY_URL) {
    return new NextResponse("FACTORY_URL is not configured.", { status: 503 });
  }
  const { jobId } = await context.params;
  if (!/^[a-zA-Z0-9-]{1,40}$/.test(jobId)) {
    return new NextResponse("invalid job id", { status: 400 });
  }

  const upstream = await fetch(new URL(`/factory/${jobId}/events`, env.FACTORY_URL), {
    headers: { Accept: "text/event-stream" },
  });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(`factory error: ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
