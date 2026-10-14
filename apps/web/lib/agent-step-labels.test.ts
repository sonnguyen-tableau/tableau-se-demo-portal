import { describe, expect, it } from "vitest";
import { stepLabel, stepLabelKey } from "./agent-step-labels";

describe("agent-step-labels", () => {
  it("maps known tools to their step keys", () => {
    expect(stepLabelKey("query-datasource")).toBe("step.query");
    expect(stepLabelKey("get-datasource-metadata")).toBe("step.readModel");
    expect(stepLabelKey("get-view-image")).toBe("step.capture");
    expect(stepLabelKey("list-views")).toBe("step.findSources");
    expect(stepLabelKey("viz_applyFilter")).toBe("step.filter");
    expect(stepLabelKey("viz_clearFilter")).toBe("step.filter");
    expect(stepLabelKey("viz_switchTab")).toBe("step.switchTab");
  });

  it("maps tool families by prefix", () => {
    expect(stepLabelKey("list-pulse-metrics")).toBe("step.findPulse");
    expect(stepLabelKey("generate-pulse-insight")).toBe("step.genPulse");
    expect(stepLabelKey("campaign_exportSegment")).toBe("step.buildList");
    expect(stepLabelKey("card_activation")).toBe("step.buildList");
    expect(stepLabelKey("carrier_report")).toBe("step.analyze");
    expect(stepLabelKey("mm_dossier")).toBe("step.analyze");
  });

  it("falls back to step.unknown for unrecognized tools", () => {
    expect(stepLabelKey("some-new-tool")).toBe("step.unknown");
  });

  it("returns localized labels", () => {
    expect(stepLabel("query-datasource", "vi")).toBe("Truy vấn dữ liệu");
    expect(stepLabel("query-datasource", "en")).toBe("Querying data");
    expect(stepLabel("nope-unknown", "vi")).toBe("Đang xử lý");
  });
});
