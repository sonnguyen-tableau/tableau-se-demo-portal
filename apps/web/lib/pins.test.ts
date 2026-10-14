import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for data/pins.json so the file-fallback path doesn't touch disk.
const { store, readFileMock, writeFileMock, mkdirMock } = vi.hoisted(() => {
  const store = { json: "" };
  return {
    store,
    readFileMock: vi.fn(async () => {
      if (!store.json) throw new Error("ENOENT");
      return store.json;
    }),
    writeFileMock: vi.fn(async (_path: string, data: string) => {
      store.json = data;
    }),
    mkdirMock: vi.fn(async () => undefined),
  };
});
vi.mock("fs/promises", () => ({ readFile: readFileMock, writeFile: writeFileMock, mkdir: mkdirMock }));

import { addPin, getPins, removePin, MAX_PINS, type PinnedItem } from "./pins";

function item(key: string, pinnedAt: number): PinnedItem {
  return {
    key,
    kind: "view",
    workbookSlug: "wb",
    viewSlug: key,
    title: key,
    workbookName: "WB",
    projectName: "P",
    pinnedAt,
  };
}

const T = "tenant-a";
const E = "user@a.com";

beforeEach(() => {
  store.json = "";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("pins store", () => {
  it("adds and lists newest-first", async () => {
    await addPin(T, E, item("a", 1));
    await addPin(T, E, item("b", 2));
    expect((await getPins(T, E)).map((p) => p.key)).toEqual(["b", "a"]);
  });

  it("is idempotent on key and moves an existing pin to the top", async () => {
    await addPin(T, E, item("a", 1));
    await addPin(T, E, item("b", 2));
    await addPin(T, E, item("a", 3));
    const pins = await getPins(T, E);
    expect(pins.map((p) => p.key)).toEqual(["a", "b"]);
    expect(pins).toHaveLength(2);
  });

  it(`caps at ${MAX_PINS}, dropping the oldest`, async () => {
    for (let i = 1; i <= MAX_PINS + 1; i++) await addPin(T, E, item(`k${i}`, i));
    const pins = await getPins(T, E);
    expect(pins).toHaveLength(MAX_PINS);
    expect(pins.some((p) => p.key === "k1")).toBe(false); // oldest dropped
    expect(pins[0]!.key).toBe(`k${MAX_PINS + 1}`); // newest first
  });

  it("removes by key", async () => {
    await addPin(T, E, item("a", 1));
    await addPin(T, E, item("b", 2));
    await removePin(T, E, "a");
    expect((await getPins(T, E)).map((p) => p.key)).toEqual(["b"]);
  });

  it("isolates pins per tenant+user and returns [] for empty email", async () => {
    await addPin(T, E, item("a", 1));
    expect(await getPins(T, "other@a.com")).toEqual([]);
    expect(await getPins("tenant-b", E)).toEqual([]);
    expect(await getPins(T, "")).toEqual([]);
  });
});
