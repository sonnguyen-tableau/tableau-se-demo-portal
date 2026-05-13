import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_ALLOWLIST,
  ALL_TABLEAU_MCP_TOOLS,
  isAgentToolAllowed,
} from "./allowlist";

describe("agent tool allowlist", () => {
  it("only contains known Tableau MCP tools", () => {
    const known = new Set<string>(ALL_TABLEAU_MCP_TOOLS);
    for (const t of AGENT_TOOL_ALLOWLIST) expect(known.has(t)).toBe(true);
  });

  it("excludes privacy-sensitive tools by default", () => {
    expect(AGENT_TOOL_ALLOWLIST).not.toContain("list-pulse-metric-subscriptions");
  });

  it("isAgentToolAllowed reflects allowlist membership", () => {
    expect(isAgentToolAllowed("query-datasource")).toBe(true);
    expect(isAgentToolAllowed("list-pulse-metric-subscriptions")).toBe(false);
    expect(isAgentToolAllowed("unknown-tool")).toBe(false);
  });
});
