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
  {
    name: "viz_drawChart",
    description:
      "Render a Vega-Lite v5 chart directly in the chat panel. Call this AFTER query-datasource returns data — embed the rows inline in spec.data.values and choose the mark/encoding that best answers the question. The chart renders immediately above your narrative.\n\nChart type guide:\n- Time-series (month/date on X) → mark:\"line\" with point:true; add a second layer with transform:[{regression}] for trend questions.\n- Category comparison → mark:\"bar\"; use horizontal bar (x=measure, y=dimension) when >6 categories.\n- Two numeric dimensions / correlation → mark:\"point\"; add transform:[{regression}] layer.\n- Part-of-whole → mark:\"bar\" with color encoding + stack:\"normalize\" for 100% stacked.\n- Distribution → mark:\"bar\" with transform:[{bin:true, field:\"...\", as:[\"bin_start\",\"bin_end\"]}].\n- Forecast / trend line → layer chart: layer[0] actual data (line/bar), layer[1] transform:[{regression:\"y\",on:\"x\",extent:[min,max_future]}] mark:\"line\" with strokeDash.\n\nAlways: include descriptive axis titles, limit data.values to ≤150 rows (use the top/most-recent rows), set width:\"container\".",
    input_schema: {
      type: "object",
      required: ["spec", "title"],
      properties: {
        title: {
          type: "string",
          description: "Concise chart title shown above the chart, e.g. 'Monthly Revenue — Q1 2025'.",
        },
        spec: {
          type: "object",
          description:
            "Complete Vega-Lite v5 spec. Must include: data.values (array of row objects from query result, max 150), mark or layer, encoding.x, encoding.y. Set width:\"container\". For layered charts use the top-level layer array.",
          properties: {
            data: { type: "object" },
            mark: {},
            layer: { type: "array" },
            encoding: { type: "object" },
            transform: { type: "array" },
            width: {},
            height: {},
            $schema: { type: "string" },
          },
        },
      },
    },
  },
] as const;

/** The exact set of client-side viz tool names (used to validate the untrusted
 *  vizActionResults payload with z.enum). Kept in sync with VIZ_TOOLS by a test. */
export const VIZ_TOOL_NAMES = [
  "viz_applyFilter",
  "viz_clearFilter",
  "viz_selectMarks",
  "viz_clearSelectedMarks",
  "viz_switchTab",
  "viz_setParameter",
  "viz_showPulseCard",
  "viz_drawChart",
] as const;

export function isVizToolName(name: string): boolean {
  return name.startsWith("viz_");
}

/**
 * Follow-up suggestions pseudo-tool (AG-09). The model calls it once as the last
 * action of a turn; the agent loop emits a `followups` SSE event (rendered as
 * clickable chips under the latest reply) and returns ok. Handled server-side
 * like the viz_* tools — never reaches MCP.
 */
export const SUGGEST_FOLLOWUPS_TOOL: McpToolDescriptor = {
  name: "suggest_followups",
  description:
    "Call this ONCE as the very last action of your turn, AFTER your narrative answer, to offer the user 2–3 short follow-up questions they are most likely to ask next. Phrase each in the SAME language as the user's message, keep each under ~10 words, and make them specific to the data just discussed. Do not mention this tool or the chips in your reply text.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 3,
        description: "2–3 short follow-up questions in the user's language.",
      },
    },
    required: ["items"],
  },
};
