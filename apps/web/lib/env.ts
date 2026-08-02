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
   * Set this to a real user on YOUR Tableau site.
   * Example: TABLEAU_EMBED_USER=you@yourcompany.com
   */
  TABLEAU_EMBED_USER: z.string().email().optional(),

  // Service-account (used by MCP sidecar; not required in Phase 1)
  TABLEAU_PAT_NAME: z.string().optional(),
  TABLEAU_PAT_SECRET: z.string().optional(),

  // Anthropic (optional until Phase 3)
  // First-party Anthropic Console key. Used unless a Bedrock gateway is configured below.
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),

  // ── Alternative: route the agent through a Bedrock-compatible gateway ────────
  // For SEs whose org provides Claude via an internal Amazon Bedrock proxy
  // (e.g. a corporate gateway reachable over VPN) instead of a personal
  // sk-ant key. When ANTHROPIC_BEDROCK_BASE_URL is set, the agent uses the
  // Bedrock path (resolveAnthropicConfig in lib/anthropic-config.ts) instead of
  // the first-party API.
  //
  // NOTE: this path requires the `@anthropic-ai/bedrock-sdk` dependency, which
  // is NOT yet installed — see the TODO in lib/agent.ts. Setting these vars
  // without completing that step yields a clear runtime error, not a silent
  // fallback. Declared here now so config + docs are ready for that step.
  //
  // Corresponds to Claude Code's own CLAUDE_CODE_USE_BEDROCK / *_BASE_URL /
  // CLAUDE_CODE_SKIP_BEDROCK_AUTH env vars.
  ANTHROPIC_BEDROCK_BASE_URL: z.string().url().optional(),
  // AWS region for the Bedrock endpoint + inference-profile model IDs. The
  // bedrock-sdk also reads AWS_REGION directly; declared here so validation and
  // the resolved config agree. Defaults to us-east-1 downstream when unset.
  AWS_REGION: z.string().optional(),
  // When true (the default whenever a gateway base URL is set), the SDK does NOT
  // attach AWS SigV4 — the gateway authenticates the caller (via VPN). Mirrors
  // CLAUDE_CODE_SKIP_BEDROCK_AUTH. Set to "false" only if the gateway expects
  // SigV4-signed requests with real AWS credentials.
  ANTHROPIC_BEDROCK_SKIP_AUTH: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .optional(),
  // Bedrock model / inference-profile ID for the agent, e.g.
  // "us.anthropic.claude-sonnet-4-6-20260514-v1:0". REQUIRED on the Bedrock path:
  // first-party IDs like "claude-sonnet-4-6" are not valid Bedrock model IDs.
  ANTHROPIC_BEDROCK_MODEL: z.string().optional(),

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
