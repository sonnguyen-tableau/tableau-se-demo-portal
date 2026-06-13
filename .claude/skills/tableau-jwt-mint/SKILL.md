---
name: Tableau Connected App JWT Mint
description: Use when minting a Connected App Direct Trust JWT for the Tableau Embedding API v3. Covers required and optional claims, scope values per embed type, HS256 signing with jose, multi-tenant user attributes (TenantId, Region), 10-minute TTL, anti-replay jti, and the common mistakes that cause silent re-login prompts.
dependencies: jose@^5
---

# Tableau Connected App JWT Mint

Use this skill any time you need to mint, refresh, debug, or review a JWT used by the Tableau Embedding API v3 with a Connected App configured for **Direct Trust**. This is the project's locked auth model.

## When to use

- Implementing or changing `/api/tableau/token` in `apps/web/`.
- Reviewing how user-attribute claims map to workbook `USERATTRIBUTE()` calls.
- Diagnosing a "Tableau login prompt appears inside the embed" or `unknown-auth-error` symptom.
- Writing or updating tests for the JWT minter.

## Required claims (must all be present)

| Claim | Value | Notes |
| --- | --- | --- |
| `iss` | Connected App **Client ID** | from Tableau Cloud admin UI |
| `kid` | Connected App **Secret ID** | identifies which secret signed this JWT |
| `aud` | `"tableau"` | literal string |
| `sub` | Tableau user identity (email) | must be a known Tableau user (or UBL anonymous) |
| `scp` | array of scope strings | see scope table below |
| `jti` | `crypto.randomUUID()` | anti-replay; must be unique per token |
| `exp` | now + **600 seconds (10 min max)** | Tableau rejects longer-lived tokens |
| `iat` | now (seconds) | issued-at |
| `nbf` | now (seconds) | not-before |

## Scope values (`scp`) per embed type

| Component | Required scope(s) |
| --- | --- |
| `<TableauViz>` | `tableau:views:embed` |
| `<TableauPulse>` | `tableau:insights:embed` |
| `<TableauAuthoringViz>` | `tableau:views:embed_authoring`, `tableau:views:embed` |
| Mixed page (viz + pulse) | both `tableau:views:embed` and `tableau:insights:embed` |

Always include every scope the page needs in ONE JWT and reuse it across all components on that page.

## Multi-tenant user-attribute claims

These are arbitrary top-level claims that workbooks consume via `USERATTRIBUTE("Name")`. The Tableau Cloud site setting **Enable capture of user attributes in authentication workflows** must be ON for these to take effect.

```
TenantId   → consumed by data policies for row-level security
Region     → optional geo filter ("NA" | "EMEA" | "APAC")
AccountId  → optional, used when a tenant has sub-accounts
```

For dynamic group membership (e.g., "internal-employees" sees all tenants), use the reserved namespaced claim:

```
"https://tableau.com/groups": ["tenant-acme", "internal-employees"]
```

For Tableau Cloud on-demand access, include:

```
"https://tableau.com/oda": "true"
```

## Reference implementation (canonical)

```ts
// apps/web/lib/tableau-jwt.ts
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

export type TableauScope =
  | "tableau:views:embed"
  | "tableau:views:embed_authoring"
  | "tableau:insights:embed";

export interface MintParams {
  sub: string;                          // user email
  scopes: TableauScope[];               // one or more
  tenantId: string;
  region?: "NA" | "EMEA" | "APAC";
  groups?: string[];                    // optional Tableau groups
  onDemandAccess?: boolean;             // Tableau Cloud only
}

const TEN_MIN = 60 * 10;

export async function mintTableauJwt(p: MintParams): Promise<string> {
  const clientId = required("TABLEAU_CONNECTED_APP_CLIENT_ID");
  const secretId = required("TABLEAU_CONNECTED_APP_SECRET_ID");
  const secret = required("TABLEAU_CONNECTED_APP_SECRET_VALUE");
  const now = Math.floor(Date.now() / 1000);

  const builder = new SignJWT({
    scp: p.scopes,
    TenantId: p.tenantId,
    ...(p.region ? { Region: p.region } : {}),
    ...(p.groups?.length ? { "https://tableau.com/groups": p.groups } : {}),
    ...(p.onDemandAccess ? { "https://tableau.com/oda": "true" } : {}),
  })
    .setProtectedHeader({ alg: "HS256", kid: secretId, iss: clientId })
    .setIssuer(clientId)
    .setSubject(p.sub)
    .setAudience("tableau")
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + TEN_MIN);

  return builder.sign(new TextEncoder().encode(secret));
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}
```

## Route handler skeleton

```ts
// apps/web/app/api/tableau/token/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mintTableauJwt } from "@/lib/tableau-jwt";
import { enforceImpressionBudget } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });

  const { scopes } = (await req.json()) as { scopes: string[] };
  await enforceImpressionBudget(session.user.tenantId); // throws 429 on budget breach

  const jwt = await mintTableauJwt({
    sub: session.user.email,
    scopes: scopes as never,
    tenantId: session.user.tenantId,
    region: session.user.region,
    groups: session.user.groups,
  });
  return NextResponse.json({ token: jwt, expiresIn: 600 });
}
```

## TABLEAU_EMBED_USER — demo user pattern

Demo portals have users (`vincom@demo.com`, `bank@demo.com`) that **do not exist** on the Tableau site. Embedding with their email as `sub` causes **401 code:16**.

Solution: `TABLEAU_EMBED_USER=son.nguyen@salesforce.com` in env. This real Tableau user acts as the embed identity for all demo sessions.

**Every code path that mints a JWT must use this pattern:**
```ts
const embedSub = env.TABLEAU_EMBED_USER ?? session.user.email ?? "";
// then: sub: embedSub
```

This applies to:
- `/api/tableau/token/route.ts` — the client-side token refresh endpoint
- `dashboards/[wb]/[view]/page.tsx` — server-side initial token mint

Forgetting `TABLEAU_EMBED_USER` in page.tsx while having it in route.ts means: initial load gets 401, retry via `/api/tableau/token` succeeds, user sees brief error flash.

## TABLEAU_ODA — must be false unless explicitly enabled

`TABLEAU_ODA=true` adds `"https://tableau.com/oda": "true"` to the JWT. Tableau rejects this with 401 code:16 if the Connected App does not have On-Demand Access enabled.

Default: `TABLEAU_ODA=false` (env schema transforms `"false"` → `false`).

## Diagnosing 401 code:16

Server-to-server JWT signin (REST API) bypasses domain allowlist checks. Browser embed does not. When server passes but browser fails:

1. Check domain allowlist on Connected App (includes prod URL, preview URLs, localhost:3000)
2. Check `TABLEAU_ODA` — must match Connected App ODA setting
3. Check `TABLEAU_EMBED_USER` is set and is a real user on the site
4. Use `/api/debug` (GET, internal-only) — runs all three checks server-side and returns full diagnostics

## Common mistakes (causes silent failures)

1. **Caching JWTs across users.** Every call must mint fresh; `sub` must match the actual user.
2. **Different tokens for `<TableauViz>` and `<TableauPulse>` on the same page.** Causes intermittent re-login prompts. Mint once, pass same token to both.
3. **Missing `scp`.** Tableau returns generic "authentication failed" with no detail.
4. **TTL > 10 minutes.** Tableau silently rejects. Stay ≤ 600 seconds.
5. **Wrong `kid`.** If you rotate the Connected App secret, both `kid` and `TABLEAU_CONNECTED_APP_SECRET_VALUE` must update atomically.
6. **Using `session.user.email` as `sub` without checking `TABLEAU_EMBED_USER`.** Demo users don't exist on the Tableau site — always check `env.TABLEAU_EMBED_USER` first.
7. **`TABLEAU_ODA=true` without ODA enabled on Connected App.** 401 code:16 in browser, passes in server tests.
8. **Forgetting the user-attribute site setting.** `USERATTRIBUTE("TenantId")` returns null silently — security incident.

## Verifying a minted JWT

```bash
# Quick decode (does not verify signature; for debug only)
node -e 'console.log(JSON.parse(Buffer.from(process.argv[1].split(".")[1], "base64url").toString()))' "$JWT"
```

Look for: `aud=tableau`, `scp` contains the expected scope, `exp - iat == 600`, `TenantId` matches the user's tenant.

## Related skills

- `multitenant-rls` — how `TenantId` flows from JWT to workbook to data policy.
- `tableau-embed-component` — how to pass the minted JWT into the React components correctly.
