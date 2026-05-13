import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";
import { buildSystemPrompt, type VizContext } from "@/lib/system-prompt";
import { runAgentTurn, type AgentEvent } from "@/lib/agent";
import { allowedToolNames, openTableauMcp } from "@/lib/mcp-client";
import { audit, shortHash } from "@/lib/audit";
import { checkAndRecord } from "@/lib/rate-limit";

const CHAT_RATE_LIMIT = { windowSeconds: 60, max: 12 } as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vizContextSchema = z
  .object({
    workbook: z.string().max(200).optional(),
    activeSheet: z.string().max(200).optional(),
    filters: z
      .array(z.object({ field: z.string().max(120), values: z.array(z.string().max(200)).max(50) }))
      .max(20)
      .optional(),
    selectedMarks: z.array(z.record(z.string().max(120), z.string().max(200))).max(20).optional(),
  })
  .optional();

const requestSchema = z.object({
  message: z.string().min(1).max(8000),
  vizContext: vizContextSchema,
});

function sseLine(event: AgentEvent | { type: "open"; tools: readonly string[] }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx || !session?.user?.email) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_request", issues: parsed.error.issues }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return new Response(
      sseLine({
        type: "error",
        message: "ANTHROPIC_API_KEY is not configured. The chat agent is disabled.",
      }) + sseLine({ type: "done" }),
      { status: 200, headers: sseHeaders() },
    );
  }

  const rl = await checkAndRecord(`chat:${ctx.tenantId}:${session.user.email}`, CHAT_RATE_LIMIT);
  if (!rl.allowed) {
    audit.emit({
      kind: "chat.rate_limited",
      userId: session.user.email,
      tenantId: ctx.tenantId,
      windowSeconds: CHAT_RATE_LIMIT.windowSeconds,
      maxRequests: CHAT_RATE_LIMIT.max,
    });
    return new Response(
      sseLine({
        type: "error",
        message: `Too many chat requests — try again in ${rl.retryAfterSeconds}s.`,
      }) + sseLine({ type: "done" }),
      {
        status: 200,
        headers: { ...Object.fromEntries(sseHeaders().entries()), "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  audit.emit({
    kind: "chat.start",
    userId: session.user.email,
    tenantId: ctx.tenantId,
    messageHash: shortHash(parsed.data.message),
    messageLength: parsed.data.message.length,
    hasVizContext: !!parsed.data.vizContext,
  });
  const startedAt = Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent | { type: "open"; tools: readonly string[] }): void => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      const userEmail = session.user.email as string;
      const userId = userEmail;
      const tenantId = ctx.tenantId;
      let mcp: Awaited<ReturnType<typeof openTableauMcp>> | undefined;
      let lastUsage: { input_tokens?: number; output_tokens?: number } | undefined;
      const toolInFlight = new Map<string, { name: string; startedAt: number }>();
      try {
        if (env.TABLEAU_MCP_URL) {
          try {
            mcp = await openTableauMcp({
              url: env.TABLEAU_MCP_URL,
              tableauUser: userEmail,
            });
            send({ type: "open", tools: mcp.tools.map((t) => t.name) });
            audit.emit({
              kind: "chat.mcp_open",
              userId,
              tenantId,
              toolCount: mcp.tools.length,
            });
          } catch (e) {
            send({
              type: "system",
              message:
                "Tableau MCP sidecar unavailable; running with general knowledge only. " +
                (e instanceof Error ? e.message : "unknown error"),
            });
          }
        } else {
          send({ type: "open", tools: [] });
        }

        const systemPrompt = buildSystemPrompt({
          tenant: ctx,
          ...(parsed.data.vizContext ? { viz: parsed.data.vizContext as VizContext } : {}),
          toolNames: mcp ? mcp.tools.map((t) => t.name) : allowedToolNames(),
        });

        for await (const event of runAgentTurn({
          apiKey: anthropicKey,
          systemPrompt,
          userMessage: parsed.data.message,
          enableVizTools: true,
          ...(mcp ? { mcp } : {}),
        })) {
          send(event);
          if (event.type === "tool_use") {
            toolInFlight.set(event.id, { name: event.name, startedAt: Date.now() });
            audit.emit({
              kind: "chat.tool_use",
              userId,
              tenantId,
              tool: event.name,
              argsHash: shortHash(event.input),
            });
          } else if (event.type === "tool_result") {
            const in_flight = toolInFlight.get(event.id);
            const latencyMs = in_flight ? Date.now() - in_flight.startedAt : 0;
            audit.emit({
              kind: "chat.tool_result",
              userId,
              tenantId,
              tool: in_flight?.name ?? "(unknown)",
              ok: event.ok,
              latencyMs,
            });
            toolInFlight.delete(event.id);
          } else if (event.type === "viz_action") {
            audit.emit({
              kind: "chat.viz_action",
              userId,
              tenantId,
              action: event.name,
            });
          } else if (event.type === "done") {
            lastUsage = event.usage;
          } else if (event.type === "error") {
            audit.emit({
              kind: "chat.error",
              userId,
              tenantId,
              message: event.message.slice(0, 200),
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "agent error";
        send({ type: "error", message: msg });
        send({ type: "done" });
        audit.emit({
          kind: "chat.error",
          userId,
          tenantId,
          message: msg.slice(0, 200),
        });
      } finally {
        if (mcp) {
          try {
            await mcp.close();
          } catch {
            // ignore
          }
        }
        audit.emit({
          kind: "chat.done",
          userId,
          tenantId,
          ...(lastUsage?.input_tokens !== undefined ? { inputTokens: lastUsage.input_tokens } : {}),
          ...(lastUsage?.output_tokens !== undefined ? { outputTokens: lastUsage.output_tokens } : {}),
          totalLatencyMs: Date.now() - startedAt,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}

function sseHeaders(): Headers {
  const h = new Headers();
  h.set("Content-Type", "text/event-stream");
  h.set("Cache-Control", "private, no-store, no-transform");
  h.set("Connection", "keep-alive");
  h.set("X-Accel-Buffering", "no");
  return h;
}
