import type { TableauMcpSession, ToolCallResult } from "@/lib/mcp-client";

/**
 * List tools whose JSON array responses are filtered to remove items outside
 * the tenant's allowed project scope. By stripping disallowed IDs here, the
 * LLM never receives identifiers it shouldn't use — making the filter hard
 * rather than advisory.
 */
const LIST_TOOLS = new Set([
  "list-workbooks",
  "list-views",
  "list-datasources",
  "search-content",
]);

export interface CatalogGuardOptions {
  /** Raw allowedProjects strings from TenantRecord (e.g. ["Demo/Retail", "Gaming"]). */
  allowedProjectNames: string[];
  /** Workbook UUIDs from getLiveCatalog() filtered to the tenant's allowed projects. */
  allowedWorkbookIds: Set<string>;
}

/**
 * Wraps an MCP session to enforce tenant catalog scope at the tool-response
 * level. When the LLM calls list-workbooks / list-views / list-datasources /
 * search-content, we parse the JSON array response and strip out items that
 * don't belong to the tenant's allowed projects. The LLM therefore only ever
 * sees — and can reference — IDs within the permitted scope.
 *
 * If allowedProjectNames is empty the original session is returned unchanged.
 */
export function wrapMcpWithCatalogFilter(
  session: TableauMcpSession,
  { allowedProjectNames, allowedWorkbookIds }: CatalogGuardOptions,
): TableauMcpSession {
  if (allowedProjectNames.length === 0) return session;

  // Build a flat set of lowercase tokens to match against project names.
  // "Demo/Retail" → {"demo/retail", "retail"} so we match both full path and leaf.
  const allowedTokens = new Set(
    allowedProjectNames.flatMap((p) => {
      const lower = p.toLowerCase().trim();
      const segments = lower.split("/");
      return [lower, segments[segments.length - 1]];
    }),
  );

  function isItemAllowed(item: Record<string, unknown>): boolean {
    // list-workbooks: item.id is the workbook UUID
    if (typeof item.id === "string" && allowedWorkbookIds.has(item.id)) return true;

    // list-views: item.workbook.id is the parent workbook UUID
    const wb = item.workbook as Record<string, unknown> | undefined;
    if (wb && typeof wb.id === "string" && allowedWorkbookIds.has(wb.id)) return true;

    // list-datasources / search-content: match via project name
    const project = item.project as Record<string, unknown> | undefined;
    const projectName =
      typeof project?.name === "string"
        ? project.name.toLowerCase().trim()
        : typeof item.projectName === "string"
          ? item.projectName.toLowerCase().trim()
          : null;

    if (projectName !== null) return allowedTokens.has(projectName);

    // No project info — allow through so the agent isn't silently broken
    return true;
  }

  function filterContent(
    content: ToolCallResult["content"],
  ): ToolCallResult["content"] {
    return content.map((block) => {
      if (block.type !== "text" || typeof block.text !== "string") return block;
      let parsed: unknown;
      try {
        parsed = JSON.parse(block.text);
      } catch {
        return block; // not JSON — pass through
      }
      if (!Array.isArray(parsed)) return block;

      const filtered = (parsed as unknown[]).filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && isItemAllowed(item as Record<string, unknown>),
      );
      return { ...block, text: JSON.stringify(filtered) };
    });
  }

  return {
    ...session,
    callTool: async (name, args) => {
      const result = await session.callTool(name, args);
      if (!LIST_TOOLS.has(name)) return result;
      return { ...result, content: filterContent(result.content) };
    },
  };
}
