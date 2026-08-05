import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Make `.env.local` authoritative over the shell environment.
 *
 * Next.js loads `.env.local` but does NOT override a variable already present
 * in `process.env`. On dev machines the shell often exports Claude Code / SF
 * gateway vars (ANTHROPIC_BASE_URL, TABLEAU_MCP_URL, CLAUDE_CODE_USE_BEDROCK, …)
 * — those silently won over `.env.local`, e.g. shell `TABLEAU_MCP_URL` without
 * the v4 `/tableau-mcp` path broke the MCP sidecar connection.
 *
 * This re-reads `.env.local` and force-applies its values, so the file is the
 * single source of truth locally. Runs in Node at config-eval time, before the
 * app's `lib/env.ts` / route handlers are imported. No-op when the file is
 * absent (e.g. on Vercel, where env comes from the dashboard).
 */
function overrideFromEnvLocal(): void {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "apps/web/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) return;

  const applied: string[] = [];
  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding single/double quotes (value may contain '=' or '#').
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] !== val) {
      process.env[key] = val;
      applied.push(key);
    }
  }
  if (applied.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[env] .env.local override applied to: ${applied.join(", ")}`);
  }
}

overrideFromEnvLocal();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ["@portal/tableau-jwt", "@portal/mcp-tools"],
  webpack(config, { isServer }) {
    if (!isServer) {
      // vega-canvas (pulled in by vega-embed) tries to resolve the native
      // `canvas` package and Node's `fs/promises` for server-side rendering.
      // Neither exists in the browser bundle — stub them so the build passes.
      config.resolve.fallback = {
        ...(config.resolve.fallback as Record<string, unknown> | undefined),
        canvas: false,
        "fs/promises": false,
        fs: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
