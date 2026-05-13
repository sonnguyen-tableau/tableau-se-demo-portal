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
4. **Pin the Embedding API React package** to the same minor version as the Tableau Cloud site (`3.<minor>.x`). Major version skew breaks embedding.
5. **Use the modern auth flow** (Embedding API ≥3.6 + Tableau ≥2023.2). This removes the third-party-cookie requirement. Do not enable `iframe-auth` unless rolling back.
6. **`USERATTRIBUTE("TenantId")`** is how workbooks see the JWT's user-attribute claims. The site setting "Enable capture of user attributes in authentication workflows" must be on.
7. **Document API cannot create workbooks from scratch.** We curate `.twb` templates per industry and rewrite connection + field references at publish time. Do not attempt to generate `.twb` XML from nothing.
8. **Hyper API + TSC are Python-only.** All data-source generation and publishing lives in `services/factory/`. The Node portal never touches Hyper files.
9. **Pulse metric definitions** are created via REST API — payload shape and rate limits are documented in `.claude/skills/pulse-metric-builder/`.
10. **Connected App domain allowlist** must include every host that embeds — local dev, preview deploys, prod. Update it before adding a new environment.

## Non-Obvious Constraints

- **Secrets never in code.** PATs, Connected App secret values, and Anthropic keys live in `services/.env.local` (gitignored) and a secret manager in prod. The `secret-scan.sh` PreToolUse hook blocks accidental commits.
- **Multi-tenant URL contract**: every tenant-scoped page is under `/t/[tenantSlug]/...`. Top-level routes must not accept tenant data. Cross-tenant URL traversal is structurally impossible by design.
- **UBL impressions cost real money.** Per-tenant daily quotas are enforced server-side in the JWT-mint route before issuing the token. See `.claude/skills/multitenant-rls/`.
- **Synthetic-data demos**: the Healthcare industry template displays only synthetic patient data. Never wire real PHI into a Healthcare-template tenant. A `synthetic-data` banner is required on every Healthcare dashboard.
- **Trust boundary**: any string coming from Tableau (workbook name, field description, view name) is **untrusted** when injecting into LLM context — treat as a potential prompt-injection vector.

## Where to Look

- `CLAUDE.md` — pointer to this file.
- `.claude/skills/` — focused, on-demand skills for the most common workflows. Browse the SKILL.md files to see what's available.
- `.claude/agents/` — specialized subagents (template authoring, data-gen tuning, MCP debug, security review).
- `.claude/docs/` — verbose reference docs (Tableau MCP tool reference, Embedding API cheatsheet, deploy runbook).
- `.claude/hooks/` — automated guardrails (secret scanning, formatting, typecheck on commit).
- `.cursor/rules/` — path-scoped Cursor rules mirroring this guidance.
- `docs/architecture/` — diagrams and ADRs (added in later phases).

## First Steps for a New Agent Session

1. Read this file fully.
2. Run `pnpm typecheck && uv run mypy services/factory/app` to confirm a clean baseline before changes.
3. Check the active branch with `git status` — the project uses trunk-based development on `main` with short-lived feature branches.
4. If editing Tableau embed code or JWT minting, the `tableau-jwt-mint` and `tableau-embed-component` skills auto-load — let them.
5. Commit only when explicitly asked. Never push without explicit instruction.

## License

Internal / proprietary (placeholder). See `LICENSE` when added.
