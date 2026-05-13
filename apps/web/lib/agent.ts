import Anthropic from "@anthropic-ai/sdk";
import type { TableauMcpSession, McpToolDescriptor } from "./mcp-client";
import { VIZ_TOOLS, isVizToolName } from "./viz-tools";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 6;

export type AgentEvent =
  | { type: "system"; message: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; preview: string }
  | { type: "viz_action"; id: string; name: string; input: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { input_tokens?: number; output_tokens?: number } };

export interface AgentTurnInput {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userMessage: string;
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

  const messages: Anthropic.MessageParam[] = [
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
    if (tools.length > 0) {
      baseParams.tools = tools as unknown as Anthropic.Tool[];
    }
    const stream = anthropic.messages.stream(baseParams);

    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text_delta", delta: event.delta.text };
        }
      }
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : "stream error",
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
        const text = previewToolResult(result.content);
        yield { type: "tool_result", id: call.id, ok: !result.isError, preview: text };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: result.isError,
          content: result.content.map((c) =>
            c.type === "text"
              ? { type: "text" as const, text: c.text ?? "" }
              : { type: "text" as const, text: JSON.stringify(c) },
          ),
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
