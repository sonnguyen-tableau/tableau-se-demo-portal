# SE Workshop: Tableau Demo Portal — Setup & Demo Building

> Hands-on walkthrough: set up the Tableau SE Demo Portal from scratch and build
> your first branded demo tenant against **your own** Tableau Cloud site. ~1 hour.
>
> **Prerequisites:** Node.js 22.x, pnpm ≥ 10, `uv`, Git, and Claude Code
> installed. A Tableau Cloud site with **Site Administrator** access. Install
> steps below if you need them.

This is the in-repo companion to the workshop deck. It stays in sync with the
code — when the repo changes, this file changes with it. See
[`se-setup-guide.md`](./se-setup-guide.md) for the long-form reference and
[`new-demo-request.md`](./new-demo-request.md) for the per-customer playbook.

---

## Agenda

| Session | |
|---|---|
| Intro & Architecture Overview | see the deck |
| **Part 1** | Environment Setup (Steps 1–3) |
| **Part 2** | Tableau Cloud & Env Config (Steps 4–6) |
| **Part 3** | Run Portal & Verify (Steps 7–8) |
| **Part 4** | Build Your First Demo Tenant (Steps 9–10) |
| **Part 5** | Optional Deployment |
| **Part 6** | Keeping Your Portal Up to Date |

---

## Part 1 — Environment Setup

### Step 1 · Install Prerequisites

Install once per machine.

| Tool | Version | macOS | Windows |
|---|---|---|---|
| Node.js | 22.x | `nvm install 22.13.0 && nvm use` | (nvm-windows) `nvm install 22.13.0` then `nvm use 22.13.0` |
| pnpm | ≥ 10 | `corepack enable` | `corepack enable` (PowerShell as Admin) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| Git | any | `brew install git` | git-scm.com/download/win |
| Claude Code | latest | `npm install -g @anthropic-ai/claude-code` | `npm install -g @anthropic-ai/claude-code` (PowerShell as Admin) |

**Verify:**
```bash
node -v   # v22.x
pnpm -v   # 10.x or higher
uv --version
```

#### Windows — additional notes
> **Use PowerShell (not CMD)** for every command in this workshop. Run
> PowerShell as Administrator when installing global tools.

- Verify installs with `node -v`, `pnpm -v`, `uv --version`.
- Path separators: replace `/` with `\` when navigating, e.g. `cd services\factory`.
- `curl` on Windows may alias to `Invoke-WebRequest`. Use `curl.exe` explicitly, or use the `irm … | iex` pattern shown above for `uv`.
- SF LLM Gateway key location on Windows: `%USERPROFILE%\.claude\settings.json` (open with `notepad $env:USERPROFILE\.claude\settings.json`).

### Step 2 · Get the Code

Click **"Use this template"** on the repo page (recommended — keeps your tenants
isolated), then clone your copy:

```bash
git clone https://github.com/sonnguyen-tableau/tableau-se-demo-portal.git
cd tableau-se-demo-portal
```

**Already cloned?** See [Part 6](#part-6--keeping-your-portal-up-to-date) for pulling updates.

### Step 3 · Install Dependencies

```bash
pnpm install
uv sync --directory services/factory
```

First install takes a few minutes.

> **Heads-up — `pnpm approve-builds`.** pnpm 10 blocks native post-install
> scripts and prints `Ignored build scripts: … sharp …`. The portal works
> without approving them, **but `sharp` powers the AI agent's chart-image
> analysis** (it rasterises Tableau view images before sending them to Claude).
> If you want that, run `pnpm approve-builds` and approve `sharp`. Optional; not
> required to boot.

---

## Part 2 — Tableau Cloud & Configuration

### Step 4 · One-time Tableau Cloud Setup

Do this once per site. Create and copy down **7 values** — keep them handy for Step 6.

1. **Service-account user + PAT** → copy **PAT name** and **PAT secret** (shown once).
2. **Enable user-attribute capture** — Settings → Authentication → *"Enable capture of user attributes in authentication workflows"*.
3. **Connected App (Direct Trust)** — Settings → Connected Apps → New
   1. Copy **Client ID**
   2. Generate a secret → copy **Secret ID** and **Secret Value** (shown once)
   3. Domain allow-list: add `http://localhost:3000`
   4. Set to **Enabled**
4. **Create a top-level project named `Demo`** — reference tenant folders live under here (your own tenants can live anywhere; see the note in Step 10).

At the end you should have:
```
TABLEAU_SITE URL    e.g. https://10ax.online.tableau.com/#/site/yoursite
TABLEAU_SITE_NAME   e.g. yoursite
Connected App:      Client ID, Secret ID, Secret Value
PAT:                name, secret
```

### Step 5 · Get an API Key for the AI Agent

Two options depending on how you run the portal.

**Option A — Anthropic API Key (external, works everywhere including deployed).**
Create a key at console.anthropic.com. It starts with `sk-ant-`. Set it as
`ANTHROPIC_API_KEY` in Step 6.

**Option B — SF LLM Gateway (internal, on SF VPN, no Anthropic billing).**
If you run the portal **locally and on the SF VPN**, use the internal gateway
instead.

1. Get your gateway token from `~/.claude/settings.json` (Mac) /
   `%USERPROFILE%\.claude\settings.json` (Windows).
2. In `apps/web/.env.local`, set:
   ```
   ANTHROPIC_API_KEY=<your gateway token>
   ANTHROPIC_BASE_URL=<gateway ROOT url>
   ```

> ⚠️ **Use the gateway's ROOT URL — the native Anthropic-API endpoint — NOT the
> `/bedrock` path.** The portal's SDK speaks the native Messages API, which the
> gateway serves at its root (e.g. `https://…sfdc.cl`). The `/bedrock` endpoint
> needs an extra SDK that is not wired in, so pointing at it will fail. Leave
> `ANTHROPIC_BEDROCK_BASE_URL` unset.
>
> ⚠️ **The gateway is VPN-only.** Off VPN (or on a deployed host), it is
> unreachable — fall back to Option A with a real `sk-ant-` key.

### Step 6 · Configure Environment Variables

```bash
cp apps/web/.env.example apps/web/.env.local
cp services/factory/.env.example services/factory/.env   # note the leading dot!
open -e apps/web/.env.local
```

> ⚠️ **`services/factory/.env` — mind the leading dot.** A file named
> `services/factory/env` (no dot) is **not** gitignored and can leak secrets
> into git. Always `.env`.

Key variables in `apps/web/.env.local`:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `http://localhost:3000` |
| `TABLEAU_SITE` | Your full site URL incl. `#/site/<name>` |
| `TABLEAU_SITE_NAME` | Your site content-url short name |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` / `SECRET_ID` / `SECRET_VALUE` | From Step 4 |
| `TABLEAU_EMBED_USER` | A real user email on your Tableau site |
| `TABLEAU_PAT_NAME` / `TABLEAU_PAT_SECRET` | From Step 4 |
| `ANTHROPIC_API_KEY` | From Step 5 |
| `ANTHROPIC_BASE_URL` | **Option B only** — gateway root URL |
| `TABLEAU_MCP_URL` | `http://localhost:8081/tableau-mcp` — **must include the `/tableau-mcp` path** |
| `DEV_USERS_JSON` | At least one internal-admin login (see below) |

> ⚠️ **Never set optional variables to an empty string `""`.** `FACTORY_PROVISION_SECRET`
> (min 16 chars) and `SITE_CONFIG_ENCRYPTION_KEY` (64 hex) are validated — an
> empty string is *present-but-invalid* and **blocks the app from booting** with
> an "Invalid environment configuration" error. Leave them **commented out** (or
> unset) if you're not using them, or give them a real value.

> ✅ **`.env.local` is now authoritative over your shell.** Dev machines running
> Claude Code often export `ANTHROPIC_BASE_URL`, `TABLEAU_MCP_URL`, or
> `CLAUDE_CODE_USE_BEDROCK` in the shell. Next.js normally lets those *override*
> `.env.local`, which silently broke things. The portal now re-reads
> `.env.local` at startup and forces it to win — you'll see a
> `[env] .env.local override applied to: …` line on boot. **That line is normal**
> — it confirms the fix ran. (No-op when the file is absent, e.g. on Vercel.)

**`DEV_USERS_JSON` example:**
```json
[
  {"email":"admin@portal.com","password":"dev","tenantId":"internal","tenantName":"Portal Admin","region":"NA","groups":["internal-employees"]},
  {"email":"demo@acme.com","password":"dev","tenantId":"acme","tenantName":"Acme Corp","region":"NA","groups":[]}
]
```
> Accounts with `"internal-employees"` in `groups` land on the **admin hub**.
> Regular tenant accounts are scoped to `/t/<tenantId>` only.
>
> 💡 **You also get an auto-login per active tenant:** `<slug>@demo.com` /
> password `dev`, derived from the tenant registry (no `DEV_USERS_JSON` upkeep
> needed for those). The sign-in page lists them, and the list stays in sync as
> you add/archive tenants. `DEV_USERS_JSON` is for the internal admin and for
> cloud deployments.

Set the same Tableau site + PAT + Anthropic key in `services/factory/.env` too.

---

## Part 3 — Run the Portal & Verify

### Step 7 · Run the Portal Locally

```bash
pnpm dev
```
Opens the portal at http://localhost:3000. Sign in with your internal-admin
account → you'll see the admin hub.

**Sync your Tableau environment:** signed in, go to
http://localhost:3000/admin/tenants and click **Sync with Tableau**. This
reconciles the tenant list against your site's projects/workbooks.

> ⚠️ **On a fresh site, Sync will hide (archive) all the bundled reference
> tenants** (Singapore Airlines, ACB, etc.) — their `Demo/*` folders don't exist
> on *your* site, so there's nothing to render. **This is expected**, not a bug.
> They stay in the admin list for reference; you'll build your own next. Preview
> shows the plan before it applies. (If Sync warns "some tenants returned no
> projects — left untouched," that's the safety guard reacting to a transient
> connection blip; just re-run once your VPN/site is reachable.)

**Start the AI-agent sidecar** (in a separate terminal — gives the agent live
Tableau tools):

```bash
pnpm mcp
```

> **`pnpm mcp` replaces the old `docker compose … tableau-mcp` command.** Docker
> is **not** required — it runs the official `@tableau/mcp-server` (v4) via
> `npx`, reading your `apps/web/.env.local` automatically. Leave it running in
> its own terminal; Ctrl-C to stop. First run installs the package (~30s).
> You'll see a scary `DANGEROUSLY_DISABLE_OAUTH` warning — that's expected for a
> localhost-only PAT sidecar (see [MCP notes](#appendix--how-the-mcp-sidecar-works)).
>
> Without the sidecar the agent still works in **"general mode"** (no live
> Tableau data) — fine for a first run.

Optionally start the factory sidecar (only needed to *build* tenants from the
`/factory` UI):
```bash
uv run --directory services/factory uvicorn app.main:app --reload --port 8000
```

### Step 8 · Verify Your Connection

Open the internal-admin-only debug endpoint:
```
http://localhost:3000/api/debug
```
Green across the board = Steps 4 & 6 are correct. ✅

**Common first-run issues:**

| Symptom | Fix |
|---|---|
| Embed shows Tableau login / 401 code:16 | Check `TABLEAU_EMBED_USER` (real user on your site), Connected App domain allow-list includes your host, `TABLEAU_ODA=false` |
| App won't boot: "Invalid environment configuration" | An optional var is set to `""` — comment it out or give a real value (see Step 6) |
| Agent says "MCP sidecar unavailable" | Start `pnpm mcp` in another terminal; confirm `TABLEAU_MCP_URL` ends in `/tableau-mcp` |
| Agent: "MCP unavailable … Cannot POST /" | `TABLEAU_MCP_URL` is missing the `/tableau-mcp` path |
| Agent: gateway/connection error | On SF gateway? Confirm VPN is up; the endpoint is preprod and can blip (the agent auto-retries). Off VPN → use an `sk-ant-` key |
| Factory publish says "skipped" | Tableau creds not set in `services/factory/.env` |
| Dashboards don't appear at `/t/<slug>` | Run `POST /api/admin/seed?force=true`; confirm the tenant's `allowedProjects` matches the **actual** project name where your workbook is published |
| Sheets render blank | Use the self-contained extract pattern, not a bare `sqlproxy` connection |

---

## Part 4 — Build Your First Demo Tenant

### Step 9 · Create a New Tenant

Two paths — pick whichever fits your workflow.

#### Option 1 — Claude Code (recommended, fastest)

`cd` into the project folder, open Claude Code, paste the prompt below.

**Reusable prompt template:**
```
Build a demo portal for <COMPANY> — <website link>.
Industry slug: <kebab-case>.
Dashboard labels in <language>.
```

Optional lines — add to customise, or leave out and Claude fills sensible defaults:
```
Calibrate synthetic numbers to these real figures (±5%): <numbers you know>.
Dashboards I want: <list>. KPIs: <list>.
```

**Example 1 — FairPrice (standard, minimal prompt):**
```
Build a demo portal for NTUC FairPrice, https://www.fairprice.com.sg/ —
Singapore's largest grocery retailer (supermarkets, Finest, Xtra, Cheers
convenience, online). Industry slug: retail-grocery.
Dashboard labels in English.
```

**Example 2 — Singapore Airlines (detailed & customised):**
```
Rebuild the Singapore Airlines demo (slug singapore-airlines,
industry airline-passenger). Labels in English.

Calibrate to SIA public figures (±5%): FY load factor ~85–88%,
passenger revenue, ASK/RPK by region (SE Asia, N Asia, Europe,
Americas, SW Pacific).
Dashboards: network overview (revenue/load factor/yield/capacity vs LY),
regional/route performance, premium-cabin mix. VOTD-grade KPI cards.
```

> **Tip:** Claude Code runs the `new-tenant-portal` skill end-to-end: research →
> synthetic data → Tableau workbooks → publish → portal wiring. Watch it work or
> wait for the final URL. Put the whole spec in the first message — an agentic
> build goes better with a complete brief than piecemeal follow-ups.

#### Option 2 — Manual (full control)

a. Scaffold the tenant files:
```bash
cd services/factory
uv run python -m app.scaffold \
    --company "Acme Air Catering" \
    --industry airline-catering \
    --slug acme \
    --tables "Flights,Meals,Complaints"
```
Creates `services/factory/scripts/acme/` (provision script + workbook lib) and a
synthetic-data generator stub at `app/generators/acme.py`.

b. Fill in the generator — edit `app/generators/acme.py`, replace the stub
tables with the real schema, then sanity-check:
```bash
uv run python -c "from app.generators.acme import generate_acme; \
  print({k: len(v) for k, v in generate_acme().all_tables().items()})"
```

c. Author dashboards using the `tableau-exec-dashboard` skill. Use the
**self-contained extract-workbook pattern** (`skip_connection_check=True`) —
renders on Cloud with no Tableau Desktop step.

### Step 10 · Publish & See It Live

a. Publish to your site:
```bash
cd services/factory
uv run python scripts/acme/provision_acme.py             # build .hyper + .tdsx
uv run python scripts/acme/provision_acme.py --publish   # publish to Demo/Acme Air Catering
```

b. Wire the tenant into the portal — add entries to `apps/web/data/tenants.json`
and `tenant-themes.json`, set `allowedProjects`, add a demo login, and drop a
logo in `apps/web/public/tenants/`.

> ⚠️ **`allowedProjects` must match the ACTUAL project name where your workbook
> lands** — not a guessed `Demo/<Name>` path. If you publish to a top-level
> project called `FairPrice`, set `allowedProjects: ["FairPrice"]`, not
> `["Demo/FairPrice"]`. A mismatch = the portal shows no reports. (Running
> **Sync with Tableau** after publishing reconciles this for you.)

c. Refresh and view:
```bash
curl -X POST "http://localhost:3000/api/admin/seed?force=true" -H "cookie: <your session>"
```
Open `http://localhost:3000/t/acme` — dashboards render, Pulse cards show, AI
agent is live. 🎉

---

## Part 5 (Optional) — Deploy to a Shared URL

- Lean (Vercel + small factory host): see
  [`../runbooks/rollout-production-lean.md`](../runbooks/rollout-production-lean.md).

> Deploying is a deliberate step — the project ships without a production deploy
> path by default. When you do deploy, remember:
>
> - **`.env.local` is NOT read on deploy** — and the `.env.local` override is a
>   no-op there. Set every env var in the host's dashboard (Vercel / Heroku).
>   `AUTH_URL` must be the real URL, not localhost.
> - **`KV_REST_API_URL` + `KV_REST_API_TOKEN` become REQUIRED.** The filesystem
>   is ephemeral, so the `data/*.json` fallback won't persist — **tenant records
>   and Sync results live in KV in production.** Without KV you get the committed
>   baseline (reference tenants archived).
> - **The SF gateway is VPN-only** → unreachable from a deployed host. Use a real
>   `sk-ant-` key there.
> - **The MCP sidecar must be hosted** somewhere reachable and `TABLEAU_MCP_URL`
>   repointed — `localhost:8081` won't exist on the deploy host.
> - **Add the deployed hostname to the Connected App domain allow-list**, or
>   embeds 401.

---

## Part 6 — Keeping Your Portal Up to Date

**If you used "Use this template" (own fork):** register the upstream remote once:
```bash
git remote add upstream https://github.com/sonnguyen-tableau/tableau-se-demo-portal.git
git remote -v   # verify origin + upstream
```
Then whenever you want updates:
```bash
git fetch upstream
git merge upstream/main
```
Resolve any merge conflicts (usually in `apps/web/data/` — your local config is
gitignored, so it's safe), then:
```bash
pnpm install                          # new JS deps
uv sync --directory services/factory  # new Python deps
```

**If you cloned directly (no fork):**
```bash
git pull origin main
pnpm install
uv sync --directory services/factory
```

**After any update — quick sanity check:**
```bash
pnpm dev   # open http://localhost:3000/api/debug and confirm green
```

> **Never commit `.env.local` or `services/factory/.env`.** They're gitignored by
> default — updates never overwrite your credentials or tenant config.

---

## Daily Workflow — Quick Reference

```bash
pnpm dev                                              # run the portal
pnpm mcp                                              # AI-agent sidecar (separate terminal)
pnpm -F @portal/web typecheck                         # type-check
pnpm -F @portal/web test                              # unit tests
uv run --directory services/factory python -m app.scaffold --help   # scaffold a tenant
```
Once set up, building another demo is just Steps 9 + 10 for the new company.

## Claude Code Skills Cheat Sheet

| Skill | What it does |
|---|---|
| `new-tenant-portal` | Full end-to-end demo build (research → publish → wire) |
| `tableau-exec-dashboard` | Author a Tableau workbook for a specific industry |
| `tableau-jwt-mint` | Debug JWT / embed auth issues |
| `multitenant-rls` | Set up row-level security with `USERATTRIBUTE()` |
| `portal-catalog` | Manage the tenant catalog cache |

## Resources

- [`se-setup-guide.md`](./se-setup-guide.md) — full step-by-step setup
- [`se-quickstart.md`](./se-quickstart.md) — condensed reference
- [`new-demo-request.md`](./new-demo-request.md) — per-customer demo guide
- [`../runbooks/tableau-cloud-setup.md`](../runbooks/tableau-cloud-setup.md) — Tableau Cloud admin detail
- [`../../AGENTS.md`](../../AGENTS.md) — canonical project guide

---

## Appendix — How the MCP sidecar works

`pnpm mcp` (→ `scripts/start-mcp.sh`) runs `@tableau/mcp-server` v4 in HTTP mode
with these settings, all required:

| Setting | Why |
|---|---|
| `TRANSPORT=http`, `PORT=8081` | Portal connects via streamable-HTTP at `http://localhost:8081/tableau-mcp` |
| `DANGEROUSLY_DISABLE_OAUTH=true` | v4 HTTP mode requires OAuth unless disabled; we authenticate with a PAT instead. **Safe for a localhost-only dev sidecar; never use for a deployed/shared one.** |
| `ENABLE_MCP_SITE_SETTINGS=false` | v4 calls `GET /sites/:id/settings/mcp` (scoped JWT) during tool registration. On sites without that feature it throws `-32603` and the agent gets **zero tools**. This flag skips the call. |
| `SERVER` / `SITE_NAME` / `PAT_NAME` / `PAT_VALUE` | Auth, read from `apps/web/.env.local` |

Docker alternative (if you prefer): `docker compose --env-file .env -f infra/docker-compose.yml up -d tableau-mcp` — the compose file uses the same v4 settings. `pnpm mcp` is simpler and needs no Docker.
