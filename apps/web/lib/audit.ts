/**
 * Structured audit logger. Emits one JSON line per significant event so the
 * stream can be ingested by Datadog / Better Stack / a SIEM without parsing
 * unstructured text. PII redaction is the caller's responsibility — never
 * pass raw JWTs, secret values, or full user message bodies here.
 */

import { createHash } from "node:crypto";

export type AuditEvent =
  | {
      kind: "jwt.mint";
      userId: string;
      tenantId: string;
      scopes: string[];
      impressionsUsed: number;
      impressionsCap: number;
    }
  | {
      kind: "jwt.budget_blocked";
      userId: string;
      tenantId: string;
      impressionsUsed: number;
      impressionsCap: number;
    }
  | {
      kind: "chat.start";
      userId: string;
      tenantId: string;
      messageHash: string;
      messageLength: number;
      hasVizContext: boolean;
    }
  | {
      kind: "chat.rate_limited";
      userId: string;
      tenantId: string;
      windowSeconds: number;
      maxRequests: number;
    }
  | {
      kind: "chat.mcp_open";
      userId: string;
      tenantId: string;
      toolCount: number;
    }
  | {
      kind: "chat.tool_use";
      userId: string;
      tenantId: string;
      tool: string;
      argsHash: string;
    }
  | {
      kind: "chat.tool_result";
      userId: string;
      tenantId: string;
      tool: string;
      ok: boolean;
      latencyMs: number;
    }
  | {
      kind: "chat.viz_action";
      userId: string;
      tenantId: string;
      action: string;
    }
  | {
      kind: "chat.done";
      userId: string;
      tenantId: string;
      inputTokens?: number;
      outputTokens?: number;
      totalLatencyMs: number;
    }
  | {
      kind: "chat.error";
      userId: string;
      tenantId: string;
      message: string;
    }
  | {
      kind: "chat.abort";
      userId: string;
      tenantId: string;
    }
  | {
      kind: "chat.feedback";
      userId: string;
      tenantId: string;
      rating: "up" | "down";
      chatSessionId: string;
      messageIndex: number;
      // No free-text `comment` here — untrusted user text is stored on a separate
      // sink (chat.feedback_comment), per the audit.ts PII rule above (FX-04).
    };

function emit(event: AuditEvent): void {
  const line = {
    ts: new Date().toISOString(),
    ...event,
  };
  // Use stderr so it doesn't interleave with response bodies in dev tooling.
  console.warn(JSON.stringify(line));
}

export const audit = { emit };

/** SHA-256 prefix (first 16 hex chars) — enough to dedupe in logs, not enough to recover content. */
export function shortHash(input: string | object): string {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
