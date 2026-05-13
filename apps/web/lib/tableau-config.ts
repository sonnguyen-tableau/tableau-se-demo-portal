import { env } from "@/lib/env";

/**
 * True if the runtime is wired to a real Tableau Cloud Connected App.
 * False when the placeholders from .env.example are still in use — the UI
 * renders a setup banner instead of a broken embed.
 */
export function isTableauConfigured(): boolean {
  const isUuid = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  if (!isUuid(env.TABLEAU_CONNECTED_APP_CLIENT_ID)) return false;
  if (env.TABLEAU_CONNECTED_APP_CLIENT_ID === "00000000-0000-0000-0000-000000000000") {
    return false;
  }
  if (env.TABLEAU_CONNECTED_APP_SECRET_VALUE.startsWith("placeholder")) return false;
  return true;
}

/**
 * Origin part of TABLEAU_SITE without the `#/site/<name>` hash fragment.
 * Used to compose viz src URLs (`<origin>/views/<wb>/<view>`).
 */
export function tableauOrigin(): string {
  try {
    const u = new URL(env.TABLEAU_SITE);
    return `${u.protocol}//${u.host}`;
  } catch {
    return env.TABLEAU_SITE;
  }
}

/** Build the canonical view URL for `<TableauViz src=...>`. */
export function tableauViewUrl(viewPath: string): string {
  const trimmed = viewPath.replace(/^\/+/, "");
  return `${tableauOrigin()}/t/${env.TABLEAU_SITE_NAME}/views/${trimmed}`;
}
