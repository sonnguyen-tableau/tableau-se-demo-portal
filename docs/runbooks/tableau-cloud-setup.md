# Tableau Cloud Setup Runbook (Phase 1)

One-time setup for the Tableau Cloud site that hosts this portal. Run by a Tableau Cloud **Site Administrator Creator** before any application code can authenticate against the site.

## Outputs

By the end of this runbook you will have collected the following values into `.claude/settings.local.json` (and the matching `services/.env.local`):

| Env var | Where it comes from | Example |
| --- | --- | --- |
| `TABLEAU_SITE` | Tableau Cloud site URL | `https://10ax.online.tableau.com/#/site/myco` |
| `TABLEAU_SITE_NAME` | site contentUrl from the URL | `myco` |
| `TABLEAU_SITE_VERSION` | Tableau Cloud release (e.g. `2026.1`) | shown in Tableau Cloud Help → About |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` | Connected App admin UI | UUID |
| `TABLEAU_CONNECTED_APP_SECRET_ID` | Connected App secret detail | UUID |
| `TABLEAU_CONNECTED_APP_SECRET_VALUE` | Connected App secret detail (shown ONCE) | base64-ish string |
| `TABLEAU_PAT_NAME` | Service-account PAT name | `tableau-ai-portal-svc` |
| `TABLEAU_PAT_SECRET` | Service-account PAT value | base64-ish string |

## 1. Create a service-account user

In **Settings → Users**:

1. Create user `tableau-ai-portal-svc@<yourdomain>`.
2. Site role: **Site Administrator Explorer** (needed for REST publish + Pulse create).
3. Generate a **Personal Access Token (PAT)** for this user:
   - Sign in as the service account → My Account Settings → Personal Access Tokens.
   - Token name: `tableau-ai-portal-svc`.
   - Save the secret to `TABLEAU_PAT_SECRET`. **Shown ONCE.**

## 2. Enable user-attribute capture

In **Settings → Authentication**:

- Check **Enable capture of user attributes in authentication workflows.**

This is required for `USERATTRIBUTE("TenantId")` calculated filters to receive the value from our JWT. Without it, data policies silently allow everything. **This is non-optional — confirm it's on before you continue.**

## 3. Create the Connected App (Direct Trust)

In **Settings → Connected Apps**:

1. Click **New Connected App → Direct Trust**.
2. Name: `tableau-ai-portal`.
3. Applies to: **All projects** (or the specific project that holds shared workbooks if you want tighter scope — usually "All projects" for a multi-tenant portal).
4. Save. Copy the **Client ID** (UUID) → `TABLEAU_CONNECTED_APP_CLIENT_ID`.

### 3a. Generate a secret

1. Open the Connected App → **Secrets** tab → **Generate New Secret**.
2. Copy **Secret ID** → `TABLEAU_CONNECTED_APP_SECRET_ID`.
3. Copy **Secret Value** → `TABLEAU_CONNECTED_APP_SECRET_VALUE`. **Shown ONCE.**

### 3b. Domain allowlist

1. Connected App → **Domain Allowlist** tab.
2. Add every host that embeds Tableau content. Wildcards allowed:
   - `http://localhost:3000` (local dev)
   - `https://*.vercel.app` (preview deploys, if using Vercel) — narrow this later
   - `https://portal.<your-org>.com` (prod)
3. Save.

### 3c. Enable the Connected App

Toggle **Enabled** on the Connected App. Disabled apps reject all JWTs silently.

## 4. (Recommended) UBL — Usage-Based Licensing

If you have external customers in scope:

1. Contact your Tableau account team to enable UBL on the site.
2. Once active, an additional usage statement appears in **Settings → Site Status** showing impressions consumed.
3. Set a soft daily impression cap in the portal: `IMPRESSION_DAILY_CAP_PER_TENANT=2000` in `services/.env.local`. Phase 6 wires the cap into the JWT-mint route.

For internal-only deployments, role-based licensing is fine — no extra step here.

## 5. Create the shared project

In **Explore → New → Project**:

- Name: `portal-shared`.
- Permissions: **Locked to project**, default templates only.

This is where dashboards and factory-published data sources live. Tenant isolation happens via data policies, not project separation.

## 6. (Optional now, required for factory) Create per-tenant placeholder

For each first batch of tenants (or wait until Phase 7 when the factory creates them automatically):

- Group: `tenant-<slug>` (e.g., `tenant-acme`). Phase 1-6 demos can pre-seed one or two.
- Project: `tenant-<slug>` for the factory output. The factory creates these via REST in Phase 7; for early phases you can pre-create one to verify embed/agent end-to-end.

## 7. Verification

Run these from the local checkout once Phase 1 code is in place:

```bash
# Sanity-check the PAT
curl -s -X POST "$TABLEAU_SITE/api/3.20/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"credentials\":{\"personalAccessTokenName\":\"$TABLEAU_PAT_NAME\",\"personalAccessTokenSecret\":\"$TABLEAU_PAT_SECRET\",\"site\":{\"contentUrl\":\"$TABLEAU_SITE_NAME\"}}}"
# expect 200 + {"credentials":{"token":"..."}}

# Sanity-check the Connected App by minting and inspecting a JWT (after Phase 2)
pnpm -F @portal/web tsx scripts/mint-test-jwt.ts
```

## 8. Rotation runbook

- **Connected App secret**: rotate quarterly. Generate a new secret first, update `TABLEAU_CONNECTED_APP_SECRET_ID` + `_VALUE` atomically in the deployment secrets, then delete the old secret. Tokens minted with the old secret immediately reject.
- **Service-account PAT**: rotate quarterly. Tableau PATs expire after 15 days of inactivity — keep the portal cron alive.
- **Domain allowlist**: review every quarter. Remove preview-deploy hosts you no longer use.

## Common mistakes

- Forgetting to enable the Connected App → all auth fails silently.
- Forgetting the "Enable capture of user attributes" setting → RLS allows everything (security incident).
- Wide-open domain allowlist (`*`) → tokens usable from any site.
- Service-account user is `Viewer` role → can't publish data sources; bump to Explorer with publish or higher.
