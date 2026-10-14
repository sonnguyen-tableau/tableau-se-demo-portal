import { auth } from "@/lib/auth";
import { tenantFromSession, canAccessTenant } from "@/lib/tenant";
import { getUserCatalog } from "@/lib/user-catalog";
import { fetchViewPreviewImage } from "@/lib/tableau-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Per-instance byte cache. Vercel Fluid Compute reuses instances, so this
 * avoids re-hitting Tableau (which costs a sign-in round-trip per call) for
 * repeat loads on the same instance. Cross-instance reuse goes through Vercel KV
 * when configured (below). Authorization still runs on EVERY request.
 */
const mem = new Map<string, { bytes: Uint8Array; contentType: string; ts: number }>();
// Cap the per-instance cache so a long-lived instance can't accumulate every
// view's PNG. FIFO eviction (Map preserves insertion order) — keys are bounded
// to real views that passed authz, so this is a footprint guard, not anti-DoS.
const MAX_MEM_ENTRIES = 256;

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * View thumbnail proxy (HL-01). Serves a view's Tableau previewImage through the
 * server PAT, but ONLY after confirming the view is in the requesting user's
 * visible catalog (tenant scope ∩ per-user visibility, via getUserCatalog) — so
 * a user can never fetch a thumbnail of another tenant's (or a hidden) view.
 * Cached 24h in the browser (Cache-Control) and server-side (mem + KV).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const ctx = tenantFromSession(session);
  if (!ctx) return new Response("forbidden", { status: 403 });

  const params = new URL(req.url).searchParams;
  const wb = params.get("wb");
  const view = params.get("view");
  if (!wb || !view) return new Response("missing wb/view", { status: 400 });

  // Resolve the thumbnail against the VIEWED tenant (?t=slug), not the session
  // tenant, so an internal user on another portal gets that tenant's images and
  // the cache can't collide across tenants on a shared slug (FX-06). Defaults to
  // the session tenant when the param is absent.
  const slug = params.get("t") || ctx.tenantId;
  if (!canAccessTenant(ctx, slug)) return new Response("forbidden", { status: 403 });

  // AUTHORIZATION: the (wb, view) slug pair must resolve inside THIS user's
  // visible catalog for that tenant. A slug from another tenant — or a hidden
  // workbook — is not present, so this 404s before any privileged PAT call.
  const { dashboards } = await getUserCatalog(session, slug);
  const dash = dashboards.find((d) => d.workbookSlug === wb && d.viewSlug === view);
  if (!dash) return new Response("not found", { status: 404 });

  const cacheKey = `thumb:${slug}:${dash.viewId}`;

  const hit = mem.get(cacheKey);
  if (hit) {
    if (Date.now() - hit.ts < DAY_SECONDS * 1000) return imageResponse(hit.bytes, hit.contentType);
    mem.delete(cacheKey); // evict stale
  }

  if (hasKv()) {
    try {
      const { kv } = await import("@vercel/kv");
      const stored = await kv.get<{ b64: string; contentType: string }>(cacheKey);
      if (stored?.b64) {
        const bytes = new Uint8Array(Buffer.from(stored.b64, "base64"));
        mem.set(cacheKey, { bytes, contentType: stored.contentType, ts: Date.now() });
        return imageResponse(bytes, stored.contentType);
      }
    } catch {
      // KV miss/unavailable — fall through to a live fetch.
    }
  }

  let bytes: Uint8Array;
  let contentType: string;
  try {
    const img = await fetchViewPreviewImage(slug, dash.workbookId, dash.viewId);
    bytes = new Uint8Array(img.bytes);
    contentType = img.contentType;
  } catch (e) {
    console.error("[thumbnail] fetch failed", e);
    // 502 → the client's <img onError> falls back to the project icon.
    return new Response("thumbnail unavailable", { status: 502 });
  }

  if (mem.size >= MAX_MEM_ENTRIES) {
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
  mem.set(cacheKey, { bytes, contentType, ts: Date.now() });
  if (hasKv()) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.set(
        cacheKey,
        { b64: Buffer.from(bytes).toString("base64"), contentType },
        { ex: DAY_SECONDS },
      );
    } catch {
      // best-effort cache write
    }
  }

  return imageResponse(bytes, contentType);
}

function imageResponse(bytes: Uint8Array, contentType: string): Response {
  // Pin to an image type (the source is Tableau's previewImage, but never
  // reflect a non-image type through the proxy) + nosniff, defense-in-depth.
  const safeType = contentType.startsWith("image/") ? contentType : "image/png";
  return new Response(bytes, {
    headers: {
      "Content-Type": safeType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
