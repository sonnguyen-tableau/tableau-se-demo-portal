import type { MessageKey } from "@/lib/i18n-shared";

/**
 * Map a Tableau Embedding-API viz error code to a human, localizable message
 * key (RV-04 / FX-12). The raw code/detail is still shown to internal users;
 * everyone gets a friendly line keyed off the error family.
 */
export function embedErrorKey(code: string | null | undefined): MessageKey {
  const c = (code ?? "").toLowerCase();
  if (!c) return "embed.errGeneric";
  if (c.includes("auth") || c.includes("token") || c.includes("unauthorized") || c.includes("401")) {
    return "embed.errAuth";
  }
  if (c.includes("forbidden") || c.includes("permission") || c.includes("403")) {
    return "embed.errForbidden";
  }
  if (c.includes("not-found") || c.includes("notfound") || c.includes("404")) {
    return "embed.errNotFound";
  }
  return "embed.errGeneric";
}
