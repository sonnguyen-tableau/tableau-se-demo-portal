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

  // Tableau Cloud
  TABLEAU_SITE: z.string().url(),
  TABLEAU_SITE_NAME: z.string().min(1),
  TABLEAU_SITE_VERSION: z.string().regex(/^\d{4}\.\d+$/, "Format: YYYY.minor (e.g. 2026.1)"),
  TABLEAU_CONNECTED_APP_CLIENT_ID: z.string().min(1),
  TABLEAU_CONNECTED_APP_SECRET_ID: z.string().min(1),
  TABLEAU_CONNECTED_APP_SECRET_VALUE: z.string().min(16),
  /** Set to "true" to include the ODA claim — requires Connected App to have On-Demand Access enabled. */
  TABLEAU_ODA: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),

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
