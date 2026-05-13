/**
 * Tenant theme registry. Phase 10 ships an in-memory store; Phase 11 swaps
 * this for a Postgres-backed implementation. The interface is async so the
 * swap is invisible to callers.
 */

export type Tone = "professional" | "playful" | "technical";

export interface TenantTheme {
  tenantId: string;
  primaryColor: string;
  secondaryColor: string;
  neutralColor: string;
  fontFamily: string;
  logoUrl?: string;
  tone: Tone;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_THEME: Omit<TenantTheme, "tenantId"> = {
  primaryColor: "#1a56db",
  secondaryColor: "#f59e0b",
  neutralColor: "#0f172a",
  fontFamily: "Inter",
  tone: "professional",
};

const STORE = new Map<string, TenantTheme>();

export async function getTenantTheme(tenantId: string): Promise<TenantTheme> {
  return STORE.get(tenantId) ?? { tenantId, ...DEFAULT_THEME };
}

export async function setTenantTheme(input: Partial<TenantTheme> & { tenantId: string }): Promise<TenantTheme> {
  const existing = STORE.get(input.tenantId);
  const next: TenantTheme = {
    tenantId: input.tenantId,
    primaryColor: pickHex(input.primaryColor, existing?.primaryColor ?? DEFAULT_THEME.primaryColor),
    secondaryColor: pickHex(input.secondaryColor, existing?.secondaryColor ?? DEFAULT_THEME.secondaryColor),
    neutralColor: pickHex(input.neutralColor, existing?.neutralColor ?? DEFAULT_THEME.neutralColor),
    fontFamily: (input.fontFamily ?? existing?.fontFamily ?? DEFAULT_THEME.fontFamily).slice(0, 80),
    tone: isTone(input.tone) ? input.tone : (existing?.tone ?? DEFAULT_THEME.tone),
    ...(input.logoUrl !== undefined
      ? { logoUrl: String(input.logoUrl).slice(0, 1024) }
      : existing?.logoUrl !== undefined
        ? { logoUrl: existing.logoUrl }
        : {}),
  };
  STORE.set(next.tenantId, next);
  return next;
}

export async function deleteTenantTheme(tenantId: string): Promise<boolean> {
  return STORE.delete(tenantId);
}

export async function listTenantThemes(): Promise<TenantTheme[]> {
  return [...STORE.values()];
}

export function themeToCssVariables(theme: TenantTheme): string {
  // Inline-safe; consumed via `style={{ "--brand-primary": ... }}` or
  // serialized into a <style> block on the tenant layout.
  return [
    `--brand-primary: ${theme.primaryColor};`,
    `--brand-secondary: ${theme.secondaryColor};`,
    `--brand-neutral: ${theme.neutralColor};`,
    `--font-sans: ${theme.fontFamily}, Inter, system-ui, sans-serif;`,
  ].join(" ");
}

function pickHex(candidate: string | undefined, fallback: string): string {
  if (candidate && HEX.test(candidate)) return candidate.toLowerCase();
  return fallback;
}

function isTone(v: unknown): v is Tone {
  return v === "professional" || v === "playful" || v === "technical";
}
