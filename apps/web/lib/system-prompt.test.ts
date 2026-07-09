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
    // Grounding guard: the agent must not fabricate data.
    expect(s).toContain("never invent");
  });

  it("omits any advisory block by default", () => {
    const s = buildSystemPrompt({ tenant: ctx, toolNames: ["query-datasource"] });
    expect(s).not.toContain("Salesforce action advisory");
    expect(s).not.toContain("SHB campaign & product advisory");
    expect(s).not.toContain("Retail action advisory");
  });

  it("includes the Salesforce advisory block for advisory: salesforce", () => {
    const s = buildSystemPrompt({
      tenant: ctx,
      toolNames: ["query-datasource"],
      advisory: "salesforce",
    });
    expect(s).toContain("Salesforce action advisory");
    expect(s).toContain("Data Cloud");
    expect(s).toContain("Agentforce");
    // Only recommends on how-to-improve questions, not factual ones.
    expect(s).toContain("recommendations, next steps");
    // The Salesforce mode must NOT carry the SHB banking block.
    expect(s).not.toContain("SHB campaign & product advisory");
  });

  it("recommends SHB banking products (not Salesforce) for advisory: shb-products", () => {
    const s = buildSystemPrompt({
      tenant: ctx,
      toolNames: ["query-datasource"],
      advisory: "shb-products",
    });
    expect(s).toContain("SHB campaign & product advisory");
    // SHB's own products must be the headline plays.
    expect(s).toContain("Vay vốn lưu động");
    expect(s).toContain("Tài trợ thương mại");
    expect(s).toContain("Bảo lãnh ngân hàng");
    // Salesforce is only the optional execution channel here, not the headline.
    expect(s).toContain("OPTIONAL and secondary");
    // It must not switch on the meygroup Salesforce-first block.
    expect(s).not.toContain("Salesforce action advisory");
  });

  it("recommends retail plays (not Salesforce) for advisory: retail-actions", () => {
    const s = buildSystemPrompt({
      tenant: ctx,
      toolNames: ["query-datasource"],
      advisory: "retail-actions",
    });
    expect(s).toContain("Retail action advisory");
    // Retail plays must be the headline.
    expect(s).toContain("win-back");
    expect(s).toContain("NextBestOffer");
    expect(s).toContain("OOS");
    // Salesforce is only the optional execution channel here, not the headline.
    expect(s).toContain("OPTIONAL and secondary");
    // It must not switch on the other tenants' blocks.
    expect(s).not.toContain("Salesforce action advisory");
    expect(s).not.toContain("SHB campaign & product advisory");
  });
});
