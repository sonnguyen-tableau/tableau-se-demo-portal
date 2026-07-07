import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { trimTranscript } from "./chat-session";

type M = Anthropic.MessageParam;

const userTurn = (text: string): M => ({ role: "user", content: text });
const assistantText = (text: string): M => ({ role: "assistant", content: text });
const assistantToolUse = (id: string): M => ({
  role: "assistant",
  content: [{ type: "tool_use", id, name: "query-datasource", input: {} }],
});
const toolResultText = (id: string, text: string): M => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }],
});
const toolResultImage = (id: string): M => ({
  role: "user",
  content: [
    {
      type: "tool_result",
      tool_use_id: id,
      content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }],
    },
  ],
});

describe("trimTranscript", () => {
  it("keeps a short transcript intact (minus images)", () => {
    const msgs: M[] = [userTurn("hi"), assistantText("hello")];
    expect(trimTranscript(msgs)).toEqual(msgs);
  });

  it("replaces base64 images in tool_result with a text placeholder", () => {
    const msgs: M[] = [
      userTurn("show me the chart"),
      assistantToolUse("t1"),
      toolResultImage("t1"),
      assistantText("here is the trend"),
    ];
    const out = trimTranscript(msgs);
    const tr = out[2] as M & { content: Array<{ content: Array<{ type: string; text?: string }> }> };
    const inner = tr.content[0]!.content[0]!;
    expect(inner.type).toBe("text");
    expect(inner.text).toContain("image omitted");
    // The data table / text results and tool_use pairing are preserved.
    expect(out).toHaveLength(4);
  });

  it("preserves tool text results verbatim", () => {
    const msgs: M[] = [
      userTurn("funnel numbers?"),
      assistantToolUse("t1"),
      toolResultText("t1", "Lead,1007\nDeal,9"),
      assistantText("digital is weak"),
    ];
    const out = trimTranscript(msgs);
    const tr = out[2] as M & { content: Array<{ content: Array<{ text: string }> }> };
    expect(tr.content[0]!.content[0]!.text).toBe("Lead,1007\nDeal,9");
  });

  it("never splits a tool_use / tool_result pair when capping length", () => {
    // Build 40 exchanges, each: user, assistant(tool_use), tool_result, assistant(text)
    const msgs: M[] = [];
    for (let i = 0; i < 40; i++) {
      msgs.push(userTurn(`q${i}`), assistantToolUse(`t${i}`), toolResultText(`t${i}`, `r${i}`), assistantText(`a${i}`));
    }
    const out = trimTranscript(msgs);
    // Must start at a genuine user turn (string content), not mid-exchange.
    expect(out[0]!.role).toBe("user");
    expect(typeof out[0]!.content).toBe("string");
    // Every tool_result must have a preceding tool_use with the same id present.
    const toolUseIds = new Set<string>();
    for (const m of out) {
      if (m.role === "assistant" && Array.isArray(m.content)) {
        for (const b of m.content) if ((b as { type: string }).type === "tool_use") toolUseIds.add((b as { id: string }).id);
      }
      if (m.role === "user" && Array.isArray(m.content)) {
        for (const b of m.content) {
          const tr = b as { type: string; tool_use_id?: string };
          if (tr.type === "tool_result") expect(toolUseIds.has(tr.tool_use_id!)).toBe(true);
        }
      }
    }
  });
});
