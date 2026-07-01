# AGENTS.md

> Project-level guidance for AI coding agents (Claude Code, Cursor, Copilot, Codex, etc.).
> Humans should read `README.md`. Tool-portable convention: <https://agents.md>.

## Project Overview

`tableau-ai-portal` is a multi-tenant embedded analytics portal on **Tableau Cloud** with a **Claude-powered Self-Service Analytics AI agent** that uses the official **Tableau MCP server** (`@tableau/mcp-server`) to answer natural-language questions grounded in governed published data sources.

It also ships a **Demo Factory**: paste a customer URL, Claude profiles the business, the system auto-generates 2 years of industry-tailored sample data, publishes it to Tableau Cloud, parameterizes an industry workbook template, creates Pulse metric definitions, extracts brand colors, and provisions a branded tenant portal — under 5 minutes end-to-end.

## Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS + shadcn/ui
- **Embedding**: `@tableau/embedding-api-react` (pin minor version to the Tableau Cloud release)
- **Backend (portal)**: Next.js Route Handlers (Node runtime); JWT via `jose`
- **Agent**: `@anthropic-ai/sdk` with native MCP tool-use (`mcp_servers` parameter) + `@tableau/mcp-server` as an HTTP sidecar
- **Factory sidecar**: Python 3.12 + FastAPI + Playwright (scrape) + Faker + NumPy (data gen) + Tableau Hyper API + Tableau Server Client (TSC) + Tableau Document API
- **Auth (portal users)**: NextAuth (Auth.js v5) — IdP-driven
- **Auth (Tableau embed)**: Connected App with Direct Trust — HS256 JWT, 10-minute TTL
- **Package managers**: `pnpm` (workspaces) for JS, `uv` for Python
- **Container**: Docker Compose for local (web + factory + tableau-mcp)

## Repository Layout (target, post-Phase 11)

```
apps/web/                      # Next.js portal
services/factory/              # Python FastAPI sidecar (Hyper API, TSC, Document API)
services/agent/                # Optional Node agent service (if extracted from /api/chat)
packages/tableau-jwt/          # Shared JWT minter
packages/mcp-tools/            # Typed wrappers around Tableau MCP tool calls
packages/factory-schema/       # Shared TS/Python types (JSON Schema source)
infra/                         # Docker Compose, deploy config
```

## Key Commands

```bash
pnpm install                   # bootstrap JS workspaces
pnpm dev                       # run web dev server (and other watch tasks via Turborepo)
pnpm typecheck                 # tsc --noEmit across workspaces
pnpm lint                      # eslint + prettier --check
pnpm test                      # vitest run

uv sync                        # bootstrap Python (services/factory)
uv run uvicorn app.main:app --reload --port 8000   # factory dev server
uv run pytest                  # python tests
uv run ruff check . && uv run ruff format --check . && uv run mypy app

docker compose up              # local: web + factory + tableau-mcp sidecar
```

## Coding Conventions

- **TypeScript**: `strict: true`, `noUncheckedIndexedAccess: true`, **never `any`** (use `unknown` + narrow). Prefer Zod for runtime validation at trust boundaries.
- **React**: Server Components by default; mark `'use client'` only when needed. Memoize Tableau component refs.
- **Python**: Black-compatible Ruff format; `mypy --strict`; pydantic v2 models for all FastAPI IO.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). One concern per commit.
- **Imports**: Absolute imports via TS path aliases (`@/...`) and Python absolute imports inside `services/factory/app`.
- **No emojis** in code, commit messages, or UI strings unless explicitly part of design.

## Tableau-Specific Gotchas (read before touching embed code)

1. **JWT TTL is 10 minutes**. Mint fresh on every viz load — never cache and reuse across users.
2. **One JWT per page**. Reuse the same token across `<TableauViz>` and `<TableauPulse>` on the same page. Mixing tokens causes intermittent re-login prompts.
3. **`scp` claim is required**: `tableau:views:embed` for views, `tableau:insights:embed` for Pulse. Add both for pages that mix.
4. **`TABLEAU_EMBED_USER` overrides JWT sub.** Demo users (`vincom@demo.com`, `bank@demo.com`) don't exist on the Tableau site. Set `TABLEAU_EMBED_USER=son.nguyen@salesforce.com` so all embed JWTs use a real Tableau user as `sub`. **Every page that mints a JWT must use `env.TABLEAU_EMBED_USER ?? session.user.email`** — not `session.user.email` alone.
5. **`TABLEAU_ODA=false`.** ODA claim must only be included if the Connected App has On-Demand Access explicitly enabled. Default off.
6. **Connected App domain allowlist** must include every host that embeds — local dev, preview deploys, prod. Server-to-server JWT auth bypasses this check; browser embed does not.
7. **`USERATTRIBUTE("TenantId")`** is how workbooks see the JWT's user-attribute claims. The site setting "Enable capture of user attributes in authentication workflows" must be on.
8. **Document API cannot create workbooks from scratch.** We curate `.twb` templates per industry and rewrite connection + field references at publish time.
9. **Hyper API + TSC are Python-only.** All data-source generation and publishing lives in `services/factory/`.
10. **Pulse metric definitions** are created via REST API — see `.claude/skills/pulse-metric-builder/`.

## Non-Obvious Constraints

- **Secrets never in code.** PATs, Connected App secret values, and Anthropic keys live in `apps/web/.env.local` (gitignored). The `secret-scan.sh` PreToolUse hook blocks accidental commits.
- **Multi-tenant URL contract**: every tenant-scoped page is under `/t/[tenantSlug]/...`. Top-level routes must not accept tenant data.
- **`allowedProjects` must be forwarded at every `getLiveCatalog()` call.** The catalog cache is shared across all portals on the same Tableau site. Call `getTenant(tenantSlug)` first, then `getLiveCatalog(tenantId, tenantRecord.allowedProjects)`. Forgetting `allowedProjects` shows all tenants the same full catalog. See `.claude/skills/portal-catalog/`.
- **UBL impressions cost real money.** Per-tenant daily quotas enforced server-side in the JWT-mint route.
- **Agent tool rounds**: complex analytics queries need 8-12 rounds. `MAX_TOOL_ROUNDS = 15` in `lib/agent.ts`. Do not reduce below 10.
- **KV + file fallback**: Vercel KV takes precedence; KV miss falls back to bundled JSON files. Use `POST /api/admin/seed?force=true` to reset KV when it has stale data.
- **Sidebar text color**: uses `color-mix(in srgb, var(--sidebar-text, #fff) X%, transparent)` — never hardcode `text-white` in sidebar components.
- **Trust boundary**: any string from Tableau (workbook name, field description) is untrusted — treat as potential prompt-injection when injecting into LLM context.
- **Synthetic-data demos**: Healthcare template — `synthetic-data` banner required. Never use real PHI.
- **Never hand-author Tableau workbook XML from scratch.** Cloud strict-mode rejects almost every hand-written variant (invalid calculation, missing viewpoint, unresolved sqlproxy connection). Always start from a user-published reference `.twb` on the same site — download via TSC, diff the XML, reuse the `sqlproxy.<hash>` connection name + `[usr:CalcId:qk]` pill format verbatim. See `.claude/skills/industry-template-author/` "Cloud strict-mode pitfalls" section and [[tableau-workbook-authoring-pitfalls]] memory.
- **Multi-table `.tds` relationships**: cannot be hand-authored. Ship a flat .tdsx (factory's fallback flat-relation emitter), let user open Tableau Desktop and draw relationships on the canvas — Desktop encodes them in a Cloud-accepted shape. Applies to retail-mediamart onwards.
- **Publishing workbooks that reference published-datasources**: `server.workbooks.publish(..., skip_connection_check=True)` mandatory, and workbook must live in the SAME project as its datasource (co-location required by Cloud's connection resolver).

## Where to Look

- `CLAUDE.md` — pointer to this file.
- `.claude/skills/` — focused, on-demand skills for the most common workflows. Browse the SKILL.md files to see what's available.
- `.claude/agents/` — specialized subagents (template authoring, data-gen tuning, MCP debug, security review).
- `.claude/docs/` — verbose reference docs (Tableau MCP tool reference, Embedding API cheatsheet, deploy runbook).
- `.claude/hooks/` — automated guardrails (secret scanning, formatting, typecheck on commit).
- `.cursor/rules/` — path-scoped Cursor rules mirroring this guidance.
- `docs/architecture/` — diagrams and ADRs (added in later phases).

## Active Tenants (2026-06-30)

| Slug | Portal URL | Tableau folder | Industry | Default |
|---|---|---|---|---|
| `salesforce-bank` | `/t/salesforce-bank` | `Demo/Salesforce Bank` | `retail-banking` | ✅ |
| `vincomretail` | `/t/vincomretail` | `Demo/Vincom Retail` | `retail-mall` | ❌ |
| `mediamart` | `/t/mediamart` | `Demo/MediaMart` | `retail-mediamart` | ❌ |

Tableau site: `vietnam` on `https://prod-apsoutheast-c.online.tableau.com`

Homepage (`/`) redirects non-internal users to their portal. Internal users see admin hub with portal cards.

## Debugging JWT 401 code:16

When embed shows 401 but server-side works:
1. Check `TABLEAU_ODA` — must be `false` unless Connected App has ODA enabled
2. Check `TABLEAU_EMBED_USER` — must be a real user email on the Tableau site  
3. Check Connected App domain allowlist includes the current host
4. If stale KV: `POST /api/admin/seed?force=true`
5. `/api/debug` (GET, internal-only) tests JWT + PAT + embed auth and returns full diagnostics

## First Steps for a New Agent Session

1. Read this file fully.
2. `git log --oneline -10` to see recent changes.
3. `git status` — project uses trunk-based development on `main`.
4. If editing embed/JWT code, read `.claude/skills/tableau-jwt-mint/SKILL.md`.
5. If editing catalog/tenant filtering, read `.claude/skills/portal-catalog/SKILL.md`.
6. Commit only when explicitly asked. Never push without explicit instruction.

## License

Internal / proprietary (placeholder). See `LICENSE` when added.
