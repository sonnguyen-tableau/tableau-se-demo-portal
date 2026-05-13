---
name: Multi-Tenant Row-Level Security via JWT User Attributes
description: Use when implementing or auditing tenant isolation, row-level security, USERATTRIBUTE() calculated filters, or the Tableau-User impersonation header. Covers JWT claim contract, Tableau data policies, internal-vs-external user group routing, and how to verify RLS without leaking tenants.
---

# Multi-Tenant Row-Level Security

The project hosts both **internal employees** and **external customers** in one Tableau Cloud site. Tenant isolation is enforced via JWT user-attribute claims + workbook data policies using `USERATTRIBUTE("TenantId")`. Use this skill when writing JWT-mint code, authoring workbook templates, debugging "I see another tenant's data" reports, or onboarding a new tenant.

## The contract

1. Every portal user has a `tenantId` on their NextAuth session.
2. The JWT minter copies it into the `TenantId` top-level claim.
3. Every Tableau workbook used in production includes a calculated **data policy** filter on each fact table:
   ```
   [TenantId] = USERATTRIBUTE("TenantId") OR USERATTRIBUTE("TenantId") = "internal"
   ```
4. Internal employees get `tenantId = "internal"` and the policy short-circuits (sees all tenants).
5. The Tableau site setting **Enable capture of user attributes in authentication workflows** is ON. Without it, `USERATTRIBUTE()` returns null and the policy passes for everyone — a critical regression.

## JWT claim shape (locked)

```json
{
  "sub": "alice@acme.com",
  "TenantId": "tenant-acme",
  "Region": "EMEA",
  "AccountId": "acc-12345",
  "https://tableau.com/groups": ["tenant-acme"]
}
```

Optional `https://tableau.com/groups` is used only when a user belongs to additional Tableau groups (e.g., a power-user group that grants extra permissions inside the tenant). It is NOT the primary tenant-isolation mechanism — `TenantId` is.

## Internal employees

- `tenantId = "internal"`
- `groups = ["internal-employees", ...]`
- Data policy `OR USERATTRIBUTE("TenantId") = "internal"` lets them see all tenants.

## URL structure

Every tenant-scoped page must live under:

```
/t/[tenantSlug]/...
```

Top-level pages never accept tenant-specific data. This makes cross-tenant URL traversal **structurally impossible** — the route can't even spell another tenant.

## Tableau side: the data policy

Author this once per workbook template. In Tableau Desktop:

1. Open the published data source.
2. Right-click → **Data Policies → Add Calculated Field Filter**.
3. Calculation:
   ```
   [TenantId] = USERATTRIBUTE("TenantId") OR USERATTRIBUTE("TenantId") = "internal"
   ```
4. Save & republish.

For Pulse metric definitions created by the Factory, the same filter is applied at the definition level (not workbook level) via the `filter_specification` field — see `pulse-metric-builder` for the payload.

## Tableau-User impersonation in MCP

When the agent calls Tableau MCP tools, the MCP server impersonates the end user via the `Tableau-User` header. Tableau evaluates `USERATTRIBUTE()` based on that user's session, so RLS applies to agent queries identically to dashboard queries. No special handling is needed in the LLM tool args.

## Verifying RLS — required tests

Before any RLS change ships:

1. **Two-tenant query test**: log in as `alice@acme.com` (TenantId=`tenant-acme`), run `query-datasource` for revenue. Switch to `bob@globex.com` (TenantId=`tenant-globex`), run the same query. Row counts MUST differ; data MUST NOT overlap.
2. **Internal bypass test**: log in as `admin@portal.com` (TenantId=`internal`), run the same query. Row count MUST equal `tenant-acme` + `tenant-globex` (and everyone else).
3. **Empty-attribute test**: minted JWT with `TenantId` omitted MUST return zero rows (not all rows). If it returns all rows, the data policy is wrong or the site setting is off.
4. **Token-substitution test**: take a `tenant-acme` JWT, copy it, attempt to load a `/t/tenant-globex/...` URL. The portal middleware must reject before any Tableau call.

Automate (1)-(3) as integration tests in `apps/web/tests/rls.test.ts`. Test (4) is in `apps/web/tests/middleware.test.ts`.

## Onboarding a new tenant

1. Create the tenant record in our database (slug, name, admin email).
2. Create a Tableau group `tenant-<slug>` (via REST API).
3. Add the tenant's users to that group with the **Viewer** role.
4. No additional Tableau artifacts are needed — dashboards are shared via the single shared project, RLS handles isolation.

## Common pitfalls

- **Adding a non-`/t/[slug]` page that displays tenant data.** Always nest under `/t/[slug]`. Middleware enforces this — don't bypass it.
- **Caching JWTs at the edge.** Different tenants must get different tokens. Disable Edge cache for `/api/tableau/token`.
- **Workbook with no data policy.** Easy to miss when adding a new workbook. The CI contract test runs every published workbook with three personas (two tenants + internal) and fails if any returns unexpected row counts.
- **Hardcoding tenant names in dashboards.** Use `USERNAME()` and `USERATTRIBUTE("TenantId")` — never embed a tenant name in a workbook title/header. Templating handles per-tenant branding in the portal layer.

## Related skills

- `tableau-jwt-mint` — exact claim shape.
- `industry-template-author` — RLS contract for `.twb` templates.
- `tableau-mcp-tools` — `Tableau-User` impersonation header.
