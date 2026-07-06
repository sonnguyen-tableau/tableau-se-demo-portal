import Anthropic from "@anthropic-ai/sdk";
import type { TableauMcpSession, McpToolDescriptor } from "./mcp-client";
import { VIZ_TOOLS, isVizToolName } from "./viz-tools";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 40;
const MAX_TOOL_RESULT_CHARS = 8_000;
const MAX_TOOL_DESCRIPTION_CHARS = 500;

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
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input_tokens?: number; output_tokens?: number } };

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentTurnInput {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userMessage: string;
  /** Prior conversation turns for multi-turn continuity. */
  history?: ConversationTurn[] | undefined;
  /** Optional MCP session for tool use. When omitted, runs as a plain chat. */
  mcp?: TableauMcpSession;
  /** Enable viz.* client-side tools. The route forwards them to the client. */
  enableVizTools?: boolean;
  signal?: AbortSignal;
}

/**
 * Single chat turn against Claude, looping through MCP tool calls until the
 * model produces a terminal `end_turn` stop. Yields a stream of typed events
 * the SSE route forwards to the browser.
 */
export async function* runAgentTurn(input: AgentTurnInput): AsyncGenerator<AgentEvent> {
  const anthropic = new Anthropic({ apiKey: input.apiKey });
  const mcpTools = input.mcp?.tools ?? [];
  const tools: McpToolDescriptor[] = input.enableVizTools
    ? [...mcpTools, ...VIZ_TOOLS]
    : [...mcpTools];

  // Truncate tool descriptions to keep tool definitions within budget
  const trimmedTools: McpToolDescriptor[] = tools.map((t) => ({
    ...t,
    description: t.description.length > MAX_TOOL_DESCRIPTION_CHARS
      ? t.description.slice(0, MAX_TOOL_DESCRIPTION_CHARS) + "…"
      : t.description,
  }));

  // Build message list: history turns (text only) + current user message.
  // History must alternate user/assistant; we skip tool-call blocks from prior
  // turns since they aren't serialised in the history payload.
  const historyMessages: Anthropic.MessageParam[] = (input.history ?? []).map((t) => ({
    role: t.role,
    content: t.content,
  }));
  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: input.userMessage },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const baseParams: Anthropic.MessageCreateParamsStreaming = {
      model: input.model ?? DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: input.systemPrompt,
      messages,
      stream: true,
    };
    if (trimmedTools.length > 0) {
      baseParams.tools = trimmedTools as unknown as Anthropic.Tool[];
    }

    // Retry on overloaded_error with exponential backoff (up to 3 attempts)
    let stream: Awaited<ReturnType<typeof anthropic.messages.stream>>;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        stream = anthropic.messages.stream(baseParams);
        // Trigger connection; if overloaded it throws on first read
        break;
      } catch (err) {
        const isOverloaded = err instanceof Error && err.message.includes("overloaded");
        if (isOverloaded && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        yield { type: "error", message: err instanceof Error ? err.message : "stream error" };
        return;
      }
    }
    stream = stream!;

    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text_delta", delta: event.delta.text };
        }
      }
    } catch (err) {
      const isOverloaded = err instanceof Error && err.message.includes("overloaded");
      yield {
        type: "error",
        message: isOverloaded
          ? "Hệ thống AI đang quá tải, vui lòng thử lại sau vài giây."
          : err instanceof Error ? err.message : "stream error",
      };
      return;
    }

    const message = await stream.finalMessage();

    for (const block of message.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    // Re-build the messages array with the assistant turn included before
    // emitting tool_result blocks.
    messages.push({ role: "assistant", content: message.content });

    if (toolCalls.length === 0 || !input.mcp) {
      yield {
        type: "done",
        usage: {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        },
      };
      return;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      if (call.name === "viz_showPulseCard") {
        // Pulse card embed: emit a dedicated event so the chat panel renders
        // a native <tableau-pulse> component (not a filter/mark dispatch).
        const metricId = String(call.input.metric_id ?? "").trim();
        const cardName = String(call.input.name ?? "").trim() || "Metric";
        if (!metricId) {
          const msg = "viz_showPulseCard requires a non-empty metric_id.";
          yield { type: "tool_result", id: call.id, ok: false, preview: msg };
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: [{ type: "text", text: msg }],
          });
          continue;
        }
        yield { type: "pulse_card", id: call.id, metricId, name: cardName };
        const preview = `Embedded Pulse card for ${cardName}.`;
        yield { type: "tool_result", id: call.id, ok: true, preview };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: false,
          content: [{ type: "text", text: preview }],
        });
        continue;
      }
      if (call.name === "viz_drawChart") {
        // Agent-generated Vega-Lite chart: validate the spec then emit as
        // tool_vegaspec so ChatPanel renders it via VegaChart.
        const title = String(call.input.title ?? "").trim() || undefined;
        const rawSpec = call.input.spec;
        if (
          typeof rawSpec !== "object" ||
          rawSpec === null ||
          Array.isArray(rawSpec)
        ) {
          const msg = "viz_drawChart: spec must be a Vega-Lite object.";
          yield { type: "tool_result", id: call.id, ok: false, preview: msg };
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: [{ type: "text", text: msg }],
          });
          continue;
        }
        const spec = rawSpec as Record<string, unknown>;
        // Enforce width:container so the chart fills the panel
        spec.width = "container";
        if (title && !spec.title) spec.title = title;
        yield { type: "tool_vegaspec", id: call.id, spec, title };
        const preview = `Chart rendered: ${title ?? "Vega-Lite chart"}.`;
        yield { type: "tool_result", id: call.id, ok: true, preview };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: false,
          content: [{ type: "text", text: preview }],
        });
        continue;
      }
      if (isVizToolName(call.name)) {
        // Client-side viz action: emit a request event and synthesize a
        // "queued" result back to Claude. The actual viz update happens in
        // the browser via the bridge. We optimistically tell the model it
        // succeeded so reasoning can continue; the user sees errors visually.
        yield { type: "viz_action", id: call.id, name: call.name, input: call.input };
        const preview = `Dispatched ${call.name} to the dashboard.`;
        yield { type: "tool_result", id: call.id, ok: true, preview };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: false,
          content: [{ type: "text", text: preview }],
        });
        continue;
      }
      if (!input.mcp) {
        const msg = `Tool '${call.name}' requires the Tableau MCP server, which is not connected.`;
        yield { type: "tool_result", id: call.id, ok: false, preview: msg };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: [{ type: "text", text: msg }],
        });
        continue;
      }
      yield { type: "tool_use", id: call.id, name: call.name, input: call.input };
      try {
        const result = await input.mcp.callTool(call.name, call.input);

        // Emit rich events for image, table, and vega specs before the tool_result
        const richContent = buildRichContent(result.content, call.name);
        for (const ev of richContent.events) {
          if (ev.type === "tool_image") yield { ...ev, id: call.id };
          else if (ev.type === "tool_table") yield { ...ev, id: call.id };
          else if (ev.type === "tool_vegaspec") yield { ...ev, id: call.id };
        }

        const text = previewToolResult(result.content);
        yield { type: "tool_result", id: call.id, ok: !result.isError, preview: text };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: result.isError,
          content: richContent.anthropicContent as (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[],
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "tool call failed";
        yield { type: "tool_result", id: call.id, ok: false, preview: msg };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: [{ type: "text", text: msg }],
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  yield {
    type: "error",
    message: `Agent stopped after ${MAX_TOOL_ROUNDS} tool rounds without a final answer.`,
  };
}

type RichEvent =
  | { type: "tool_image"; mimeType: string; data: string }
  | { type: "tool_table"; columns: string[]; rows: string[][] }
  | { type: "tool_vegaspec"; spec: Record<string, unknown>; title?: string | undefined };

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

interface RichBuildResult {
  events: RichEvent[];
  anthropicContent: AnthropicContentBlock[];
}

const PULSE_TOOLS = new Set([
  "generate-pulse-insight-brief",
  "generate_pulse_insight_brief",
  "generate-pulse-metric-value-insight-bundle",
  "generate_pulse_metric_value_insight_bundle",
]);

function buildRichContent(
  content: Array<{ type: string; text?: string; data?: unknown; mimeType?: string }>,
  toolName = "",
): RichBuildResult {
  const events: RichEvent[] = [];
  const anthropicContent: RichBuildResult["anthropicContent"] = [];
  const isPulseTool = PULSE_TOOLS.has(toolName);

  for (const block of content) {
    if (block.type === "image" && typeof block.data === "string") {
      const raw = typeof block.mimeType === "string" ? block.mimeType.toLowerCase() : "";
      const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
      const mimeType = ALLOWED.has(raw)
        ? raw
        : raw === "image/jpg"
          ? "image/jpeg"
          : "image/png";
      // Guard the payload before forwarding to Claude. A malformed, empty, or
      // oversized image (a high-res dashboard PNG can exceed Claude's ~5 MB
      // base64 limit) makes the Messages API reject the WHOLE turn with
      // 400 "Could not process image". Validate + size-cap; on failure keep a
      // text note so the agent degrades gracefully instead of erroring out.
      const b64 = block.data.trim();
      const CLAUDE_IMAGE_B64_MAX = 4_800_000; // ~5 MB decoded ceiling, with margin
      const isValidB64 = b64.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(b64);
      if (!isValidB64) {
        anthropicContent.push({
          type: "text",
          text: "[Image from tool was empty or unreadable — describe from the underlying data instead.]",
        });
        continue;
      }
      if (b64.length > CLAUDE_IMAGE_B64_MAX) {
        // Still surface it in the UI (the browser can render it), but don't send
        // the too-large payload to Claude — it would 400 the request.
        events.push({ type: "tool_image", mimeType, data: b64 });
        anthropicContent.push({
          type: "text",
          text: `[Image too large to analyze (${Math.round(b64.length / 1024)} KB base64, over the ${Math.round(CLAUDE_IMAGE_B64_MAX / 1024)} KB limit). Request a smaller/lower-resolution view, or answer from get-view-data / the metrics instead of the screenshot.]`,
        });
        continue;
      }
      events.push({ type: "tool_image", mimeType, data: b64 });
      anthropicContent.push({
        type: "image",
        source: { type: "base64", media_type: mimeType, data: b64 },
      });
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      // Extract Vega-Lite specs from Pulse tool JSON responses
      if (isPulseTool) {
        const specs = extractVegaSpecs(block.text, toolName);
        for (const { spec, title } of specs) {
          events.push({ type: "tool_vegaspec", spec, title });
        }
      }

      // For non-Pulse tools, try rendering as a table
      if (!isPulseTool) {
        const table = tryParseTable(block.text);
        if (table) {
          events.push({ type: "tool_table", columns: table.columns, rows: table.rows });
        }
      }

      const truncated = block.text.length > MAX_TOOL_RESULT_CHARS
        ? block.text.slice(0, MAX_TOOL_RESULT_CHARS) + `\n\n[TRUNCATED: ${block.text.length - MAX_TOOL_RESULT_CHARS} more chars]`
        : block.text;
      anthropicContent.push({ type: "text", text: truncated });
      continue;
    }
    const txt = JSON.stringify(block);
    const truncated = txt.length > MAX_TOOL_RESULT_CHARS
      ? txt.slice(0, MAX_TOOL_RESULT_CHARS) + "[TRUNCATED]"
      : txt;
    anthropicContent.push({ type: "text", text: truncated });
  }

  if (anthropicContent.length === 0) {
    anthropicContent.push({ type: "text", text: "(empty result)" });
  }

  return { events, anthropicContent };
}

function isVegaLikeSpec(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  // A Vega-Lite spec has at least a mark or layer/concat/hconcat/vconcat, plus data or encoding
  return (
    ("mark" in o || "layer" in o || "concat" in o || "hconcat" in o || "vconcat" in o) &&
    ("data" in o || "encoding" in o || "$schema" in o)
  );
}

function extractVegaSpecs(text: string, toolName: string): Array<{ spec: Record<string, unknown>; title?: string }> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return []; }
  const results: Array<{ spec: Record<string, unknown>; title?: string }> = [];

  const isBrief = toolName.includes("brief");

  if (isBrief) {
    // generate-pulse-insight-brief: response.source_insights[].viz
    const sourceInsights = getPath(parsed, ["source_insights"]);
    if (Array.isArray(sourceInsights)) {
      for (const insight of sourceInsights) {
        const viz = getPath(insight, ["viz"]);
        const question = getPath(insight, ["question"]);
        if (isVegaLikeSpec(viz)) {
          if (typeof question === "string") {
            results.push({ spec: viz, title: question });
          } else {
            results.push({ spec: viz });
          }
        }
      }
    }
  } else {
    // generate-pulse-metric-value-insight-bundle:
    // response.bundle_response.result.insight_groups[].insights[].result.viz
    // response.bundle_response.result.insight_groups[].summaries[].result.viz
    const groups = getPath(parsed, ["bundle_response", "result", "insight_groups"]);
    if (Array.isArray(groups)) {
      for (const group of groups) {
        const insights = getPath(group, ["insights"]);
        if (Array.isArray(insights)) {
          for (const insight of insights) {
            const viz = getPath(insight, ["result", "viz"]);
            const question = getPath(insight, ["result", "question"]) ?? getPath(insight, ["question"]);
            if (isVegaLikeSpec(viz)) {
              if (typeof question === "string") {
                results.push({ spec: viz, title: question });
              } else {
                results.push({ spec: viz });
              }
            }
          }
        }
        const summaries = getPath(group, ["summaries"]);
        if (Array.isArray(summaries)) {
          for (const summary of summaries) {
            const viz = getPath(summary, ["result", "viz"]);
            if (isVegaLikeSpec(viz)) {
              results.push({ spec: viz });
            }
          }
        }
      }
    }
  }

  return results;
}

function getPath(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const MAX_TABLE_ROWS = 200;

function tryParseTable(text: string): { columns: string[]; rows: string[][] } | null {
  const trimmed = text.trim();
  // Only attempt if it looks like a JSON array
  if (!trimmed.startsWith("[")) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const first = parsed[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) return null;

  const columns = Object.keys(first as Record<string, unknown>);
  if (columns.length === 0) return null;

  const rows: string[][] = (parsed as Array<Record<string, unknown>>)
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => columns.map((col) => String(row[col] ?? "")));

  return { columns, rows };
}

function previewToolResult(
  content: Array<{ type: string; text?: string; data?: unknown }>,
): string {
  const textBlocks = content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  const joined = textBlocks.join("\n");
  if (joined.length <= 400) return joined;
  return `${joined.slice(0, 380)}… (${joined.length - 380} more chars)`;
}

export type { McpToolDescriptor };
