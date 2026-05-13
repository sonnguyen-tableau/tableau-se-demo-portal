import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { AGENT_TOOL_ALLOWLIST, isAgentToolAllowed } from "@portal/mcp-tools";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpToolDescriptor {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCallResult {
  isError: boolean;
  content: Array<{ type: string; text?: string; data?: unknown }>;
}

export interface TableauMcpSession {
  /** Allowlisted tools, in Anthropic-tool-shape ready to pass to the SDK. */
  tools: McpToolDescriptor[];
  /** Invoke a tool by name with JSON args. Throws on transport errors. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  /** Close the underlying transport. Always call (use try/finally). */
  close: () => Promise<void>;
}

interface OpenOptions {
  url: string;
  /** End-user identity propagated as `Tableau-User` for per-user RLS. */
  tableauUser: string;
  /** Service-account bearer token (PAT-derived) for the MCP sidecar itself. */
  serviceToken?: string;
  /** Optional request timeout in ms (default 30s). */
  timeoutMs?: number;
}

/**
 * Open an MCP session against the Tableau MCP HTTP sidecar. The session
 * forwards the end-user identity in a custom header so Tableau applies the
 * correct row-level security to every tool call.
 */
export async function openTableauMcp(opts: OpenOptions): Promise<TableauMcpSession> {
  const headers: Record<string, string> = {
    "Tableau-User": opts.tableauUser,
  };
  if (opts.serviceToken) headers.Authorization = `Bearer ${opts.serviceToken}`;

  const transport = new StreamableHTTPClientTransport(new URL(opts.url), {
    requestInit: { headers },
  });

  const client = new Client(
    { name: "tableau-ai-portal", version: "0.1.0" },
    { capabilities: {} },
  );

  // Library types mark transport-side fields as optional-but-required which
  // collides with our `exactOptionalPropertyTypes`. The runtime contract is
  // identical; cast through the named Transport interface.
  await client.connect(transport as unknown as Transport);

  const listed = await client.listTools();
  const tools: McpToolDescriptor[] = listed.tools
    .filter((t: Tool) => isAgentToolAllowed(t.name))
    .map((t: Tool) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: (t.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    }));

  return {
    tools,
    callTool: async (name, args) => {
      if (!isAgentToolAllowed(name)) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Tool '${name}' is not in the agent allowlist.` },
          ],
        };
      }
      const result = await client.callTool({ name, arguments: args });
      const content = Array.isArray(result.content)
        ? (result.content as Array<{ type: string; text?: string; data?: unknown }>)
        : [];
      return { isError: result.isError === true, content };
    },
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Convenience: returns the tool name list for the system prompt without
 * opening a full session. Useful when the chat route just needs to advertise
 * capability without making a network call.
 */
export function allowedToolNames(): readonly string[] {
  return AGENT_TOOL_ALLOWLIST;
}
