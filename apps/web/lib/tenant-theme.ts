/**
 * Tenant theme registry.
 * - Production (Vercel KV configured): persists to Redis
 * - Local dev: persists to data/tenant-themes.json
 *
 * Server-side only.
 */
import { join } from "path";

export type Tone = "professional" | "playful" | "technical";

// How the logo asset is shaped, so the sidebar header can render it correctly:
// - "icon": square/compact mark → small boxed icon paired with the company name.
// - "wordmark": wide logo that already includes the company name → render full
//   width on a light plate (its ink is dark/colored), no redundant text beside it.
// - "wordmark-light": wide logo whose ink is white/light → render full width
//   directly on the dark sidebar (NO white plate, which would hide white text).
export type LogoLayout = "icon" | "wordmark" | "wordmark-light";

// Tenant home hero layout. All three keep the same shared shell (sidebar,
// dashboards, agent, RLS, i18n) — only the top welcome banner differs, so a
// tenant feels tailored without forking the single-shell architecture.
// - "aurora":    the original brand-gradient mesh banner (default).
// - "editorial": light surface, left accent bar, calmer/enterprise feel.
// - "spotlight": centered, brand-ring, minimal.
export type HeroVariant = "aurora" | "editorial" | "spotlight";

export const HERO_VARIANTS: readonly HeroVariant[] = ["aurora", "editorial", "spotlight"] as const;

// Max categorical colors we persist/emit for a tenant chart palette.
export const MAX_CHART_COLORS = 8;

export interface TenantTheme {
  tenantId: string;
  companyName: string;
  /** Short sidebar subtitle under the company name (SH-05); falls back to the
   * generic "Analytics Portal" label when unset. */
  tagline?: string | undefined;
  primaryColor: string;
  secondaryColor: string;
  neutralColor: string;
  sidebarTextColor: string;
  fontFamily: string;
  logoUrl?: string | undefined;
  logoLayout?: LogoLayout | undefined;
  // Categorical palette for charts (Vega / dashboard cards). Optional: when
  // absent, resolveChartPalette() derives a brand-led default so older tenants
  // keep working unchanged.
  chartPalette?: string[] | undefined;
  // Which tenant-home hero layout to render. Defaults to "aurora".
  heroVariant?: HeroVariant | undefined;
  tone: Tone;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_THEME: Omit<TenantTheme, "tenantId"> = {
  companyName: "Salesforce Bank",
  primaryColor: "#0176d3",
  secondaryColor: "#f5a623",
  neutralColor: "#032d60",
  sidebarTextColor: "#ffffff",
  fontFamily: "Inter",
  tone: "professional",
  heroVariant: "aurora",
};

// ── Storage helpers ──────────────────────────────────────────────────────────

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function kvKey(tenantId: string): string {
  return `tenant-theme:${tenantId}`;
}

async function readFromKv(tenantId: string): Promise<TenantTheme | null> {
  const { kv } = await import("@vercel/kv");
  return kv.get<TenantTheme>(kvKey(tenantId));
}

async function writeToKv(theme: TenantTheme): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(kvKey(theme.tenantId), theme);
}

async function deleteFromKv(tenantId: string): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.del(kvKey(tenantId));
}

async function readAllFromFile(): Promise<Map<string, TenantTheme>> {
  const { readFile } = await import("fs/promises");
  try {
    const raw = await readFile(join(process.cwd(), "data", "tenant-themes.json"), "utf-8");
    const arr = JSON.parse(raw) as TenantTheme[];
    return new Map(arr.map((t) => [t.tenantId, t]));
  } catch {
    return new Map();
  }
}

async function writeAllToFile(store: Map<string, TenantTheme>): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const dir = join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "tenant-themes.json"),
    JSON.stringify([...store.values()], null, 2) + "\n",
    "utf-8",
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getTenantTheme(tenantId: string): Promise<TenantTheme> {
  if (hasKv()) {
    const fromKv = await readFromKv(tenantId);
    if (fromKv !== null) return fromKv;
    // KV miss — fall back to bundled data/tenant-themes.json
  }
  const store = await readAllFromFile();
  return store.get(tenantId) ?? { tenantId, ...DEFAULT_THEME };
}

export async function setTenantTheme(
  input: Partial<TenantTheme> & { tenantId: string },
): Promise<TenantTheme> {
  const existing = await getTenantTheme(input.tenantId);
  const next: TenantTheme = {
    tenantId: input.tenantId,
    companyName: (input.companyName ?? existing.companyName).slice(0, 120),
    primaryColor: pickHex(input.primaryColor, existing.primaryColor),
    secondaryColor: pickHex(input.secondaryColor, existing.secondaryColor),
    neutralColor: pickHex(input.neutralColor, existing.neutralColor),
    sidebarTextColor: pickHex(input.sidebarTextColor, existing.sidebarTextColor),
    fontFamily: (input.fontFamily ?? existing.fontFamily).slice(0, 80),
    tone: isTone(input.tone) ? input.tone : existing.tone,
    ...(input.tagline !== undefined
      ? { tagline: String(input.tagline).slice(0, 120) }
      : existing.tagline !== undefined
        ? { tagline: existing.tagline }
        : {}),
    ...(input.logoUrl !== undefined
      ? { logoUrl: String(input.logoUrl).slice(0, 2048) }
      : existing.logoUrl !== undefined
        ? { logoUrl: existing.logoUrl }
        : {}),
    ...(isLogoLayout(input.logoLayout)
      ? { logoLayout: input.logoLayout }
      : existing.logoLayout !== undefined
        ? { logoLayout: existing.logoLayout }
        : {}),
    ...(input.chartPalette !== undefined
      ? { chartPalette: sanitizeChartPalette(input.chartPalette) }
      : existing.chartPalette !== undefined
        ? { chartPalette: existing.chartPalette }
        : {}),
    ...(isHeroVariant(input.heroVariant)
      ? { heroVariant: input.heroVariant }
      : existing.heroVariant !== undefined
        ? { heroVariant: existing.heroVariant }
        : {}),
  };

  if (hasKv()) {
    await writeToKv(next);
  } else {
    const store = await readAllFromFile();
    store.set(next.tenantId, next);
    await writeAllToFile(store);
  }
  return next;
}

export async function deleteTenantTheme(tenantId: string): Promise<boolean> {
  if (hasKv()) {
    await deleteFromKv(tenantId);
    return true;
  }
  const store = await readAllFromFile();
  const deleted = store.delete(tenantId);
  if (deleted) await writeAllToFile(store);
  return deleted;
}

// ── Per-tenant DESIGN.md (generated by factory Stage 11) ────────────────────

function designKey(tenantId: string): string {
  return `tenant-design:${tenantId}`;
}

export async function getTenantDesignMd(tenantId: string): Promise<string | null> {
  if (hasKv()) {
    const { kv } = await import("@vercel/kv");
    return kv.get<string>(designKey(tenantId));
  }
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  try {
    return await readFile(join(process.cwd(), "data", "tenant-designs", `${tenantId}.md`), "utf-8");
  } catch {
    return null;
  }
}

// ── Color math (WCAG contrast + brand-derived vars) ──────────────────────────

const WHITE = "#ffffff";
const DARK_INK = "#0b1220"; // sf-neutral-10 — used when white text fails on brand

/** Parse #rrggbb → [r,g,b] (0–255). Falls back to SF Blue on malformed input. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return [1, 118, 211];
  const int = parseInt(clean.slice(1), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Space-separated "r g b" triplet for the `rgb(var(--x) / <alpha>)` pattern. */
export function hexToRgbTriplet(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/** WCAG 2.1 relative luminance of an sRGB color. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colors (1.0 – 21.0). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Return `hex` if it already meets `min` contrast against white; otherwise
 * darken it toward black in 5% steps until it does. Used for brand-colored
 * *text* on white surfaces (links, "Xem tất cả"), where a light tenant primary
 * would otherwise be illegible.
 */
export function ensureContrastOnWhite(hex: string, min = 4.5): string {
  if (contrastRatio(hex, WHITE) >= min) return hex.toLowerCase();
  let [r, g, b] = hexToRgb(hex);
  for (let i = 0; i < 24; i++) {
    r *= 0.95;
    g *= 0.95;
    b *= 0.95;
    const next = rgbToHex(r, g, b);
    if (contrastRatio(next, WHITE) >= min) return next;
  }
  return DARK_INK;
}

// ── CSS variable helpers ─────────────────────────────────────────────────────

export function themeToCssVariables(theme: TenantTheme): string {
  const textColor = theme.sidebarTextColor ?? "#ffffff";
  const primary = theme.primaryColor;
  const neutral = theme.neutralColor;
  const palette = resolveChartPalette(theme);
  return [
    `--brand-primary: ${primary};`,
    // -rgb triplets enable Tailwind alpha utilities (bg-brand/8, ring-brand/10…)
    `--brand-primary-rgb: ${hexToRgbTriplet(primary)};`,
    `--brand-primary-hover: color-mix(in oklab, ${primary} 88%, black);`,
    `--brand-primary-subtle: color-mix(in oklab, ${primary} 8%, white);`,
    // white text on solid brand only when it clears AA, else dark ink
    `--brand-on-primary: ${contrastRatio(primary, WHITE) >= 4.5 ? WHITE : DARK_INK};`,
    // brand-colored text on white, darkened until AA-legible
    `--brand-primary-text: ${ensureContrastOnWhite(primary, 4.5)};`,
    `--brand-secondary: ${theme.secondaryColor};`,
    `--brand-neutral: ${neutral};`,
    `--brand-neutral-rgb: ${hexToRgbTriplet(neutral)};`,
    `--sidebar-text: ${textColor};`,
    // Alpha levels kept ≥ 65% so secondary/tertiary sidebar text clears WCAG AA
    // against the sidebar background on BOTH dark and light presets (FX-08).
    `--sidebar-text-muted: ${textColor}b3;`,
    `--sidebar-text-dim: ${textColor}a6;`,
    `--font-sans: ${theme.fontFamily}, Inter, system-ui, sans-serif;`,
    ...palette.map((c, i) => `--brand-chart-${i + 1}: ${c};`),
  ].join(" ");
}

/**
 * The categorical chart palette for a tenant. Uses the stored `chartPalette`
 * when present; otherwise derives a brand-led default (primary → secondary →
 * neutral, then a fixed set of accessible accents) so every tenant — including
 * ones provisioned before this field existed — gets on-brand charts.
 * Always returns MAX_CHART_COLORS entries.
 */
export function resolveChartPalette(theme: Pick<TenantTheme, "primaryColor" | "secondaryColor" | "neutralColor" | "chartPalette">): string[] {
  const stored = theme.chartPalette?.filter((c) => HEX.test(c));
  const seed = stored && stored.length > 0 ? stored : deriveChartPalette(theme);
  // Pad to MAX_CHART_COLORS by cycling, so `--brand-chart-N` is always defined.
  const out: string[] = [];
  for (let i = 0; i < MAX_CHART_COLORS; i++) {
    out.push((seed[i % seed.length] ?? "#0176d3").toLowerCase());
  }
  return out;
}

// Deterministic brand-led categorical palette: the three brand colors first
// (so charts read as "this tenant"), then fixed accents chosen to stay
// distinguishable on white at typical chart mark sizes.
const _CHART_ACCENTS = ["#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#db2777"];

function deriveChartPalette(theme: Pick<TenantTheme, "primaryColor" | "secondaryColor" | "neutralColor">): string[] {
  const brand = [theme.primaryColor, theme.secondaryColor, theme.neutralColor].filter((c) => HEX.test(c));
  const seen = new Set(brand.map((c) => c.toLowerCase()));
  const accents = _CHART_ACCENTS.filter((c) => !seen.has(c.toLowerCase()));
  return [...brand, ...accents].slice(0, MAX_CHART_COLORS);
}

function sanitizeChartPalette(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const c of input) {
    if (typeof c === "string" && HEX.test(c)) out.push(c.toLowerCase());
    if (out.length >= MAX_CHART_COLORS) break;
  }
  return out;
}

function pickHex(candidate: string | undefined, fallback: string): string {
  if (candidate && HEX.test(candidate)) return candidate.toLowerCase();
  return fallback;
}

function isTone(v: unknown): v is Tone {
  return v === "professional" || v === "playful" || v === "technical";
}

function isLogoLayout(v: unknown): v is LogoLayout {
  return v === "icon" || v === "wordmark" || v === "wordmark-light";
}

function isHeroVariant(v: unknown): v is HeroVariant {
  return v === "aurora" || v === "editorial" || v === "spotlight";
}
