import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listChatSessions, getRenderedSession, saveRenderedSession } from "@/lib/chat-session";
import { checkAndRecord } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSIONS_RATE_LIMIT = { windowSeconds: 60, max: 60 } as const;
const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);

async function ctxOrNull() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const email = session?.user?.email ?? "";
  if (!ctx || !email) return null;
  return { tenantId: ctx.tenantId, email };
}

/**
 * Chat session history (AG-11). GET with no `id` lists the user's recent
 * sessions; GET `?id=` returns that session's rendered messages (with rich
 * blocks) to restore it; POST persists the current session + indexes it. All
 * scoped to the authenticated tenant + user (same isolation as the transcript).
 */
export async function GET(req: Request): Promise<Response> {
  const c = await ctxOrNull();
  if (!c) return new NextResponse("unauthorized", { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    // A malformed id can never be a valid key — return empty rather than query.
    if (!sessionIdSchema.safeParse(id).success) return NextResponse.json({ messages: [] });
    return NextResponse.json({ messages: await getRenderedSession(c.tenantId, c.email, id) });
  }
  return NextResponse.json({ sessions: await listChatSessions(c.tenantId, c.email) });
}

const saveSchema = z.object({
  sessionId: sessionIdSchema,
  title: z.string().max(200).default(""),
  messages: z.array(z.unknown()).max(200),
});

export async function POST(req: Request): Promise<Response> {
  const c = await ctxOrNull();
  if (!c) return new NextResponse("unauthorized", { status: 401 });

  const rl = await checkAndRecord(`sessions:${c.tenantId}:${c.email}`, SESSIONS_RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse("rate_limited", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const parsed = saveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, title, messages } = parsed.data;
  await saveRenderedSession(c.tenantId, c.email, sessionId, messages, title, Date.now());
  return NextResponse.json({ ok: true });
}
