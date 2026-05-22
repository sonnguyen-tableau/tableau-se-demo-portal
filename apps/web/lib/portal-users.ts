/**
 * Portal user store — persists to Vercel KV (prod) or data/portal-users.json (local dev).
 * Passwords are hashed with scrypt. DEV_USERS_JSON users are handled separately in auth.ts.
 */
import crypto from "crypto";

export interface PortalUser {
  email: string;
  passwordHash: string;
  tenantId: string;
  tenantName: string;
  region?: "NA" | "EMEA" | "APAC";
  groups: string[];
  /** null = user sees all workbooks; string[] = allowlist of workbook IDs */
  allowedWorkbookIds: string[] | null;
  createdAt: number;
}

export type PortalUserPublic = Omit<PortalUser, "passwordHash">;

// ── Password hashing ────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  try {
    const stored64 = Buffer.from(hashHex, "hex");
    const check64 = crypto.scryptSync(password, salt, 32);
    return stored64.length === check64.length && crypto.timingSafeEqual(stored64, check64);
  } catch {
    return false;
  }
}

// ── Storage ─────────────────────────────────────────────────────────────────

const KV_KEY = "portal-users";

function hasKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readFromKv(): Promise<PortalUser[]> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<PortalUser[]>(KV_KEY);
  return Array.isArray(stored) ? stored : [];
}

async function writeToKv(users: PortalUser[]): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(KV_KEY, users);
}

async function readFromFile(): Promise<PortalUser[]> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  try {
    const raw = await readFile(join(process.cwd(), "data", "portal-users.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as PortalUser[];
  } catch {
    // missing or malformed — treat as empty
  }
  return [];
}

async function writeToFile(users: PortalUser[]): Promise<void> {
  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const dir = join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "portal-users.json"), JSON.stringify(users, null, 2) + "\n", "utf-8");
}

async function readAll(): Promise<PortalUser[]> {
  return hasKv() ? readFromKv() : readFromFile();
}

async function writeAll(users: PortalUser[]): Promise<void> {
  return hasKv() ? writeToKv(users) : writeToFile(users);
}

// ── Public CRUD ──────────────────────────────────────────────────────────────

export async function listPortalUsers(): Promise<PortalUserPublic[]> {
  const users = await readAll();
  return users.map(({ passwordHash: _ph, ...rest }) => rest);
}

export async function getPortalUser(email: string): Promise<PortalUserPublic | null> {
  const users = await readAll();
  const u = users.find((u) => u.email === email);
  if (!u) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const { passwordHash: _ph, ...rest } = u;
  return rest;
}

export interface UpsertPortalUserInput {
  email: string;
  /** Required for create; omit or empty to keep existing password on update */
  password?: string;
  tenantId: string;
  tenantName: string;
  region?: "NA" | "EMEA" | "APAC";
  groups: string[];
  allowedWorkbookIds: string[] | null;
}

export async function upsertPortalUser(input: UpsertPortalUserInput): Promise<void> {
  const users = await readAll();
  const idx = users.findIndex((u) => u.email === input.email);

  if (idx === -1) {
    // Create
    if (!input.password) throw new Error("Password required for new user");
    users.push({
      email: input.email,
      passwordHash: hashPassword(input.password),
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      ...(input.region ? { region: input.region } : {}),
      groups: input.groups,
      allowedWorkbookIds: input.allowedWorkbookIds,
      createdAt: Date.now(),
    });
  } else {
    // Update — preserve passwordHash if no new password provided
    const existing = users[idx]!;
    const updated: PortalUser = {
      ...existing,
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      groups: input.groups,
      allowedWorkbookIds: input.allowedWorkbookIds,
      passwordHash: input.password ? hashPassword(input.password) : existing.passwordHash,
    };
    if (input.region) {
      updated.region = input.region;
    } else {
      delete updated.region;
    }
    users[idx] = updated;
  }

  await writeAll(users);
}

export async function deletePortalUser(email: string): Promise<void> {
  const users = await readAll();
  await writeAll(users.filter((u) => u.email !== email));
}

/** Returns the user if credentials are valid, null otherwise. */
export async function verifyPortalUser(email: string, password: string): Promise<PortalUserPublic | null> {
  const users = await readAll();
  const u = users.find((u) => u.email === email);
  if (!u) return null;
  if (!verifyHash(password, u.passwordHash)) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const { passwordHash: _ph, ...rest } = u;
  return rest;
}

/**
 * Returns the workbook ID allowlist for a user.
 * null = no restriction (user sees all workbooks).
 */
export async function getWorkbookFilter(email: string): Promise<Set<string> | null> {
  const users = await readAll();
  const u = users.find((u) => u.email === email);
  if (!u) return null; // unknown user (e.g. from DEV_USERS_JSON) — no restriction
  if (!u.allowedWorkbookIds) return null; // explicitly unrestricted
  return new Set(u.allowedWorkbookIds);
}
