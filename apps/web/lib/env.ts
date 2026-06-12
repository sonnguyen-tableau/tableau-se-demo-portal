import { z } from "zod";

/**
 * Server-only environment variable schema. Never import this from a client
 * component — it is read at startup and validated once.
 */
const schema = z.object({
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be ≥32 chars (openssl rand -base64 32)"),
  AUTH_URL: z.string().url().optional(),

  DEV_USERS_JSON: z
    .string()
    .optional()
    .describe("JSON array of dev users — only honored when PORTAL_ENV=dev"),

  // Tableau Cloud — all optional when per-site SiteConfig registry is used.
  // For single-site deployments without /admin/sites, set these as the fallback.
  // No strict format validation here — isTableauConfigured() guards at runtime.
  TABLEAU_SITE: z.string().optional(),
  TABLEAU_SITE_NAME: z.string().optional(),
  TABLEAU_SITE_VERSION: z.string().optional(),
  TABLEAU_CONNECTED_APP_CLIENT_ID: z.string().optional(),
  TABLEAU_CONNECTED_APP_SECRET_ID: z.string().optional(),
  TABLEAU_CONNECTED_APP_SECRET_VALUE: z.string().optional(),
  /** Set to "true" to include the ODA claim — requires Connected App to have On-Demand Access enabled. */
  TABLEAU_ODA: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),
  /**
   * Fallback Tableau user email for embed JWTs when the session user does not
   * exist on the Tableau site. All demo/guest users share this identity for
   * embedding while keeping their own session for portal access.
   * Example: TABLEAU_EMBED_USER=son.nguyen@salesforce.com
   */
  TABLEAU_EMBED_USER: z.string().email().optional(),

  // Service-account (used by MCP sidecar; not required in Phase 1)
  TABLEAU_PAT_NAME: z.string().optional(),
  TABLEAU_PAT_SECRET: z.string().optional(),

  // Anthropic (optional until Phase 3)
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),

  // Sidecars (optional until later phases)
  TABLEAU_MCP_URL: z.string().url().optional(),
  FACTORY_URL: z.string().url().optional(),

  IMPRESSION_DAILY_CAP_PER_TENANT: z.coerce.number().int().positive().default(2000),
  PORTAL_ENV: z.enum(["dev", "preview", "staging", "prod"]).default("dev"),

  // Shared secret between the factory sidecar and the portal provision API.
  // Generate with: openssl rand -hex 32
  FACTORY_PROVISION_SECRET: z.string().min(16).optional(),

  // Multi-site: AES-256-GCM key for encrypting Connected App secrets at rest in KV.
  // 64 hex chars = 32 bytes. Required when using the /admin/sites UI in production.
  SITE_CONFIG_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex chars (openssl rand -hex 32)")
    .optional(),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

// Single-shot init; module-scoped so it runs once per process.
export const env: Env = loadEnv();
