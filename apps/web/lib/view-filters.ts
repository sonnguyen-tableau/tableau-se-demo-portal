/**
 * Share-link filter codec (RV-02). Serializes the active viz filters into a
 * compact, URL-safe `?f=` param so a shared link reproduces the same filter
 * state for another user. Pure + client-safe (no server-only).
 */
export interface SharedFilter {
  field: string;
  values: string[];
}

function base64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode filters to a URL-safe string; "" when there are no filters. */
export function encodeFilters(filters: SharedFilter[]): string {
  const nonEmpty = filters.filter((f) => f.field && f.values.length > 0);
  if (nonEmpty.length === 0) return "";
  const compact = nonEmpty.map((f) => ({ f: f.field, v: f.values }));
  return base64urlEncode(JSON.stringify(compact));
}

// Bounds on a decoded share link (FX-12): a hostile `?f=` must not be able to
// drive an unbounded number of applyFilterAsync calls or carry huge payloads.
const MAX_FILTER_FIELDS = 20;
const MAX_FILTER_VALUES = 100;
const MAX_FILTER_STR = 200;

/** Decode a `?f=` param back to filters; [] on anything malformed. Caps the
 *  field/value counts and string lengths so a crafted link stays bounded. */
export function decodeFilters(encoded: string | null | undefined): SharedFilter[] {
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(base64urlDecode(encoded)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, MAX_FILTER_FIELDS)
      .map((x) => {
        const o = x as Record<string, unknown>;
        return {
          field: String(o["f"] ?? "").slice(0, MAX_FILTER_STR),
          values: Array.isArray(o["v"])
            ? (o["v"] as unknown[]).slice(0, MAX_FILTER_VALUES).map((v) => String(v).slice(0, MAX_FILTER_STR))
            : [],
        };
      })
      .filter((f) => f.field && f.values.length > 0);
  } catch {
    return [];
  }
}
