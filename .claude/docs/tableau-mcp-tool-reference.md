# Tableau MCP Tool Reference

Verbose, parameter-level reference for every tool exposed by `@tableau/mcp-server`. The on-demand skill `tableau-mcp-tools` covers the catalog and patterns; this doc has the detailed parameter shapes for when you need to grep for one.

> Source of truth: <https://tableau.github.io/tableau-mcp/docs/intro> and the source of `@tableau/mcp-server`. Refresh this doc whenever a new version is released.

## 1. list-datasources

```
input:  { siteId?: string }
output: Array<{ id: string; name: string; project: { id, name }; updatedAt: string; certified: boolean }>
```

Returns published data sources visible to the impersonated user.

## 2. list-workbooks

```
input:  { siteId?: string; filter?: string }
output: Array<{ id, name, project, owner, viewCount, createdAt, updatedAt }>
```

`filter` follows Tableau REST filter syntax: `name:eq:Sales`.

## 3. list-views

```
input:  { siteId?: string; workbookId?: string }
output: Array<{ id, name, workbookId, contentUrl, viewUrlName }>
```

## 4. list-custom-views

```
input:  { workbookId: string }
output: Array<{ id, name, baseViewId, isDefault, owner }>
```

## 5. search-content

```
input:  { query: string; types?: Array<"workbook"|"view"|"datasource"|"flow"|"project"|"metric"> }
output: Array<{ type, id, name, url, ownerName, lastModified }>
```

Full-text search across the site. Useful for cross-dashboard discovery.

## 6. get-datasource-metadata

```
input:  { datasourceId: string }
output: {
  id, name, project,
  fields: Array<{
    name: string;
    type: "string" | "integer" | "real" | "datetime" | "date" | "boolean";
    role: "dimension" | "measure";
    description?: string;
    folder?: string;
    aliases?: string[];
  }>,
  hasExtract: boolean,
  certified: boolean
}
```

**Always call this before `query-datasource`.** It is the single most important grounding step for accurate agent answers.

## 7. get-workbook

```
input:  { workbookId: string }
output: { id, name, project, owner, views: [...], dataSources: [...], tags: [...] }
```

## 8. get-view-data

```
input:  {
  viewId: string;
  filters?: Array<{ field: string; values: string[] }>;
  maxRows?: number;            // default 10_000
}
output: { columns: string[]; rows: string[][] }     // CSV-shape
```

Returns aggregated row data as the view renders it. Respects current filters + RLS.

## 9. get-view-image

```
input:  { viewId: string; resolution?: "low" | "high" }
output: { contentType: "image/png"; base64: string }
```

## 10. get-custom-view-data / 11. get-custom-view-image

Same as view-data/view-image but for a saved custom view (`customViewId`).

## 12. query-datasource

The agent's workhorse. Composes a VizQL query and returns the result.

```
input:  {
  datasourceId: string;
  fields: Array<{
    field: string;
    aggregation?: "SUM" | "AVG" | "COUNT" | "COUNTD" | "MIN" | "MAX" | "MEDIAN" | "STDEV";
    alias?: string;
  }>;
  filters?: Array<
    | { type: "categorical"; field: string; values: string[]; exclude?: boolean }
    | { type: "quantitative"; field: string; min?: number; max?: number }
    | { type: "date"; field: string; from?: string; to?: string }
    | { type: "top"; field: string; by: { field: string; agg: string }; n: number; direction: "TOP" | "BOTTOM" }
  >;
  sortBy?: Array<{ field: string; direction: "ASC" | "DESC" }>;
  limit?: number;
}
output: { columns: string[]; rows: Array<Array<string | number | null>> }
```

Examples (Retail):

```jsonc
// "Top 5 categories by revenue last quarter"
{
  "datasourceId": "...",
  "fields": [
    { "field": "Category", "aggregation": null },
    { "field": "LineTotal", "aggregation": "SUM", "alias": "Revenue" }
  ],
  "filters": [
    { "type": "date", "field": "OrderDate", "from": "2026-01-01", "to": "2026-03-31" }
  ],
  "sortBy": [{ "field": "Revenue", "direction": "DESC" }],
  "limit": 5
}
```

## 13. list-all-pulse-metric-definitions

```
input:  { siteId?: string }
output: Array<{ id, name, description, ext_assigned_id, metric_count }>
```

## 14. list-pulse-metric-definitions-from-definition-ids

```
input:  { definitionIds: string[] }
output: Array<MetricDefinition>
```

## 15. list-pulse-metrics-from-metric-definition-id

```
input:  { definitionId: string }
output: Array<Metric>
```

## 16. list-pulse-metrics-from-metric-ids

```
input:  { metricIds: string[] }
output: Array<Metric>
```

## 17. list-pulse-metric-subscriptions

```
input:  {}
output: Array<{ id, metricId, frequency }>
```

Returns the calling user's subscriptions. Privacy-sensitive — gated in our agent allowlist.

## 18. generate-pulse-metric-value-insight-bundle

```
input:  { metricId: string; lookbackPeriod?: "DAY"|"WEEK"|"MONTH"|"QUARTER" }
output: {
  metricId, value, comparison, breakdowns: [...],
  insights: Array<{ type, summary, confidence }>
}
```

Structured insight bundle — analyzable.

## 19. generate-pulse-insight-brief

```
input:  { metricId: string; lookbackPeriod?: "DAY"|"WEEK"|"MONTH"|"QUARTER" }
output: { brief: string; metricId; generatedAt }
```

Natural-language brief — for direct embedding into chat responses.

---

## Tool allowlist (project policy)

The agent route in `apps/web/app/api/chat/route.ts` constrains the toolset to:

```
get-datasource-metadata
list-datasources
list-workbooks
list-views
search-content
get-view-data
get-view-image
query-datasource
generate-pulse-insight-brief
list-pulse-metric-definitions-from-definition-ids
list-pulse-metrics-from-metric-ids
list-pulse-metrics-from-metric-definition-id
generate-pulse-metric-value-insight-bundle
```

Exclusions: `list-pulse-metric-subscriptions` (privacy), `get-workbook` (rarely needed in chat).

Maintained in `packages/mcp-tools/allowlist.ts`.
