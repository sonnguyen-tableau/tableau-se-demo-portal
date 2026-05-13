# Security Review — Phases 0 through 5

Date: 2026-05-13
Reviewer: project record (mirrors output of `.claude/agents/security-reviewer.md`)

## Scope

Phases 0 (Claude project foundation), 1 (Next.js skeleton + Tableau Cloud runbook), 2 (JWT mint + TableauViz embed), 3 (Claude + Tableau MCP via SSE), 4 (viz↔agent bridge), 5 (bidirectional viz control + TableauPulse).

## Critical (blocks merge)

None.

## High

None outstanding. The two items below were resolved during the phase:

- **JWT TTL** must be ≤ 600 seconds. Verified: `packages/tableau-jwt/src/mint.ts` clamps `ttlSeconds` to `JWT_TTL_SECONDS = 600`. Unit-tested in `mint.test.ts`.
- **Tenant URL enforcement.** `apps/web/middleware.ts` rejects any `/t/[slug]/...` request where `slug !== session.tenantId` unless the user is `internal-employees`. Verified.

## Medium

- **In-memory rate-limit & impression counter.** Both reset on process restart and don't share state across instances. Phase 11 swaps them for a durable store; document this loud in the deploy runbook so the gap is not forgotten.
- **MCP tool allowlist** is enforced server-side in `apps/web/lib/mcp-client.ts` via `@portal/mcp-tools` — verified. Phase 7 must keep the allowlist in sync if new tools are added.
- **Anthropic key is only read on the server.** Verified by grep (`rg -n "ANTHROPIC_API_KEY" apps/web/components`) — no client-side references.
- **`Tableau-User` impersonation header** is forwarded to MCP from `apps/web/lib/mcp-client.ts:openTableauMcp`. End-user identity flows to Tableau for RLS evaluation even when the agent crafts tool args.

## Low / Informational

- **CSP / security headers.** `apps/web/next.config.ts` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a minimal `Permissions-Policy`. Add a full Content-Security-Policy in Phase 11 (the embedded iframe origins need allowlisting).
- **Prompt-injection scaffolding.** `lib/sanitize.ts` neutralizes obvious "ignore previous instructions" / role-tag patterns and trims null bytes. Defence-in-depth; the real boundary remains Tableau's data policies.
- **Audit log redaction.** `lib/audit.ts` hashes message bodies and tool-call args before emitting; raw content does not appear in logs.
- **Viz action allowlist.** `lib/viz-tools.ts` enumerates 6 client-side actions. The agent cannot invent new ones — `applyVizAction` in the bridge accepts a typed `VizAction` union and the chat panel converts only known names.

## Verified safe

- `.env*` files gitignored (`.gitignore`). No secrets in `git ls-files | grep -E '^\.env'`.
- `rg ": any" apps/ packages/` returns no matches (TypeScript strict + no-`any`).
- All Route Handlers parse their body through Zod before use.
- `secret-scan` PreToolUse hook blocks edits containing matched secret patterns. Verified with a fake `sk-ant-…` payload.
- The dashboard embed page mints a fresh JWT per request — no token caching across users.

## Recommended follow-ups (queued, not blocking)

1. Phase 11: durable Redis-backed rate limiter and impression counter.
2. Phase 11: full Content-Security-Policy including `frame-ancestors` of trusted Tableau origins.
3. Phase 7: extend the security review to cover the factory pipeline (scraper SSRF; LLM input from scraped HTML; Hyper writes from untrusted-named columns).
4. Add a `Phase 6` integration test that mints a JWT for tenant A and confirms `query-datasource` impersonating user A cannot see tenant B's rows — gated on a real Tableau site in CI.
5. Rotate Connected App secret + service-account PAT quarterly; runbook in `docs/runbooks/tableau-cloud-setup.md` §8.
