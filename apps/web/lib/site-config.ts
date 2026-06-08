/**
 * Multi-site configuration registry.
 *
 * Each SiteConfig maps a logical site ID to one Tableau Cloud site + its
 * Connected App credentials + Railway MCP/Factory sidecar URLs.
 *
 * Secrets (connectedAppSecretValue) are stored AES-256-GCM encrypted at rest
 * in Vercel KV (or data/site-configs.json locally). The encryption key lives
 * in the SITE_CONFIG_ENCRYPTION_KEY env var and never touches the store.
 *
 * Server-side only.
 */

import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export const INDUSTRY_OPTIONS = [
  "retail-ecommerce",
  "retail-banking",
  "manufacturing",
  "healthcare",
  "logistics",
] as const;

export type Industry = (typeof INDUSTRY_OPTIONS)[number];

export interface SiteConfig {
  /** Unique slug, e.g. "site-retail-bank". */
  id: string;
  /** Human-readable label shown in admin UI. */
  label: string;
  /** Industries this site hosts, for filtering in admin. */
  industries: Industry[];
  /** Tableau Cloud site URL, e.g. https://prod-apsoutheast-c.online.tableau.com/#/site/retail */
  tableauSite: string;
  /** Tableau site contentUrl (short name), e.g. "retail" */
  tableauSiteName: string;
  /** Tableau Cloud API version, e.g. "2026.1" */
  tableauSiteVersion: string;
  /** Connected App client UUID */
  connectedAppClientId: string;
  /** Connected App secret UUID */
  connectedAppSecretId: string;
  /**
   * Connected App secret value — stored encrypted in KV/file.
   * When reading from storage this is the ciphertext; getSiteConfig() decrypts
   * it before returning so callers always receive the plaintext.
   */
  connectedAppSecretValue: string;
  /** @tableau/mcp-server HTTP URL on Railway (optional; falls back to env) */
  mcpUrl?: string;
  /** FastAPI factory sidecar URL on Railway (optional; falls back to env) */
  factoryUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type SiteConfigPublic = Omit<SiteConfig, "connectedAppSecretValue">;

export interface UpsertSiteConfigInput {
  id: string;
  label: string;
  industries: Industry[];
  tableauSite: string;
  tableauSiteName: string;
  tableauSiteVersion: string;
  connectedAppClientId: string;
  connectedAppSecretId: string;
  /** Pass plaintext; the store encrypts it. Pass empty string to keep existing. */
  connectedAppSecretValue: string;
  mcpUrl?: string;
  factoryUrl?: string;
}

// ── Encryption ────────────────────────────────────────────────────────────────

const ALGO = "aes-256-gcm";

function getEncKey(): Buffer | null {
  const hex = process.env.SITE_CONFIG_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext: string): string {
  const key = getEncKey();
  if (!key) return `plain:${plaintext}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(stored: string): string {
  if (stored.startsWith("plain:")) return stored.slice(6);
  if (!stored.startsWith("enc:")) return stored;
  const key = getEncKey();
  if (!key) throw new Error("SITE_CONFIG_ENCRYPTION_KEY not set but found encrypted secret");
  const [, ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted secret");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
}

// ── Storage ───────────────────────────────────────────────────────────────────

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function kvKey(id: string): string {
  return `site-config:${id}`;
}

const INDEX_KEY = "site-config:__index__";

async function readIndexFromKv(): Promise<string[]> {
  const { kv } = await import("@vercel/kv");
  return (await kv.get<string[]>(INDEX_KEY)) ?? [];
}

async function writeIndexToKv(ids: string[]): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(INDEX_KEY, ids);
}

async function readFromKv(id: string): Promise<SiteConfig | null> {
  const { kv } = await import("@vercel/kv");
  const raw = await kv.get<SiteConfig>(kvKey(id));
  if (!raw) return null;
  return { ...raw, connectedAppSecretValue: decrypt(raw.connectedAppSecretValue) };
}

async function writeToKv(cfg: SiteConfig): Promise<void> {
  const { kv } = await import("@vercel/kv");
  const stored = { ...cfg, connectedAppSecretValue: encrypt(cfg.connectedAppSecretValue) };
  await kv.set(kvKey(cfg.id), stored);
  const index = await readIndexFromKv();
  if (!index.includes(cfg.id)) {
    await writeIndexToKv([...index, cfg.id]);
  }
}

async function deleteFromKv(id: string): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.del(kvKey(id));
  const index = await readIndexFromKv();
  await writeIndexToKv(index.filter((i) => i !== id));
}

// ── File fallback ─────────────────────────────────────────────────────────────

import { join } from "path";

async function readAllFromFile(): Promise<Map<string, SiteConfig>> {
  const { readFile } = await import("fs/promises");
  try {
    const raw = await readFile(join(process.cwd(), "data", "site-configs.json"), "utf-8");
    const arr = JSON.parse(raw) as SiteConfig[];
    return new Map(
      arr.map((c) => [c.id, { ...c, connectedAppSecretValue: decrypt(c.connectedAppSecretValue) }]),
    );
  } catch {
    return new Map();
  }
}

async function writeAllToFile(store: Map<string, SiteConfig>): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const dir = join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  const arr = [...store.values()].map((c) => ({
    ...c,
    connectedAppSecretValue: encrypt(c.connectedAppSecretValue),
  }));
  await writeFile(join(dir, "site-configs.json"), JSON.stringify(arr, null, 2) + "\n", "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listSiteConfigs(): Promise<SiteConfigPublic[]> {
  if (hasKv()) {
    const index = await readIndexFromKv();
    const configs = await Promise.all(index.map(readFromKv));
    return configs
      .filter((c): c is SiteConfig => c !== null)
      .map(({ connectedAppSecretValue: _s, ...rest }) => rest)
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  const store = await readAllFromFile();
  return [...store.values()]
    .map(({ connectedAppSecretValue: _s, ...rest }) => rest)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getSiteConfig(id: string): Promise<SiteConfig | null> {
  if (hasKv()) return readFromKv(id);
  const store = await readAllFromFile();
  return store.get(id) ?? null;
}

export async function upsertSiteConfig(input: UpsertSiteConfigInput): Promise<SiteConfigPublic> {
  const now = new Date().toISOString();
  let secretValue = input.connectedAppSecretValue;

  if (!secretValue) {
    // Keep existing secret if none provided on update
    const existing = await getSiteConfig(input.id);
    if (!existing) throw new Error("connectedAppSecretValue required for new site config");
    secretValue = existing.connectedAppSecretValue;
  }

  const cfg: SiteConfig = {
    id: input.id,
    label: input.label,
    industries: input.industries,
    tableauSite: input.tableauSite,
    tableauSiteName: input.tableauSiteName,
    tableauSiteVersion: input.tableauSiteVersion,
    connectedAppClientId: input.connectedAppClientId,
    connectedAppSecretId: input.connectedAppSecretId,
    connectedAppSecretValue: secretValue,
    ...(input.mcpUrl ? { mcpUrl: input.mcpUrl } : {}),
    ...(input.factoryUrl ? { factoryUrl: input.factoryUrl } : {}),
    createdAt: (await getSiteConfig(input.id))?.createdAt ?? now,
    updatedAt: now,
  };

  if (hasKv()) {
    await writeToKv(cfg);
  } else {
    const store = await readAllFromFile();
    store.set(cfg.id, cfg);
    await writeAllToFile(store);
  }

  const { connectedAppSecretValue: _s, ...pub } = cfg;
  return pub;
}

export async function deleteSiteConfig(id: string): Promise<boolean> {
  if (hasKv()) {
    const existing = await readFromKv(id);
    if (!existing) return false;
    await deleteFromKv(id);
    return true;
  }
  const store = await readAllFromFile();
  const deleted = store.delete(id);
  if (deleted) await writeAllToFile(store);
  return deleted;
}
