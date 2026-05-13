import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import type { MintParams, TableauJwtConfig } from "./types";

export const JWT_TTL_SECONDS = 600;

/**
 * Mint a Tableau Connected App (Direct Trust) JWT.
 *
 * The signature uses HS256 with the connected-app shared secret. The token
 * must be ≤ 10 minutes (600s) — Tableau Cloud rejects longer-lived tokens.
 *
 * Every component on a single page MUST receive the same token. Mint once
 * per page load; do not cache or reuse across users.
 *
 * @throws Error when TTL > 600 or required claims are missing.
 */
export async function mintTableauJwt(
  config: TableauJwtConfig,
  params: MintParams,
): Promise<string> {
  if (!config.clientId || !config.secretId || !config.secretValue) {
    throw new Error("mintTableauJwt: incomplete connected-app config");
  }
  if (!params.sub || !params.tenantId || params.scopes.length === 0) {
    throw new Error("mintTableauJwt: sub, tenantId, and at least one scope are required");
  }

  const ttl = Math.min(params.ttlSeconds ?? JWT_TTL_SECONDS, JWT_TTL_SECONDS);
  if (ttl <= 0) throw new Error("mintTableauJwt: ttlSeconds must be > 0");

  const now = Math.floor(Date.now() / 1000);

  const userAttributes: Record<string, string> = { TenantId: params.tenantId };
  if (params.region) userAttributes.Region = params.region;
  if (params.accountId) userAttributes.AccountId = params.accountId;

  const builder = new SignJWT({
    scp: [...params.scopes],
    ...userAttributes,
    ...(params.groups && params.groups.length > 0
      ? { "https://tableau.com/groups": [...params.groups] }
      : {}),
    ...(params.onDemandAccess ? { "https://tableau.com/oda": "true" } : {}),
  })
    .setProtectedHeader({ alg: "HS256", kid: config.secretId, iss: config.clientId })
    .setIssuer(config.clientId)
    .setSubject(params.sub)
    .setAudience("tableau")
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttl);

  return builder.sign(new TextEncoder().encode(config.secretValue));
}
