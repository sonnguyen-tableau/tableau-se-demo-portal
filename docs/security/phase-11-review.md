# Security Review — Phases 7 through 11 (final)

Date: 2026-05-13
Reviewer: project record (mirrors output of `.claude/agents/security-reviewer.md`)

## Scope

Phases 7 (Factory MVP), 8 (4 remaining industry generators), 9 (confirm-before-build UX), 10 (vision-based brand extraction + tenant theme), 11 (admin UI, concurrency limits, final review).

Closes the security loop opened in `docs/security/phase-6-review.md`.

## Critical (blocks merge)

None.

## High

None. The two items raised below were resolved during their phase:

- **Factory route authentication.** Both `/api/factory/start` and `/api/factory/[jobId]` require `session.user` AND `ctx.isInternal`. External users cannot trigger the factory or stream its events.
- **Confirm endpoint authentication.** `/api/factory/[jobId]/confirm` and `/profile` apply the same internal-only check.
- **Tenant admin endpoints.** All `/api/admin/tenants/...` routes require `ctx.isInternal`. PATCH validates with Zod; the theme PUT route validates hex colors via regex and rejects malformed input with 400.

## Medium

- **In-memory tenant + theme registry.** Phase 11 uses `Map<string, TenantRecord>` for both. Resets on process restart; not multi-instance-safe. Phase 12 swap to Postgres (or Redis). Documented in `lib/tenants.ts` and `lib/tenant-theme.ts`.
- **Factory concurrency cap is per-process.** The semaphore in `services/factory/app/main.py` (`_MAX_CONCURRENT_JOBS = 3`) caps within one factory instance but doesn't coordinate across replicas. Acceptable for a single-replica deployment; document the limit when scaling out.
- **Factory job state ephemeral.** `_JOBS` is in-process. A pipeline crash mid-run loses the job; the user must restart. Phase 12 should move to a durable queue.
- **Scraper SSRF surface.** `services/factory/app/scrape.py` calls `httpx.get(url)` with `follow_redirects=True` against user-supplied URLs. We don't filter against internal address ranges (RFC1918, link-local, AWS metadata IPs at `169.254.169.254`). Mitigations to apply before any non-internal user can reach the factory:
  1. Resolve the hostname server-side and reject responses on private/link-local addresses.
  2. Cap response size (currently we read the entire body).
  3. Disallow `file://`, `gopher://`, etc., schemes — pydantic `HttpUrl` covers most cases but check explicitly.
- **LLM input from scraped HTML.** `app/profile.py` trims HTML to 12KB and passes it to Claude with a fixed prompt. Adversarial content could attempt prompt injection. Mitigations: the prompt asks for structured JSON only, the pydantic `CompanyProfile.model_validate` discards unrecognized fields, and the Claude response shape is strict. Low residual risk; documented.
- **Brand vision input.** `app/brand.py` fetches the OG image with `httpx` and posts it to Claude. The image size is capped at 4 MB; the response is parsed into `BrandTheme` with hex validation and tone allowlist.

## Low / Informational

- **Audit log granularity.** Phase 6 audit kinds cover chat + JWT mint. Phase 11 admin actions (rename, archive, delete) reuse the closest existing audit kind (`chat.start` with `messageHash="admin.archive"` etc.). Add a dedicated `admin.*` family before any production rollout.
- **Confirm timeout.** `CONFIRM_TIMEOUT_SECONDS = 600` aborts the pipeline if the user walks away. Reasonable default; expose as env var if customers need longer.
- **CSP.** Still minimal headers (X-Frame-Options DENY, X-CTO nosniff, Referrer-Policy strict-origin-when-cross-origin). Add full CSP including `frame-ancestors` and explicit allowlist for Tableau embed origins before production.
- **Pulse rate limiting.** `services/factory/app/pulse.py` uses `Semaphore(3)` + exponential backoff. Sufficient for batch creation.
- **Healthcare synthetic banner.** Synthetic data origin is enforced at the schema layer (only `P\d{7}` patient IDs). The dashboard banner is the workbook's responsibility — verify in any Healthcare-template `.twb` author review.

## Verified safe

- All sensitive credentials live in env vars only; `.env*` files gitignored; `secret-scan.sh` PreToolUse hook blocks accidental edits with secret patterns.
- Trust boundaries (`apps/web/middleware.ts`, every Route Handler) validate inputs through Zod or pydantic before use.
- JWT TTL clamped to 600s (`packages/tableau-jwt/src/mint.ts:JWT_TTL_SECONDS`). Unit tested.
- Multi-tenant URL contract: every tenant-scoped page is under `/t/[tenantSlug]/...`; middleware enforces `slug === session.tenantId` or `internal-employees` group.
- MCP tool allowlist (`packages/mcp-tools/src/allowlist.ts`) excludes `list-pulse-metric-subscriptions` and other privacy-sensitive tools by default.
- `Tableau-User` header is forwarded to the MCP sidecar so Tableau Cloud applies the end-user's row-level security regardless of what the LLM crafts.
- Prompt-injection sanitizer (`lib/sanitize.ts`) neutralizes role-tag / "ignore previous instructions" patterns in untrusted viz context before injection into the system prompt.
- All Tableau-side workbooks (added per industry in Phase 8) must include the data policy `[TenantId] = USERATTRIBUTE("TenantId") OR USERATTRIBUTE("TenantId") = "internal"`. Enforce via the contract test suite when authoring templates.

## Recommended follow-ups (queued, post-MVP)

1. SSRF hardening on the factory scraper (private-IP block, response-size cap).
2. Move tenants, themes, audit log, rate-limit counter, and impression counter to durable stores.
3. Dedicated `admin.*` audit event family.
4. Full CSP including `frame-ancestors` Tableau allowlist.
5. Per-tenant Tableau artifact cleanup when a tenant is deleted permanently (currently we orphan published data sources).
6. Authn for `/factory/...` endpoints on the FastAPI sidecar itself — currently it trusts the proxy; tighten before exposing the sidecar directly.
7. Rotate Connected App secret + service-account PAT quarterly; runbook in `docs/runbooks/tableau-cloud-setup.md` §8.
