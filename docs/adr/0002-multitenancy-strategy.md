# ADR 0002: Multi-Tenancy via JWT User Attributes + Data Policies

- Status: Accepted
- Date: 2026-05-13
- Deciders: project leads

## Context

The portal serves both internal employees and external customers in the **same Tableau Cloud site**. Two viable tenant-isolation strategies:

1. **One Tableau project per tenant** with strict group permissions. Strong physical isolation; high artifact count and maintenance cost; difficult to ship a dashboard update across all tenants without touching N projects.
2. **Single shared project** with `USERATTRIBUTE("TenantId")` data policies + URL-scoped routes. Logical isolation enforced by RLS at the data source; very low artifact count; one dashboard change reaches all tenants instantly.

## Decision

**Single shared project + data policies + URL scoping** (option 2).

- Tenant identity flows: NextAuth session → JWT claim `TenantId` → workbook data policy → row filter.
- All tenant-scoped routes live under `/t/[tenantSlug]/...` and middleware enforces `tenantSlug === session.tenantId` (with `internal-employees` group bypass).
- Internal users get `TenantId="internal"` and the data policy short-circuits.

## Consequences

### Pros

- One workbook per industry, used by every tenant — updates propagate instantly.
- Lower Tableau-side artifact count → lower admin overhead.
- The Demo Factory only creates a per-tenant *data source* and group, not a per-tenant workbook.

### Cons

- Site-level admin error (data policy missing on a new workbook, "Enable capture of user attributes" turned off) becomes a high-blast-radius incident. Mitigated by:
  - CI contract test: every workbook + every persona, row counts must differ.
  - Phase 6 monitor: alert if `USERATTRIBUTE("TenantId")` is null in a sample query.
- Performance: VizQL evaluates the data policy on every query. Expected impact is small; we'll measure.

### Required follow-ups

- `apps/web/middleware.ts` — URL ↔ session tenant enforcement. (Phase 1.)
- `services/factory/templates/*.twb` — every template must include the data policy. (Phase 7-8.)
- `apps/web/tests/rls.test.ts` — automated multi-persona test against canonical workbooks. (Phase 7.)

## Alternatives considered

- **Per-tenant project**: rejected — artifact sprawl, dashboard update fan-out, slower factory.
- **Per-tenant Tableau site**: rejected — outside our pricing tier; cross-site auth complexity.
- **App-layer filtering**: rejected — would bypass Tableau's governance and security model.

## References

- `.claude/skills/multitenant-rls/SKILL.md`
- Tableau docs: <https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_user_attributes.html>
