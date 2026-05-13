/**
 * Tools exposed by `@tableau/mcp-server`. Source of truth:
 * https://tableau.github.io/tableau-mcp/docs/intro
 */
export const ALL_TABLEAU_MCP_TOOLS = [
  "list-datasources",
  "list-workbooks",
  "list-views",
  "list-custom-views",
  "search-content",
  "get-datasource-metadata",
  "get-workbook",
  "get-view-data",
  "get-view-image",
  "get-custom-view-data",
  "get-custom-view-image",
  "query-datasource",
  "list-all-pulse-metric-definitions",
  "list-pulse-metric-definitions-from-definition-ids",
  "list-pulse-metrics-from-metric-definition-id",
  "list-pulse-metrics-from-metric-ids",
  "list-pulse-metric-subscriptions",
  "generate-pulse-metric-value-insight-bundle",
  "generate-pulse-insight-brief",
] as const;

export type TableauMcpToolName = (typeof ALL_TABLEAU_MCP_TOOLS)[number];

/**
 * Tools the chat agent is allowed to invoke. Anything not in this list is
 * filtered out before passing tool definitions to Claude.
 *
 * Excludes:
 *  - `list-pulse-metric-subscriptions` — privacy-sensitive
 *  - `get-workbook` — rarely needed in chat; the agent should use list-views
 *  - `get-custom-view-*` — out of MVP scope
 *  - `list-all-pulse-metric-definitions` — prefer scoped lookups
 *
 * Update this list deliberately; every addition is a security decision.
 */
export const AGENT_TOOL_ALLOWLIST: readonly TableauMcpToolName[] = [
  "get-datasource-metadata",
  "list-datasources",
  "list-workbooks",
  "list-views",
  "search-content",
  "get-view-data",
  "get-view-image",
  "query-datasource",
  "generate-pulse-insight-brief",
  "list-pulse-metric-definitions-from-definition-ids",
  "list-pulse-metrics-from-metric-definition-id",
  "list-pulse-metrics-from-metric-ids",
  "generate-pulse-metric-value-insight-bundle",
] as const;

const allowSet = new Set<string>(AGENT_TOOL_ALLOWLIST);

export function isAgentToolAllowed(name: string): name is TableauMcpToolName {
  return allowSet.has(name);
}
