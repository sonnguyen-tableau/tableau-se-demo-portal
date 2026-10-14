/**
 * Single source of truth for the chat SSE wire protocol (AG-01).
 *
 * `AgentEvent` is exactly what `runAgentTurn` (lib/agent.ts, server) yields.
 * `RawEvent` is the full set a client SSE reader can receive — `AgentEvent`
 * plus the transport-only `open` frame that the route emits before the turn.
 *
 * Both the server (lib/agent.ts re-exports `AgentEvent` from here) and the
 * client engine (hooks/useChatAgent) import this one definition, so the full
 * Agent page and the docked panel handle the identical set of events —
 * including pulse_card and the export-card variants that the old, divergent
 * client unions dropped.
 */

export type AgentEvent =
  | { type: "system"; message: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "tool_image"; id: string; mimeType: string; data: string }
  | { type: "tool_table"; id: string; columns: string[]; rows: string[][] }
  | { type: "tool_vegaspec"; id: string; spec: Record<string, unknown>; title?: string | undefined }
  | { type: "pulse_card"; id: string; metricId: string; name: string }
  | { type: "viz_action"; id: string; name: string; input: Record<string, unknown> }
  | { type: "followups"; items: string[] }
  | {
      type: "sources";
      /** Human datasource names used this turn (resolved from the viz context). */
      datasources: string[];
      /** Number of query-datasource calls this turn. */
      queryCount: number;
      /** Tenant runs on synthetic demo data → render the "Dữ liệu mô phỏng" chip. */
      syntheticData?: boolean;
      /** VizQL query JSON per call — shown only to internal users ("Xem truy vấn"). */
      queries?: string[];
    }
  | {
      type: "campaign_csv";
      id: string;
      campaign: string;
      rowCount: number;
      digital: number;
      rm: number;
      projectedDisbursedVnd: number;
      columns: string[];
      zaloPreview: string;
      downloadUrl: string;
      /** `s3://…` URI when the CSV was also written to the S3 landing zone (tee on). */
      s3Uri?: string;
    }
  | {
      type: "carrier_report";
      id: string;
      variant: string;
      title: string;
      line: string | null;
      healthBand: string | null;
      kpis: { label: string; value: string }[];
      downloadUrl: string;
    }
  | {
      type: "card_activation";
      id: string;
      campaign: string;
      rowCount: number;
      digital: number;
      rm: number;
      /** Projected activated cards from the targeted segment (analogue of projectedDisbursedVnd). */
      projectedActivations: number;
      columns: string[];
      zaloPreview: string;
      downloadUrl: string;
      /** `s3://…` URI when the CSV was also written to the S3 landing zone (tee on). */
      s3Uri?: string;
    }
  | {
      type: "prospect_export";
      id: string;
      campaign: string;
      rowCount: number;
      avgFitScore: number;
      /** Projected new cards opened from the targeted prospect segment. */
      projectedNewCards: number;
      columns: string[];
      downloadUrl: string;
      /** `s3://…` URI when the CSV was also written to the S3 landing zone (tee on). */
      s3Uri?: string;
    }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input_tokens?: number; output_tokens?: number } };

/** Transport frame sent once before the turn with the available MCP tool names. */
export interface OpenEvent {
  type: "open";
  tools: string[];
}

/** Everything a client SSE reader can receive over the wire. */
export type RawEvent = AgentEvent | OpenEvent;
