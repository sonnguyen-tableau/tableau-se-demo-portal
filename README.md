# Tableau AI Portal — SE Demo Factory

A multi-tenant embedded analytics portal on **Tableau Cloud** with a **Claude-powered Self-Service Analytics AI agent** (via the official `@tableau/mcp-server`), plus a **Demo Factory** that auto-generates a fully-branded, industry-tailored Tableau analytics portal from a single customer URL.

This repository is a **shared team resource for Tableau Sales Engineers**. Each SE points it at *their own* Tableau Cloud site, feeds in a customer/industry, and stands up a live, branded demo. It encodes a large body of hard-won know-how (Cloud strict-mode workbook authoring, multi-tenant RLS, the Demo Factory pipeline) as Claude Code skills so you don't have to rediscover it.

> **New here?** Follow the **[SE Setup Guide](./docs/onboarding/se-setup-guide.md)** — a complete step-by-step walkthrough from clone → your Tableau Cloud site → first live demo. ([`se-quickstart.md`](./docs/onboarding/se-quickstart.md) is the condensed reference; [`new-demo-request.md`](./docs/onboarding/new-demo-request.md) is the per-customer playbook.)

## What's in this repo

- `apps/web/` — Next.js 15 portal (App Router, React 19, TypeScript strict).
- `services/factory/` — Python FastAPI sidecar that owns synthetic-data generation, Hyper file publishing, workbook templating, and Pulse metric provisioning.
- `packages/` — shared TypeScript packages (JWT minter, MCP tool wrappers, shared schemas).
- `.claude/` — Claude Code project conventions: **skills, subagents, hooks, settings**. This is where the transferable know-how lives.
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

See [AGENTS.md](./AGENTS.md) for the canonical project guide for AI coding agents.

## Getting Started

Full onboarding is in **[`docs/onboarding/se-quickstart.md`](./docs/onboarding/se-quickstart.md)**. The short version:

```bash
pnpm install
uv sync --directory services/factory
cp .claude/settings.local.json.example .claude/settings.local.json
cp apps/web/.env.example apps/web/.env.local
cp services/factory/.env.example services/factory/.env
# Fill in YOUR OWN Tableau Cloud site, Connected App, PAT, and Anthropic key.
# One-time Tableau Cloud setup: docs/runbooks/tableau-cloud-setup.md
pnpm dev
```

Then open Claude Code in the repo and run the **`new-tenant-portal`** skill to build your first demo.

## Documentation

### Onboarding (start here)

- [`docs/onboarding/se-setup-guide.md`](./docs/onboarding/se-setup-guide.md) — **complete step-by-step setup guide** (clone → your Tableau Cloud site → first live demo)
- [`docs/onboarding/se-workshop.md`](./docs/onboarding/se-workshop.md) — **hands-on workshop** (the in-repo version of the SE workshop deck: setup → build your first tenant, ~1 hr)
- [`docs/onboarding/se-quickstart.md`](./docs/onboarding/se-quickstart.md) — condensed first-run reference
- [`docs/onboarding/new-demo-request.md`](./docs/onboarding/new-demo-request.md) — the repeatable per-customer demo playbook
- [`docs/onboarding/DISTRIBUTION.md`](./docs/onboarding/DISTRIBUTION.md) — for the maintainer: publishing this repo to the team

### Architecture & decisions

- [`docs/architecture/overview.md`](./docs/architecture/overview.md) — system overview
- [`docs/adr/0001-licensing-model.md`](./docs/adr/0001-licensing-model.md) — Tableau UBL vs role-based
- [`docs/adr/0002-multitenancy-strategy.md`](./docs/adr/0002-multitenancy-strategy.md) — JWT user-attribute RLS

### Runbooks (deployment & ops)

- [`docs/runbooks/tableau-cloud-setup.md`](./docs/runbooks/tableau-cloud-setup.md) — one-time Tableau Cloud Connected App + PAT setup
- [`docs/runbooks/local-development.md`](./docs/runbooks/local-development.md) — run 100% local
- [`docs/runbooks/rollout-production-lean.md`](./docs/runbooks/rollout-production-lean.md) — lean production for a 2–4 person team
- [`docs/runbooks/rollout-production-full.md`](./docs/runbooks/rollout-production-full.md) — full production for a medium/large team

### Security

- [`docs/security/phase-6-review.md`](./docs/security/phase-6-review.md) — Phase 0–5 security review
- [`docs/security/phase-11-review.md`](./docs/security/phase-11-review.md) — Phase 7–11 security review + queued follow-ups

## License

Internal / proprietary (placeholder).
