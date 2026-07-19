# Tableau SE Setup Guide — from clone to a working project

A complete, step-by-step walkthrough for a Tableau Sales Engineer to turn this
repository into a **fully working demo project running against your own Tableau
Cloud site**. Follow the steps in order. By the end you'll have the portal
running locally, your Tableau Cloud wired up, and your first branded demo tenant
live.

**Who this is for:** any SE, no prior knowledge of this codebase assumed.
**Time:** ~45–60 min the first time (most of it one-time Tableau Cloud admin +
your first demo). Later demos take minutes.

**How you'll work:** the fastest path uses **Claude Code** with the in-repo
skills (they encode the hard-won Tableau Cloud know-how). Every step below also
has the plain command, so you can follow it with or without Claude Code.

---

## Table of contents

1. [Install prerequisites](#step-1--install-prerequisites)
2. [Get the code](#step-2--get-the-code)
3. [Install dependencies](#step-3--install-dependencies)
4. [One-time Tableau Cloud setup](#step-4--one-time-tableau-cloud-setup)
5. [Get an Anthropic API key](#step-5--get-an-anthropic-api-key)
6. [Configure environment variables](#step-6--configure-environment-variables)
7. [Run the portal locally](#step-7--run-the-portal-locally)
8. [Verify your Tableau connection](#step-8--verify-your-tableau-connection)
9. [Build your first demo tenant](#step-9--build-your-first-demo-tenant)
10. [Publish and see it live](#step-10--publish-and-see-it-live)
11. [(Optional) Deploy to a shared URL](#step-11-optional--deploy-to-a-shared-url)
12. [Daily workflow & troubleshooting](#daily-workflow)

---

## Step 1 — Install prerequisites

Install these once on your machine.

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 22.x (repo pins `22.13.0` in `.nvmrc`) | [nvm](https://github.com/nvm-sh/nvm): `nvm install 22.13.0 && nvm use` |
| **pnpm** | ≥ 10 | `corepack enable` (ships with Node) |
| **uv** | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` — Python package manager for the factory |
| **Git** | any recent | — |
| **Claude Code** | latest | Recommended — the primary way you'll build demos |
| **Tableau Desktop** | latest | Optional; only needed for the legacy live-datasource path |

You also need, from Tableau/Anthropic (covered in later steps):
- A **Tableau Cloud site** where you can create Connected Apps + PATs (Site
  Administrator role).
- An **Anthropic API key**.

Verify the tooling:

```bash
node -v      # v22.x
pnpm -v      # 10.x or higher
uv --version
```

---

## Step 2 — Get the code

If your team published this as a **GitHub template repository** (recommended),
click **"Use this template"** on the repo page to create your own copy, then
clone that. Otherwise clone directly:

```bash
git clone https://github.com/<team-org>/tableau-se-demo-portal.git
cd tableau-se-demo-portal
```

> Using your own copy (template) keeps your tenants and config isolated from
> other SEs. Improvements flow back via pull requests.

---

## Step 3 — Install dependencies

```bash
# JavaScript / Next.js workspaces
pnpm install

# Python factory sidecar
uv sync --directory services/factory
```

This installs the portal (`apps/web`), shared packages, and the Python factory.
First install takes a few minutes.

---

## Step 4 — One-time Tableau Cloud setup

Do this once per Tableau Cloud site. The full runbook with screenshots-worth of
detail is **[`docs/runbooks/tableau-cloud-setup.md`](../runbooks/tableau-cloud-setup.md)**.
Summary of what you create and the value you copy down for Step 6:

1. **Service-account user + Personal Access Token (PAT)**
   → copy the **PAT name** and **PAT secret** (shown once).
   Used by the factory to publish and by the AI agent (MCP) to read data.

2. **Enable user-attribute capture**
   Settings → Authentication → *"Enable capture of user attributes in
   authentication workflows."* Required for row-level security via
   `USERATTRIBUTE()`.

3. **Connected App (Direct Trust)** — Settings → Connected Apps → New
   → copy the **Client ID**.
   - **3a.** Generate a secret → copy the **Secret ID** and **Secret Value**
     (shown once).
   - **3b.** Domain allow-list: add `http://localhost:3000` (and any preview/
     production hosts you'll use later).
   - **3c.** Set the Connected App to **Enabled**.

4. **(Recommended) UBL** — enable Usage-Based Licensing if your site uses it.

5. **Create a top-level project named `Demo`.** Every tenant you build lands in
   a subfolder `Demo/<Company Name>`.

At the end you should have these seven values written down:

```
TABLEAU_SITE URL (e.g. https://10ax.online.tableau.com/#/site/yoursite)
TABLEAU_SITE_NAME (the content-url short name, e.g. "yoursite")
Connected App: Client ID, Secret ID, Secret Value
PAT: name, secret
```

---

## Step 5 — Get an Anthropic API key

Create a key at the [Anthropic Console](https://console.anthropic.com/). It powers
the portal's AI analytics agent and the factory's company-profiling/branding
stages. Copy the `sk-ant-...` value for the next step.

> The portal defaults to the latest Claude models. No extra config needed.

---

## Step 6 — Configure environment variables

Copy the three templates, then fill in **your own** values. These files are
gitignored — never commit real secrets.

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
cp apps/web/.env.example              apps/web/.env.local
cp services/factory/.env.example      services/factory/.env
```

### `apps/web/.env.local` (the portal)

Every variable is documented inline in the file. The must-set ones:

| Variable | What to put |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `http://localhost:3000` (local) |
| `DEV_USERS_JSON` | At least one internal-admin login (see note below) |
| `TABLEAU_SITE` | Your full site URL incl. `#/site/<name>` |
| `TABLEAU_SITE_NAME` | Your site content-url short name |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` / `_SECRET_ID` / `_SECRET_VALUE` | From Step 4.3 |
| `TABLEAU_EMBED_USER` | A **real user email on your site** (all demo logins embed as this identity) |
| `TABLEAU_PAT_NAME` / `TABLEAU_PAT_SECRET` | From Step 4.1 |
| `ANTHROPIC_API_KEY` | From Step 5 |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` (default). Set `vi` or add a locale to change |

`DEV_USERS_JSON` example (an internal admin + one tenant user):

```json
[
  {"email":"admin@portal.com","password":"dev","tenantId":"internal","tenantName":"Portal Admin","region":"NA","groups":["internal-employees"]},
  {"email":"demo@acme.com","password":"dev","tenantId":"acme","tenantName":"Acme Corp","region":"NA","groups":[]}
]
```

> **Internal vs tenant users:** an account whose `groups` include
> `internal-employees` lands on the **admin hub** (all portals + the Demo
> Factory). A plain `tenantId` account is scoped to `/t/<tenantId>` only.

### `services/factory/.env` (the demo factory)

Set the same **Tableau site + PAT** and **Anthropic key** here so the factory can
generate data and publish to your site. All fields are optional for pure local
data-gen (publish/pulse stages skip cleanly without creds), but you'll want them
set to actually publish.

---

## Step 7 — Run the portal locally

```bash
pnpm dev
```

This starts the Next.js portal on **http://localhost:3000**. Open it and sign in
with one of your `DEV_USERS_JSON` accounts. Sign in as the **internal-admin**
account → you'll see the admin hub with the portal cards and the Demo Factory.

If you'll use the AI agent or factory, also start the sidecars in separate
terminals:

```bash
# Tableau MCP sidecar (powers the AI analytics agent) — via Docker:
docker compose -f infra/docker-compose.yml up tableau-mcp

# Factory sidecar (data generation + publishing):
uv run --directory services/factory uvicorn app.main:app --reload --port 8000
```

> The bundled `apps/web/data/*.json` ships **reference tenants** (Nam A Bank,
> VACS, VNPT, …) as worked examples. They point at the original author's Tableau
> folders, so their dashboards won't render on your site until you rebuild them —
> that's expected. You'll build your own next.

---

## Step 8 — Verify your Tableau connection

Before building a demo, confirm your credentials work end to end. Signed in as
the internal admin, open:

```
http://localhost:3000/api/debug
```

This internal-only endpoint checks your **JWT mint**, **PAT sign-in**, and
**embed auth** and returns full diagnostics. Green across the board means Step 4
and Step 6 are correct.

Common first-run issue — an embed shows a Tableau login prompt or **401
code:16**:
- `TABLEAU_EMBED_USER` must be a real user on your site.
- The Connected App **domain allow-list** must include `localhost:3000`.
- `TABLEAU_ODA=false` unless your Connected App has On-Demand Access enabled.

(See the `tableau-jwt-mint` Claude Code skill for the full checklist.)

---

## Step 9 — Build your first demo tenant

You build a tenant for a specific company + industry. There are two paths — for
your first one, use the **scaffolder path** (works for any industry).

### With Claude Code (recommended)

Open Claude Code in the repo and run the **`new-tenant-portal`** skill. It walks
you through research → data → publish → dashboards → wiring, and calls the
tooling below for you.

### Or run the commands yourself

**a. Scaffold the tenant** (any kebab-case industry slug is allowed):

```bash
cd services/factory
uv run python -m app.scaffold \
    --company "Acme Air Catering" \
    --industry airline-catering \
    --slug acme \
    --tables "Flights,Meals,Complaints"
```

This creates `services/factory/scripts/acme/` (provision script + workbook lib +
talk-track) and a **registered** synthetic-data generator stub at
`services/factory/app/generators/acme.py`.

**b. Fill in the generator** — edit `app/generators/acme.py` and replace the stub
tables with the real schema, calibrated to the customer's public numbers. Keep
each table non-empty. Sanity-check:

```bash
uv run python -c "from app.generators.acme import generate_acme; \
  print({k: len(v) for k, v in generate_acme().all_tables().items()})"
```

**c. Author dashboards** — use the `tableau-exec-dashboard` skill (or model on
`services/factory/scripts/vacs/vacs_lib.py`). Author labels in your target
**language** (English by default). Use the self-contained extract-workbook
pattern (one datasource per table, `skip_connection_check=True`) — it renders on
Cloud with **no Tableau Desktop step and no `sqlproxy` hash**.

Full detail and gotchas: **[`new-demo-request.md`](./new-demo-request.md)**.

---

## Step 10 — Publish and see it live

**a. Publish the datasource to your site** (uses your `services/factory/.env`):

```bash
cd services/factory
uv run python scripts/acme/provision_acme.py            # build .hyper + .tdsx
uv run python scripts/acme/provision_acme.py --publish  # + publish to Demo/Acme Air Catering
```

**b. Wire the tenant into the portal** — add it to `apps/web/data/tenants.json`
and `tenant-themes.json`, set `allowedProjects: ["Demo/Acme Air Catering"]` in the
seed route `apps/web/app/api/admin/seed/route.ts`, add a demo login to
`app/(auth)/sign-in/page.tsx`, and drop a logo in `apps/web/public/tenants/`.
(The `new-tenant-portal` skill does these edits for you.)

**c. Refresh and view:**

```bash
# signed in as internal admin, refresh the tenant list + catalog cache
curl -X POST "http://localhost:3000/api/admin/seed?force=true" -H "cookie: <your internal session>"
```

Open `http://localhost:3000/t/acme` — your dashboards render, the Pulse cards
show, and the AI agent answers questions grounded in the data.

> **allowedProjects is the isolation rule:** each tenant only sees its own Tableau
> folder. Always keep the tenant's `allowedProjects` in sync with where you
> published. See the `portal-catalog` skill.

---

## Step 11 (Optional) — Deploy to a shared URL

To share a demo beyond your laptop:

- **Lean (Vercel + a small factory host):**
  [`docs/runbooks/rollout-production-lean.md`](../runbooks/rollout-production-lean.md)
- **Full (self-hosted VPS + Docker Compose):**
  [`docs/runbooks/rollout-production-full.md`](../runbooks/rollout-production-full.md)

Two things every deployment needs:
1. Add the deployed hostname to your Connected App **domain allow-list**.
2. Set the same env vars in the host's environment. For persistence across
   restarts, configure Vercel KV / Upstash Redis (`KV_REST_API_URL` +
   `KV_REST_API_TOKEN`); without them the portal falls back to bundled JSON.

The portal is a standard Next.js app: `pnpm --filter @portal/web build` then
`pnpm --filter @portal/web start`.

---

## Daily workflow

Once set up, building another demo is just Step 9 + Step 10 for the new company.
Handy commands:

```bash
pnpm dev                                   # run the portal
pnpm -F @portal/web typecheck              # type-check the portal
pnpm -F @portal/web test                   # portal unit tests
uv run --directory services/factory pytest # factory tests
uv run --directory services/factory python -m app.scaffold --help   # scaffolder options
```

### Troubleshooting quick reference

| Symptom | Fix |
|---|---|
| Embed shows Tableau login / **401 code:16** | Check `TABLEAU_EMBED_USER`, Connected App domain allow-list, `TABLEAU_ODA=false`. Run `GET /api/debug`. |
| Factory publish says **"skipped"** | Tableau creds not set in `services/factory/.env` (fine for local data-gen only). |
| Dashboards don't appear at `/t/<slug>` | Run `POST /api/admin/seed?force=true`; confirm `allowedProjects` matches your published folder. |
| Sheets render **blank** on a hand-authored workbook | Use the self-contained extract pattern (Step 9c), not a bare `sqlproxy` connection. |
| `pnpm test` modifies `apps/web/data/*.json` | Known test quirk (file-store fallback when KV is absent). Run `git checkout -- apps/web/data`. |
| Need a **live federated `sqlproxy`** datasource (e.g. for the agent over a relationship model) | Publish a `_seed_desktop` workbook from Desktop once, then `uv run python -m app.seed_probe --workbook _seed_desktop --project "Demo/<Name>" --out /tmp/<slug>-seed.xml`. |

### Where to learn more

- **[`se-quickstart.md`](./se-quickstart.md)** — condensed setup reference
- **[`new-demo-request.md`](./new-demo-request.md)** — per-customer demo playbook
- **[`../runbooks/tableau-cloud-setup.md`](../runbooks/tableau-cloud-setup.md)** — Tableau Cloud admin detail
- **`.claude/skills/`** — the Claude Code skills (`new-tenant-portal`,
  `tableau-exec-dashboard`, `tableau-jwt-mint`, `multitenant-rls`,
  `portal-catalog`, …). These are the real product; browse their `SKILL.md` files.
- **[`AGENTS.md`](../../AGENTS.md)** — the canonical project guide
