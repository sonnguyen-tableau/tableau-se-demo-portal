# Tableau AI Portal

A multi-tenant embedded analytics portal on **Tableau Cloud** with a **Claude-powered Self-Service Analytics AI agent** (via the official `@tableau/mcp-server`), plus a **Demo Factory** that auto-generates a fully-branded, industry-tailored Tableau analytics portal from a single customer URL.

## What's in this repo

- `apps/web/` — Next.js 15 portal (App Router, React 19, TypeScript strict).
- `services/factory/` — Python FastAPI sidecar that owns synthetic-data generation, Hyper file publishing, workbook templating, and Pulse metric provisioning.
- `services/agent/` — optional dedicated agent service (extracted from `/api/chat` if scale demands).
- `packages/` — shared TypeScript packages (JWT minter, MCP tool wrappers, shared schemas).
- `.claude/` — Claude Code project conventions (skills, subagents, hooks, settings).
- `.cursor/rules/` — path-scoped Cursor rules.
- `infra/` — Docker Compose + deploy configs.

## Architecture at a glance

```
Browser
  ├── Next.js portal (App Router)
  │     ├── /api/tableau/token   (JWT mint, Connected App Direct Trust, HS256, 10min TTL)
  │     ├── /api/chat            (SSE; Anthropic SDK + Tableau MCP servers parameter)
  │     └── TableauViz / TableauPulse (embedded, single JWT per page)
  └── Factory UI (/factory/...) ── POST ──► Python FastAPI sidecar
                                              ├── Playwright scrape
                                              ├── Claude profile + schema + brand
                                              ├── Faker + NumPy data generation
                                              ├── Hyper API → .hyper file
                                              ├── Tableau Server Client → publish data source + workbook
                                              └── Pulse REST API → metric definitions
```

## Status

All 12 phases (0–11) complete and verified — 38 TypeScript tests + 28 Python tests passing, typecheck clean under strict mode, production `next build` succeeds.

See [AGENTS.md](./AGENTS.md) for the canonical project guide, and `.cursor/plans/` for the implementation plan.

## Getting Started

Documented commands and prerequisites live in [AGENTS.md](./AGENTS.md) and individual skill files. For humans:

```bash
pnpm install
uv sync --directory services/factory
cp .claude/settings.local.json.example .claude/settings.local.json
cp apps/web/.env.example apps/web/.env.local
# fill in TABLEAU_*, ANTHROPIC_API_KEY, AUTH_SECRET, DEV_USERS_JSON in apps/web/.env.local
pnpm dev
```

## Documentation

### Architecture & decisions

- [`docs/architecture/overview.md`](./docs/architecture/overview.md) — system overview
- [`docs/adr/0001-licensing-model.md`](./docs/adr/0001-licensing-model.md) — Tableau UBL vs role-based
- [`docs/adr/0002-multitenancy-strategy.md`](./docs/adr/0002-multitenancy-strategy.md) — JWT user-attribute RLS

### Runbooks (deployment & ops)

- [`docs/runbooks/tableau-cloud-setup.md`](./docs/runbooks/tableau-cloud-setup.md) — one-time Tableau Cloud Connected App + PAT setup
- [`docs/runbooks/local-development.md`](./docs/runbooks/local-development.md) — chạy 100% local (~$5–30/tháng)
- [`docs/runbooks/rollout-production-lean.md`](./docs/runbooks/rollout-production-lean.md) — lean production cho team 2–4 người (~$110–545/tháng)
- [`docs/runbooks/rollout-production-full.md`](./docs/runbooks/rollout-production-full.md) — full production cho team trung bình / lớn (~$1,200–1,700/tháng)

### Security

- [`docs/security/phase-6-review.md`](./docs/security/phase-6-review.md) — Phase 0–5 security review
- [`docs/security/phase-11-review.md`](./docs/security/phase-11-review.md) — Phase 7–11 security review + queued follow-ups

## License

Internal / proprietary (placeholder).
