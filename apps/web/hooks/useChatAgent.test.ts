import { describe, expect, it } from "vitest";
import { applyEvent, type ChatMessage } from "./useChatAgent";

describe("applyEvent — followups (AG-09)", () => {
  it("attaches followups to the latest assistant message", () => {
    const start: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "answer" },
    ];
    const out = applyEvent(start, { type: "followups", items: ["q1", "q2"] });
    expect(out.at(-1)).toMatchObject({ role: "assistant", content: "answer", followups: ["q1", "q2"] });
  });

  it("creates an assistant message when the last is a user message", () => {
    const out = applyEvent([{ role: "user", content: "hi" }], { type: "followups", items: ["a"] });
    expect(out.at(-1)).toMatchObject({ role: "assistant", followups: ["a"] });
  });

  it("attaches a sources footer to the latest assistant message (AG-08)", () => {
    const start: ChatMessage[] = [{ role: "assistant", content: "answer" }];
    const out = applyEvent(start, {
      type: "sources",
      datasources: ["Retail Banking DS"],
      queryCount: 3,
      syntheticData: true,
      queries: ['{"q":1}'],
    });
    expect(out.at(-1)!.sources).toEqual({
      datasources: ["Retail Banking DS"],
      queryCount: 3,
      syntheticData: true,
      queries: ['{"q":1}'],
    });
  });

  it("text_delta appends; done/open are no-ops", () => {
    const afterDelta = applyEvent([{ role: "assistant", content: "" }], { type: "text_delta", delta: "Hello" });
    expect(afterDelta.at(-1)!.content).toBe("Hello");
    expect(applyEvent(afterDelta, { type: "done" })).toBe(afterDelta);
    expect(applyEvent(afterDelta, { type: "open", tools: [] })).toBe(afterDelta);
  });
});
