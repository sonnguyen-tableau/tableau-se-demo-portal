import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

const ctx = {
  tenantId: "tenant-acme",
  tenantName: "Acme",
  region: "EMEA" as const,
  groups: ["tenant-acme"],
  isInternal: false,
};

describe("buildSystemPrompt", () => {
  it("includes tenant context and tool list", () => {
    const s = buildSystemPrompt({
      tenant: ctx,
      toolNames: ["query-datasource", "get-datasource-metadata"],
    });
    expect(s).toContain("Acme");
    expect(s).toContain("tenant-acme");
    expect(s).toContain("EMEA");
    expect(s).toContain("get-datasource-metadata");
    expect(s).toContain("query-datasource");
  });

  it("omits the viz block when no vizContext is passed", () => {
    const s = buildSystemPrompt({ tenant: ctx, toolNames: [] });
    expect(s).not.toContain("currently viewing");
  });

  it("renders viz filters and selected marks when present", () => {
    const s = buildSystemPrompt({
      tenant: ctx,
      toolNames: ["query-datasource"],
      viz: {
        workbook: "Sales",
        activeSheet: "Regional",
        filters: [{ field: "Region", values: ["EMEA"] }],
        selectedMarks: [{ Country: "DE" }],
      },
    });
    expect(s).toContain("workbook: Sales");
    expect(s).toContain("Region in [EMEA]");
    expect(s).toContain("Country=DE");
  });

  it("warns about the grounding workflow", () => {
    const s = buildSystemPrompt({ tenant: ctx, toolNames: ["query-datasource"] });
    expect(s).toContain("get-datasource-metadata");
    expect(s).toContain("hallucinations");
  });

  it("omits the Salesforce advisory block by default", () => {
    const s = buildSystemPrompt({ tenant: ctx, toolNames: ["query-datasource"] });
    expect(s).not.toContain("Salesforce action advisory");
  });

  it("includes the Salesforce advisory block when enabled", () => {
    const s = buildSystemPrompt({
      tenant: ctx,
      toolNames: ["query-datasource"],
      salesforceAdvisory: true,
    });
    expect(s).toContain("Salesforce action advisory");
    expect(s).toContain("Data Cloud");
    expect(s).toContain("Agentforce");
    // Only recommends on how-to-improve questions, not factual ones.
    expect(s).toContain("recommendations, next steps");
  });
});
