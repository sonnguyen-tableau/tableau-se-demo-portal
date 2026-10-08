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

// ── Session history (AG-11) ──────────────────────────────────────────────────
// A per-user index of recent conversations + the rendered client messages
// (with rich blocks) so the agent page can list past sessions and reopen one.
// Separate from the Anthropic transcript above (that's a 2h tool-reuse cache).

const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAX_SESSIONS = 20;
const MAX_RENDERED_BYTES = 900_000; // under the KV ~1MB per-value limit

export interface SessionMeta {
  sessionId: string;
  title: string;
  updatedAt: number;
}

function indexKey(tenantId: string, userEmail: string): string {
  return `chat-sessions:${tenantId}:${shortHash(userEmail)}`;
}
function renderedKey(tenantId: string, userEmail: string, sessionId: string): string {
  return `chat-rendered:${tenantId}:${shortHash(userEmail)}:${sessionId}`;
}

/** List a user's recent sessions, newest first (empty when KV off). Entries
 *  older than the history TTL are filtered out — their bodies have already
 *  TTL-expired in KV, so they would restore empty (FX-04). */
export async function listChatSessions(tenantId: string, userEmail: string): Promise<SessionMeta[]> {
  if (!hasKv() || !userEmail) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const stored = await kv.get<SessionMeta[]>(indexKey(tenantId, userEmail));
    if (!Array.isArray(stored)) return [];
    const cutoff = Date.now() - HISTORY_TTL_SECONDS * 1000;
    return stored.filter((s) => s && typeof s.updatedAt === "number" && s.updatedAt > cutoff);
  } catch {
    return [];
  }
}

/** Load a session's rendered client messages (with rich blocks), or [] .
 *  Export-card download URLs are re-checked on the way out — a stored value
 *  that is not a relative path or an https URL is blanked (FX-04). */
export async function getRenderedSession(
  tenantId: string,
  userEmail: string,
  sessionId: string | undefined,
): Promise<unknown[]> {
  if (!hasKv() || !sessionId || !userEmail) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const stored = await kv.get<unknown[]>(renderedKey(tenantId, userEmail, sessionId));
    return Array.isArray(stored) ? sanitizeDownloadUrls(stored) : [];
  } catch {
    return [];
  }
}

/** A download href safe to re-surface: a same-origin relative path or https. */
function isSafeDownloadUrl(u: unknown): boolean {
  if (typeof u !== "string" || u === "") return false;
  if (u.startsWith("/") && !u.startsWith("//")) return true; // relative, not protocol-relative
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

/** Walk rendered messages and blank any unsafe export-card downloadUrl. */
function sanitizeDownloadUrls(rendered: unknown[]): unknown[] {
  return mapRichBlocks(rendered, (b) => {
    if (!isObj(b) || b.kind !== "export" || !isObj(b.event)) return b;
    if (isSafeDownloadUrl((b.event as Record<string, unknown>).downloadUrl)) return b;
    return { ...b, event: { ...(b.event as object), downloadUrl: "" } };
  });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/** Apply `fn` to every rich block of every message, defensively (unknown shape). */
function mapRichBlocks(rendered: unknown[], fn: (b: unknown) => unknown): unknown[] {
  return rendered.map((m) => {
    if (!isObj(m) || !Array.isArray(m.richBlocks)) return m;
    return { ...m, richBlocks: m.richBlocks.map(fn) };
  });
}

/**
 * Persist a session's rendered messages + upsert the index (move-to-top, cap
 * MAX_SESSIONS, newest wins). `title` is derived from the first user message.
 * Never throws; skips oversized payloads so one huge session can't wedge a save.
 *
 * NOTE (FX-14): the index upsert is a non-atomic read-modify-write (get → splice
 * → set), so two concurrent saves for the SAME user could race and lose one
 * entry. Accepted deliberately — the index is per-user (keyed by tenant + email
 * hash) and a user rarely has two in-flight turns at once; the body (renderedKey)
 * is always written first, so at worst a session is briefly missing from the
 * list, not lost. Switch to a Redis sorted set (zadd) if this ever contends.
 */
export async function saveRenderedSession(
  tenantId: string,
  userEmail: string,
  sessionId: string | undefined,
  rendered: unknown[],
  title: string,
  now: number,
): Promise<void> {
  if (!hasKv() || !sessionId || !userEmail || rendered.length === 0) return;
  // Drop base64 image payloads before storing (FX-04): they are the heavy part,
  // the chart is transient, and the restore renderer shows a muted placeholder.
  const toStore = stripRenderedImages(rendered);
  // Don't index a session whose body is too large to store — it would appear in
  // the history list but restore empty (review m5). Byte-accurate measurement.
  if (jsonBytes(toStore) > MAX_RENDERED_BYTES) return;
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(renderedKey(tenantId, userEmail, sessionId), toStore, { ex: HISTORY_TTL_SECONDS });
    const index = await listChatSessions(tenantId, userEmail);
    const meta: SessionMeta = { sessionId, title: title.slice(0, 120) || sessionId, updatedAt: now };
    const merged = [meta, ...index.filter((s) => s.sessionId !== sessionId)];
    const next = merged.slice(0, MAX_SESSIONS);
    // Evict the bodies of sessions pushed past the cap so they don't linger
    // until TTL as orphaned KV values (FX-04).
    for (const evicted of merged.slice(MAX_SESSIONS)) {
      await kv.del(renderedKey(tenantId, userEmail, evicted.sessionId));
    }
    await kv.set(indexKey(tenantId, userEmail), next, { ex: HISTORY_TTL_SECONDS });
  } catch {
    // Never break the chat because history persistence failed.
  }
}

/** Replace base64 image rich-blocks with empty placeholders (keep the shape). */
function stripRenderedImages(rendered: unknown[]): unknown[] {
  return mapRichBlocks(rendered, (b) =>
    isObj(b) && b.kind === "image" ? { ...b, data: "" } : b,
  );
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
    // Byte length, not string length — multibyte (Vietnamese, emoji) would
    // otherwise undercount against the KV per-value byte limit (FX-04).
    return Buffer.byteLength(JSON.stringify(v), "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
