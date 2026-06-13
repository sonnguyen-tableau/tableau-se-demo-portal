/**
 * GET /api/debug — internal-only diagnostic endpoint.
 * DELETE this file after debugging.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { env } from "@/lib/env";
import { tableauOrigin } from "@/lib/tableau-config";
import { mintTableauJwt } from "@portal/tableau-jwt";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  const clientId = env.TABLEAU_CONNECTED_APP_CLIENT_ID ?? "";
  const secretId = env.TABLEAU_CONNECTED_APP_SECRET_ID ?? "";
  const secretValue = env.TABLEAU_CONNECTED_APP_SECRET_VALUE ?? "";
  const siteName = env.TABLEAU_SITE_NAME ?? "";
  const embedUser = env.TABLEAU_EMBED_USER ?? session.user?.email ?? "";
  const origin = tableauOrigin();

  // 1. Mint a test JWT and decode it
  let jwtPayload: unknown = null;
  let jwtError: string | null = null;
  let token: string | null = null;
  try {
    token = await mintTableauJwt(
      { clientId, secretId, secretValue },
      { sub: embedUser, scopes: ["tableau:views:embed"], tenantId: "debug" },
    );
    const parts = token.split(".");
    jwtPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch (e) {
    jwtError = String(e);
  }

  // 2. Test Tableau PAT sign-in (proves network + PAT is valid)
  let tableauSignIn: unknown = null;
  if (env.TABLEAU_PAT_NAME && env.TABLEAU_PAT_SECRET) {
    try {
      const res = await fetch(`${origin}/api/3.20/auth/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          credentials: {
            personalAccessTokenName: env.TABLEAU_PAT_NAME,
            personalAccessTokenSecret: env.TABLEAU_PAT_SECRET,
            site: { contentUrl: siteName },
          },
        }),
      });
      const body = await res.json();
      tableauSignIn = { status: res.status, ok: res.ok, body };
      // Sign out immediately
      if (res.ok) {
        const t = (body as { credentials?: { token?: string } }).credentials?.token;
        if (t) void fetch(`${origin}/api/3.20/auth/signout`, { method: "POST", headers: { "X-Tableau-Auth": t } });
      }
    } catch (e) {
      tableauSignIn = { error: String(e) };
    }
  }

  // 3. Test embed JWT against Tableau — try to fetch user info with it
  let embedAuthTest: unknown = null;
  if (token) {
    try {
      // Tableau doesn't have a direct "validate JWT" endpoint, but we can
      // try to sign-in with the connected-app JWT via trusted auth
      const res = await fetch(`${origin}/api/3.20/auth/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          credentials: {
            jwt: token,
            site: { contentUrl: siteName },
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      embedAuthTest = { status: res.status, ok: res.ok, body };
    } catch (e) {
      embedAuthTest = { error: String(e) };
    }
  }

  return NextResponse.json({
    config: {
      clientId: clientId.slice(0, 8) + "...",
      secretId: secretId.slice(0, 8) + "...",
      secretValue: secretValue ? `SET (${secretValue.length} chars)` : "MISSING",
      siteName,
      embedUser,
      oda: env.TABLEAU_ODA,
      origin,
    },
    jwtPayload,
    jwtError,
    tableauSignIn,
    embedAuthTest,
    _jti: randomUUID(), // confirms endpoint ran fresh
  });
}
