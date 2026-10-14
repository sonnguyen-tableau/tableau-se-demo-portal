import { describe, expect, it } from "vitest";
import { wrapMcpWithCatalogFilter } from "./mcp-catalog-guard";
import type { TableauMcpSession, ToolCallResult } from "./mcp-client";

function fakeSession(response: unknown): TableauMcpSession {
  return {
    tools: [],
    callTool: async (): Promise<ToolCallResult> => ({
      isError: false,
      content: [{ type: "text", text: JSON.stringify(response) }],
    }),
    close: async () => {},
  };
}

async function callAndParse(
  session: TableauMcpSession,
  name: string,
): Promise<unknown[]> {
  const result = await session.callTool(name, {});
  return JSON.parse(result.content[0]!.text!);
}

describe("mcp-catalog-guard", () => {
  it("passes through unchanged when the tenant has no allowedProjects", async () => {
    const raw = fakeSession([{ id: "a", project: { name: "Other" } }]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: [],
      allowedWorkbookIds: new Set(),
    });
    const items = await callAndParse(wrapped, "list-workbooks");
    expect(items.length).toBe(1);
  });

  it("filters list-workbooks by allowedWorkbookIds", async () => {
    const raw = fakeSession([
      { id: "keep-me", project: { name: "ACB Cards" } },
      { id: "drop-me", project: { name: "DOJI" } },
    ]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(["keep-me"]),
    });
    const items = await callAndParse(wrapped, "list-workbooks");
    expect(items).toEqual([{ id: "keep-me", project: { name: "ACB Cards" } }]);
  });

  it("allows a workbook with no project info through (fail-open, by design)", async () => {
    // Items with neither a matching id NOR any project/containerName field
    // fall through to the intentional "no project info — allow through"
    // fallback (documented in isItemAllowed) rather than being silently
    // dropped, which would otherwise break the agent for tools that omit
    // project metadata entirely.
    const raw = fakeSession([{ id: "unknown-shape" }]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(),
    });
    const items = await callAndParse(wrapped, "list-workbooks");
    expect(items).toEqual([{ id: "unknown-shape" }]);
  });

  it("filters list-datasources/generic items via item.project.name", async () => {
    const raw = fakeSession([
      { id: "1", project: { name: "ACB Cards" } },
      { id: "2", project: { name: "DOJI" } },
    ]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(),
    });
    const items = await callAndParse(wrapped, "list-datasources");
    expect(items).toEqual([{ id: "1", project: { name: "ACB Cards" } }]);
  });

  it("REGRESSION: filters search-content results via containerName, not project.name", async () => {
    // Real search-content responses carry the project/folder as `containerName`
    // — item.project and item.projectName never populate for this tool. Before
    // the fix, every search-content row fell through to the "no project info"
    // allow-through fallback, leaking cross-tenant content (a live DOJI
    // workbook surfaced inside the acb-cards tenant's chat).
    const raw = fakeSession([
      { type: "workbook", title: "ACB - Kich hoat the v2", containerName: "ACB Cards" },
      { type: "workbook", title: "4 - DOJI Theo doi KPI", containerName: "DOJI" },
    ]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(),
    });
    const items = (await callAndParse(wrapped, "search-content")) as { title: string }[];
    expect(items.map((i) => i.title)).toEqual(["ACB - Kich hoat the v2"]);
  });

  it("matches allowedProjects by leaf segment too (e.g. 'Demo/ACB Cards' matches 'ACB Cards')", async () => {
    const raw = fakeSession([
      { type: "workbook", title: "In scope", containerName: "ACB Cards" },
      { type: "workbook", title: "Out of scope", containerName: "DOJI" },
    ]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["Demo/ACB Cards"],
      allowedWorkbookIds: new Set(),
    });
    const items = (await callAndParse(wrapped, "search-content")) as { title: string }[];
    expect(items.map((i) => i.title)).toEqual(["In scope"]);
  });

  it("FX-06: rejects a hidden workbook that sits in an allowed project (list-workbooks id-enforced)", async () => {
    // Both are in the allowed project, but only "visible" is in the user's
    // visible set — the hidden one must NOT slip through the project fallback.
    const raw = fakeSession([
      { id: "visible", project: { name: "ACB Cards" } },
      { id: "hidden", project: { name: "ACB Cards" } },
    ]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(["visible"]),
    });
    const items = (await callAndParse(wrapped, "list-workbooks")) as { id: string }[];
    expect(items.map((i) => i.id)).toEqual(["visible"]);
  });

  it("FX-06: rejects a list-views item whose parent workbook is hidden", async () => {
    const raw = fakeSession([
      { id: "v1", workbook: { id: "visible" }, project: { name: "ACB Cards" } },
      { id: "v2", workbook: { id: "hidden" }, project: { name: "ACB Cards" } },
    ]);
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(["visible"]),
    });
    const items = (await callAndParse(wrapped, "list-views")) as { id: string }[];
    expect(items.map((i) => i.id)).toEqual(["v1"]);
  });

  it("leaves non-list tool calls untouched", async () => {
    const raw = fakeSession({ ok: true });
    const wrapped = wrapMcpWithCatalogFilter(raw, {
      allowedProjectNames: ["ACB Cards"],
      allowedWorkbookIds: new Set(),
    });
    const result = await wrapped.callTool("query-datasource", {});
    expect(JSON.parse(result.content[0]!.text!)).toEqual({ ok: true });
  });
});
