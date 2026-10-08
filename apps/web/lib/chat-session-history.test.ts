import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory @vercel/kv so the AG-11 history store is testable without a real KV.
const { kvStore } = vi.hoisted(() => ({ kvStore: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => kvStore.get(k) ?? null,
    set: async (k: string, v: unknown) => {
      kvStore.set(k, v);
    },
    del: async (k: string) => {
      kvStore.delete(k);
    },
  },
}));

import { listChatSessions, getRenderedSession, saveRenderedSession } from "./chat-session";

const T = "tenant-a";
const E = "user@a.com";
const MSGS = [{ role: "user", content: "hi" }, { role: "assistant", content: "hello", richBlocks: [{ kind: "chart" }] }];
// Realistic timestamps — the store drops index entries older than the 7-day TTL.
const NOW = Date.now();

beforeEach(() => {
  kvStore.clear();
  process.env.KV_REST_API_URL = "https://kv.example";
  process.env.KV_REST_API_TOKEN = "token";
});

describe("chat session history (AG-11)", () => {
  it("saves + lists a session and restores its rendered messages (incl. rich blocks)", async () => {
    await saveRenderedSession(T, E, "s1", MSGS, "First question", NOW);
    const list = await listChatSessions(T, E);
    expect(list).toEqual([{ sessionId: "s1", title: "First question", updatedAt: NOW }]);
    expect(await getRenderedSession(T, E, "s1")).toEqual(MSGS);
  });

  it("orders newest-first and moves a re-saved session to the top", async () => {
    await saveRenderedSession(T, E, "s1", MSGS, "one", NOW + 1);
    await saveRenderedSession(T, E, "s2", MSGS, "two", NOW + 2);
    await saveRenderedSession(T, E, "s1", MSGS, "one again", NOW + 3);
    expect((await listChatSessions(T, E)).map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });

  it("caps the index at 20 sessions and evicts the dropped body", async () => {
    for (let i = 1; i <= 25; i++) await saveRenderedSession(T, E, `s${i}`, MSGS, `t${i}`, NOW + i);
    const list = await listChatSessions(T, E);
    expect(list).toHaveLength(20);
    expect(list[0]!.sessionId).toBe("s25"); // newest
    expect(list.some((s) => s.sessionId === "s1")).toBe(false); // oldest dropped
    // The evicted session's body is deleted, not left orphaned until TTL (FX-04).
    expect(await getRenderedSession(T, E, "s1")).toEqual([]);
  });

  it("drops index entries older than the 7-day TTL (FX-04)", async () => {
    await saveRenderedSession(T, E, "old", MSGS, "stale", NOW - 8 * 24 * 60 * 60 * 1000);
    expect(await listChatSessions(T, E)).toEqual([]);
  });

  it("skips an oversized session entirely (not listed, so it can't restore empty)", async () => {
    const huge = [{ role: "assistant", content: "x".repeat(1_000_001) }];
    await saveRenderedSession(T, E, "big", huge, "huge", NOW);
    expect(await listChatSessions(T, E)).toEqual([]); // neither indexed nor stored
    expect(await getRenderedSession(T, E, "big")).toEqual([]);
  });

  it("strips base64 image blocks to placeholders before storing (FX-04)", async () => {
    const withImage = [
      { role: "assistant", content: "chart", richBlocks: [{ kind: "image", mimeType: "image/png", data: "AAAA".repeat(100) }] },
    ];
    await saveRenderedSession(T, E, "img", withImage, "img", NOW);
    const restored = (await getRenderedSession(T, E, "img")) as Array<{ richBlocks: Array<{ data: string }> }>;
    expect(restored[0]!.richBlocks[0]!.data).toBe("");
  });

  it("blanks an unsafe export downloadUrl on restore, keeps relative/https (FX-04)", async () => {
    const msgs = [
      {
        role: "assistant",
        content: "export",
        richBlocks: [
          { kind: "export", event: { type: "campaign_csv", downloadUrl: "javascript:alert(1)" } },
          { kind: "export", event: { type: "campaign_csv", downloadUrl: "/api/download/x" } },
          { kind: "export", event: { type: "campaign_csv", downloadUrl: "https://cdn.example/x" } },
        ],
      },
    ];
    await saveRenderedSession(T, E, "exp", msgs, "exp", NOW);
    const restored = (await getRenderedSession(T, E, "exp")) as Array<{
      richBlocks: Array<{ event: { downloadUrl: string } }>;
    }>;
    const urls = restored[0]!.richBlocks.map((b) => b.event.downloadUrl);
    expect(urls).toEqual(["", "/api/download/x", "https://cdn.example/x"]);
  });

  it("isolates per tenant + user and returns [] for empty id/email", async () => {
    await saveRenderedSession(T, E, "s1", MSGS, "one", NOW);
    expect(await listChatSessions(T, "other@a.com")).toEqual([]);
    expect(await listChatSessions("tenant-b", E)).toEqual([]);
    expect(await getRenderedSession(T, E, undefined)).toEqual([]);
  });
});
