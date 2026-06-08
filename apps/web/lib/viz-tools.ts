import type { McpToolDescriptor } from "./mcp-client";

/**
 * Client-side viz-control tools. The agent loop intercepts these (name starts
 * with `viz.`) and emits an SSE viz_action event instead of invoking MCP.
 * Their tool_result back to Claude is synthetic (ok / error) so the model
 * understands whether the dashboard responded to its request.
 */
export const VIZ_TOOLS: readonly McpToolDescriptor[] = [
  {
    name: "viz_applyFilter",
    description:
      "Apply a categorical filter to the embedded dashboard. The user sees the dashboard update. Use to drill down by Region, Segment, Category, etc.",
    input_schema: {
      type: "object",
      required: ["field", "values"],
      properties: {
        field: { type: "string", description: "Tableau field name." },
        values: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        updateType: {
          type: "string",
          enum: ["REPLACE", "ADD", "REMOVE"],
          default: "REPLACE",
        },
      },
    },
  },
  {
    name: "viz_clearFilter",
    description: "Remove all values from a categorical filter (reset to all).",
    input_schema: {
      type: "object",
      required: ["field"],
      properties: { field: { type: "string" } },
    },
  },
  {
    name: "viz_selectMarks",
    description:
      "Highlight specific marks in the dashboard (does NOT filter; just selects/emphasizes). Useful to direct the user's attention.",
    input_schema: {
      type: "object",
      required: ["field", "values"],
      properties: {
        field: { type: "string" },
        values: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
  },
  {
    name: "viz_clearSelectedMarks",
    description: "Clear any currently selected marks.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "viz_switchTab",
    description: "Switch the dashboard to a different sheet/tab by name.",
    input_schema: {
      type: "object",
      required: ["sheetName"],
      properties: { sheetName: { type: "string" } },
    },
  },
  {
    name: "viz_setParameter",
    description: "Set a workbook parameter value (use for currency, fiscal year, etc.).",
    input_schema: {
      type: "object",
      required: ["name", "value"],
      properties: { name: { type: "string" }, value: { type: "string" } },
    },
  },
  {
    name: "viz_showPulseCard",
    description:
      "Embed a native Tableau Pulse metric card directly in the chat with a sparkline, current value, and trend. Use when the user asks for a single KPI snapshot (e.g. 'Doanh thu hôm nay?', 'Show me return rate'). Prefer this over text when the metric exists in Pulse — it gives the user the canonical Tableau visualization with built-in anomaly detection. Pass the metric_id (the LUID, NOT the metric definition id) returned by list-pulse-metrics-from-metric-definition-id.",
    input_schema: {
      type: "object",
      required: ["metric_id", "name"],
      properties: {
        metric_id: {
          type: "string",
          description: "The Pulse metric LUID. Get it from list-pulse-metrics-from-metric-definition-id.",
        },
        name: {
          type: "string",
          description: "Human-readable metric name to show as the card header (e.g. 'Revenue', 'Return Rate').",
        },
      },
    },
  },
] as const;

export function isVizToolName(name: string): boolean {
  return name.startsWith("viz_");
}
