# SE Quickstart — your own demo environment

> Want the full, numbered walkthrough with every step explained? See the
> **[SE Setup Guide](./se-setup-guide.md)**. This page is the condensed reference.

This is the front door for a Tableau Sales Engineer setting up this repo against
**your own Tableau Cloud site**. Once done, you build customer demos with the
Claude Code skills (the `new-tenant-portal` skill is the main one).

Time: ~30–45 min the first time (most of it the one-time Tableau Cloud admin
setup), then a few minutes on subsequent machines.

---

## 0. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x (`.nvmrc` = 22.13.0) | `nvm use` |
| pnpm | ≥ 10 | `corepack enable` |
| uv | latest | Python package manager for the factory |
| Claude Code | latest | the primary way you'll drive builds |
| A Tableau Cloud site | — | where your demos publish + embed |
| An Anthropic API key | — | powers the AI agent + factory profiling |

## 1. Clone & install

```bash
git clone <your-team-org>/tableau-se-demo-portal
cd tableau-se-demo-portal
pnpm install
uv sync --directory services/factory
```

## 2. One-time Tableau Cloud setup

Follow **[`docs/runbooks/tableau-cloud-setup.md`](../runbooks/tableau-cloud-setup.md)**.
It walks you through, on YOUR site:

1. Create a service-account user + a **Personal Access Token** (PAT).
2. Enable **"Capture user attributes in authentication workflows"** (required
   for row-level security via `USERATTRIBUTE()`).
3. Create a **Connected App (Direct Trust)** → note the Client ID, Secret ID,
   and Secret Value (shown once).
4. Set the **domain allow-list** on the Connected App to include
   `http://localhost:3000` (and any preview/prod hosts you'll use).
5. Enable **UBL** (usage-based licensing) if applicable.
6. Create a top-level **`Demo`** project — each tenant lands in `Demo/<Name>`.

## 3. Configure your env

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
cp apps/web/.env.example apps/web/.env.local
cp services/factory/.env.example services/factory/.env
```

Fill in **your own** values (never commit these — they're gitignored):

- `apps/web/.env.local` — `AUTH_SECRET` (`openssl rand -base64 32`), your
  `TABLEAU_SITE` / `TABLEAU_SITE_NAME`, the three `TABLEAU_CONNECTED_APP_*`,
  `TABLEAU_EMBED_USER` (a real user on YOUR site), `TABLEAU_PAT_NAME/SECRET`,
  `ANTHROPIC_API_KEY`, and a `DEV_USERS_JSON` with at least one internal-admin
  account. Every env var is documented inline in `.env.example`.
- `services/factory/.env` — the same Tableau site + PAT + Anthropic key for the
  factory sidecar.

> **Default language is English** (`NEXT_PUBLIC_DEFAULT_LOCALE=en`). Set it to
> `vi` (or add another locale in `apps/web/lib/i18n-shared.ts`) if you prefer.

## 4. Run it

```bash
pnpm dev            # portal on http://localhost:3000
# in another shell, if you'll use the factory:
uv run --directory services/factory uvicorn app.main:app --reload --port 8000
```

Sign in with a `DEV_USERS_JSON` account. An internal-admin account (groups
include `internal-employees`) lands on the admin hub.

> The bundled `apps/web/data/*.json` ships the original reference tenants
> (Nam A Bank, VACS, …). They point at the *original* author's Tableau folders,
> so their dashboards won't render on your site until you rebuild them — that's
> expected. Build your own (next step), then `POST /api/admin/seed?force=true`
> (as internal admin) to refresh the tenant list from KV.

## 5. Build your first demo

Open Claude Code in the repo and run the **`new-tenant-portal`** skill, or the
condensed **[`new-demo-request.md`](./new-demo-request.md)** checklist. The fast
path:

```bash
# scaffold a tenant folder + a registered generator stub (any industry slug)
uv run --directory services/factory python -m app.scaffold \
    --company "Acme Air" --industry airline-catering --slug acme \
    --tables "Flights,Meals,Complaints"
```

Then fill in the generator, publish the datasource, author dashboards, and wire
the tenant into the portal — all covered in `new-demo-request.md`.

## Troubleshooting

- **Embed shows a Tableau login / 401 code:16** → `TABLEAU_EMBED_USER` must be a
  real user on your site; the Connected App domain allow-list must include your
  host; `TABLEAU_ODA=false` unless ODA is enabled. `GET /api/debug` (internal)
  runs all three checks. See the `tableau-jwt-mint` skill.
- **`pnpm test` writes to `apps/web/data/*.json`** → a known test-isolation quirk
  (the tenant-theme/dashboard tests fall back to the file store when KV is
  absent). `git checkout -- apps/web/data` after running tests locally.
- **Factory publish "skipped"** → Tableau creds not set in `services/factory/.env`
  (this is fine for local data-gen; set them to actually publish).
