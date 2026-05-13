---
name: Tableau MCP Tool Catalog
description: Use when the agent or any code path needs to invoke a Tableau MCP tool. Documents every tool exposed by @tableau/mcp-server (list/get datasources, query-datasource, get-view-data, get-view-image, search-content, Pulse tools), correct invocation order to prevent field-name hallucination, multi-tenant impersonation via the Tableau-User header, and read/write boundaries.
---

# Tableau MCP Tool Catalog

The official `@tableau/mcp-server` exposes 18 tools across five Tableau API surfaces. Use this skill whenever you write code that invokes them (agent route, factory, tests) or debug a tool failure.

## Tool inventory

### Discovery (REST + Content Exploration API)

| Tool | Purpose | Read-only |
| --- | --- | --- |
| `list-datasources` | enumerate published data sources on the site | yes |
| `list-workbooks` | enumerate workbooks | yes |
| `list-views` | enumerate views | yes |
| `list-custom-views` | list custom views for a workbook | yes |
| `search-content` | full-text search across site content | yes |

### Data Q&A (VizQL Data Service + Metadata API)

| Tool | Purpose | Notes |
| --- | --- | --- |
| `get-datasource-metadata` | field names, types, descriptions for a datasource | **call before `query-datasource`** to ground the LLM |
| `query-datasource` | run a VizQL query (filters, aggregations) against a published data source | governed; same semantics as the dashboard |

### View read-out

| Tool | Purpose |
| --- | --- |
| `get-workbook` | workbook metadata (views, owner, project, last-update) |
| `get-view-data` | CSV-shaped data for a view (what the user is looking at) |
| `get-view-image` | PNG image of a view |
| `get-custom-view-data` / `get-custom-view-image` | same for saved custom views |

### Pulse (Metric Insights)

| Tool | Purpose |
| --- | --- |
| `list-all-pulse-metric-definitions` | site-wide |
| `list-pulse-metric-definitions-from-definition-ids` | targeted lookup |
| `list-pulse-metrics-from-metric-definition-id` | metrics under a definition |
| `list-pulse-metrics-from-metric-ids` | targeted lookup |
| `list-pulse-metric-subscriptions` | current user's subscriptions |
| `generate-pulse-metric-value-insight-bundle` | structured insight bundle for a metric |
| `generate-pulse-insight-brief` | AI-written narrative insight brief (Discover) |

## Golden rule: ground before query

Always call `get-datasource-metadata` **before** `query-datasource` (or surface it in the system prompt) so the LLM uses real field names. Failing this rule is the #1 cause of confidently-wrong agent answers.

Pattern enforced in our agent:

```ts
// services/agent or apps/web/app/api/chat/route.ts
const meta = await tools.getDatasourceMetadata({ datasourceId });
system += `\nDatasource fields: ${meta.fields.map(f => `${f.name}:${f.type}`).join(", ")}`;
// only NOW pass tools to Claude with full system prompt
```

## Server transport

Two modes:

1. **stdio** — spawn a child process per request. Simple, no shared state, slower cold start.
2. **HTTP sidecar** — long-lived container `docker compose up tableau-mcp`. Required when using Claude's `mcp_servers` parameter with `type: "url"`.

Project default: **HTTP sidecar**. See `infra/docker-compose.yml` (added in Phase 3).

## Multi-tenant impersonation

The MCP server authenticates to Tableau using a service-account PAT or JWT (env: `TABLEAU_PAT_NAME`, `TABLEAU_PAT_SECRET`). For per-user RLS, the agent **forwards the end-user identity** in a custom header:

```http
Tableau-User: alice@acme.com
```

Tableau Cloud applies data policies as if `alice@acme.com` made the call. The LLM cannot escape RLS because the user attribute lookup happens server-side regardless of tool args.

In Anthropic SDK terms:

```ts
mcp_servers: [{
  type: "url",
  url: process.env.TABLEAU_MCP_URL,
  name: "tableau",
  authorization_token: mintInternalMcpToken({ user: session.user.email, tenantId }),
}]
```

The internal token wraps `Tableau-User` so the MCP sidecar can apply it.

## Allowed tool set per chat turn

The agent's effective toolset for normal chat:

- `get-datasource-metadata`
- `list-datasources`
- `query-datasource`
- `get-view-data`
- `get-view-image`
- `search-content`
- `generate-pulse-insight-brief`
- `list-pulse-metrics-from-metric-ids`

Excluded from the default set (require explicit user action):

- `list-pulse-metric-subscriptions` — privacy
- Anything else not in the list

Maintain this allowlist in `packages/mcp-tools/allowlist.ts`.

## Common failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| LLM hallucinates field names | metadata not in context | always pre-call `get-datasource-metadata` |
| `query-datasource` returns empty | filter typo or RLS blocked all rows | inspect `Tableau-User` header; verify USERATTRIBUTE setting |
| 401 from MCP server | service-account PAT expired | rotate via Tableau admin; update vault |
| 429 from Pulse | bulk metric creation hitting rate limits | batch with exponential backoff (see `pulse-metric-builder`) |
| Slow first call | stdio cold start | switch to HTTP sidecar |

## Related skills

- `factory-pipeline-debug` — uses `list-datasources`, REST publish, Pulse creation.
- `pulse-metric-builder` — Pulse-specific payloads.
- `multitenant-rls` — `Tableau-User` impersonation specifics.
