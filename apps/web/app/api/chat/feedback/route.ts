import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { audit, shortHash } from "@/lib/audit";
import { checkAndRecord } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FEEDBACK_RATE_LIMIT = { windowSeconds: 60, max: 30 } as const;

const schema = z.object({
  chatSessionId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  messageIndex: z.number().int().min(0).max(2000),
  rating: z.enum(["up", "down"]),
  comment: z.string().max(1000).optional(),
});

/** Records a 👍/👎 (and optional one-line comment) on an assistant message (AG-07). */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx || !session?.user?.email) return new Response("unauthorized", { status: 401 });

  const rl = await checkAndRecord(`feedback:${ctx.tenantId}:${session.user.email}`, FEEDBACK_RATE_LIMIT);
  if (!rl.allowed) {
    return new Response("rate_limited", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response("invalid_request", { status: 400 });

  const comment = parsed.data.comment?.trim();
  if (comment) {
    // Free-text enrichment of an already-recorded 👎 (the vote fired on click).
    // Stored on a SEPARATE sink, not the audit vote: it's untrusted user text,
    // which audit.ts forbids carrying, and keeping it off the vote path means a
    // commented 👎 is a single vote, not a double count (FX-04 / AG-07).
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: "chat.feedback_comment",
        userIdHash: shortHash(session.user.email),
        tenantId: ctx.tenantId,
        chatSessionId: parsed.data.chatSessionId,
        messageIndex: parsed.data.messageIndex,
        rating: parsed.data.rating,
        comment: comment.slice(0, 500),
      }),
    );
    return new Response(null, { status: 204 });
  }

  audit.emit({
    kind: "chat.feedback",
    userId: session.user.email,
    tenantId: ctx.tenantId,
    rating: parsed.data.rating,
    chatSessionId: parsed.data.chatSessionId,
    messageIndex: parsed.data.messageIndex,
  });
  return new Response(null, { status: 204 });
}
