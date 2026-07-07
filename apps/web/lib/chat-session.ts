/**
 * Ephemeral per-conversation transcript store for the AI chat agent.
 *
 * Persists the FULL Anthropic message list (including tool_use / tool_result
 * blocks) so a follow-up turn in the same conversation reuses the data the
 * agent already fetched instead of re-running the list / query-datasource /
 * get-view-image tools. This is what lets the model answer "recommend actions
 * to improve digital conversion" without re-querying the Ciel funnel it pulled
 * a turn earlier — the numbers are already in its context.
 *
 * Stored in Vercel KV (prod). Gracefully no-ops when KV is unavailable (dev),
 * in which case the agent falls back to the text-only `history` payload — i.e.
 * today's stateless behavior, so nothing regresses.
 *
 * ISOLATION: the key is scoped by tenantId + a hash of the authenticated user
 * email, so a client-minted sessionId can never read another tenant's or
 * user's transcript. RLS is still enforced server-side by the MCP session; this
 * store only ever holds data the user was already authorized to see.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { shortHash } from "@/lib/audit";

type MessageParam = Anthropic.MessageParam;

const TTL_SECONDS = 60 * 60 * 2; // 2h — a working conversation, not durable history
const MAX_MESSAGES = 30; // keep the tail; tool_use/tool_result pairs preserved
const MAX_VALUE_BYTES = 800_000; // stay well under the KV ~1MB per-value limit

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function sessionKey(tenantId: string, userEmail: string, sessionId: string): string {
  return `chat-session:${tenantId}:${shortHash(userEmail)}:${sessionId}`;
}

/** Load the stored transcript for a conversation, or [] if none / KV off. */
export async function getChatSession(
  tenantId: string,
  userEmail: string,
  sessionId: string | undefined,
): Promise<MessageParam[]> {
  if (!hasKv() || !sessionId || !userEmail) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const stored = await kv.get<MessageParam[]>(sessionKey(tenantId, userEmail, sessionId));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

/** Persist the transcript (trimmed + images stripped). Never throws. */
export async function saveChatSession(
  tenantId: string,
  userEmail: string,
  sessionId: string | undefined,
  messages: MessageParam[],
): Promise<void> {
  if (!hasKv() || !sessionId || !userEmail || messages.length === 0) return;
  try {
    const trimmed = trimTranscript(messages);
    if (trimmed.length === 0) return;
    const { kv } = await import("@vercel/kv");
    await kv.set(sessionKey(tenantId, userEmail, sessionId), trimmed, { ex: TTL_SECONDS });
  } catch {
    // Never break the chat because persistence failed.
  }
}

// ── Trimming ─────────────────────────────────────────────────────────────────
// Two jobs: (1) drop base64 images from history — they are the heavy payload and
// the model can reason from the tables/text it already has; (2) cap the transcript
// length by dropping WHOLE exchanges from the front, only ever cutting at a genuine
// user turn so tool_use/tool_result pairs are never split (the API 400s otherwise).

/** A genuine user prompt has string content; tool_result turns carry an array. */
function isGenuineUserTurn(m: MessageParam): boolean {
  return m.role === "user" && typeof m.content === "string";
}

/** Indices where the transcript can be safely truncated from the front. */
function userBoundaries(messages: MessageParam[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i] && isGenuineUserTurn(messages[i]!)) out.push(i);
  }
  return out;
}

function stripImages(messages: MessageParam[]): MessageParam[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const content = m.content.map((block) => {
      const b = block as { type?: string; content?: unknown };
      if (b.type === "tool_result" && Array.isArray(b.content)) {
        const inner = (b.content as Array<{ type?: string }>).map((sub) =>
          sub.type === "image"
            ? { type: "text" as const, text: "[image omitted from history — reason from the data above]" }
            : sub,
        );
        return { ...(block as object), content: inner } as typeof block;
      }
      return block;
    });
    return { ...m, content } as MessageParam;
  });
}

export function trimTranscript(messages: MessageParam[]): MessageParam[] {
  let result = stripImages(messages);

  // Cap message count, cutting only at a genuine user boundary.
  if (result.length > MAX_MESSAGES) {
    const boundaries = userBoundaries(result);
    const target = result.length - MAX_MESSAGES;
    const cut = boundaries.find((b) => b >= target);
    if (cut !== undefined && cut > 0) result = result.slice(cut);
  }

  // Byte cap: keep dropping the oldest exchange until under the KV value limit.
  let guard = 0;
  while (jsonBytes(result) > MAX_VALUE_BYTES && guard++ < 50) {
    const boundaries = userBoundaries(result);
    if (boundaries.length <= 1) break; // keep at least the last exchange
    result = result.slice(boundaries[1]!); // drop from front to the 2nd user turn
  }

  return result;
}

function jsonBytes(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
