import type { McpToolDescriptor } from "./mcp-client";

/**
 * Client-side viz-control tools. The agent loop intercepts these (name starts
 * with `viz.`) and emits an SSE viz_action event instead of invoking MCP.
 * Their tool_result back to Claude is synthetic (ok / error) so the model
 * understands whether the dashboard responded to its request.
 */
export const VIZ_TOOLS: readonly McpToolDescriptor[] = [
  {
    name: "viz.applyFilter",
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
    name: "viz.clearFilter",
    description: "Remove all values from a categorical filter (reset to all).",
    input_schema: {
      type: "object",
      required: ["field"],
      properties: { field: { type: "string" } },
    },
  },
  {
    name: "viz.selectMarks",
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
    name: "viz.clearSelectedMarks",
    description: "Clear any currently selected marks.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "viz.switchTab",
    description: "Switch the dashboard to a different sheet/tab by name.",
    input_schema: {
      type: "object",
      required: ["sheetName"],
      properties: { sheetName: { type: "string" } },
    },
  },
  {
    name: "viz.setParameter",
    description: "Set a workbook parameter value (use for currency, fiscal year, etc.).",
    input_schema: {
      type: "object",
      required: ["name", "value"],
      properties: { name: { type: "string" }, value: { type: "string" } },
    },
  },
] as const;

export function isVizToolName(name: string): boolean {
  return name.startsWith("viz.");
}
