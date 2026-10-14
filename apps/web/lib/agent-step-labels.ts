import { translator, type Locale, type MessageKey } from "@/lib/i18n-shared";

/**
 * Map a raw MCP / pseudo-tool name to a friendly, localized step label
 * (DESIGN v2 §5.2). Unknown tools fall back to `step.unknown` so the UI never
 * leaks a raw tool name to end users. Keep in sync with the `step.*` i18n keys.
 */
export function stepLabelKey(toolName: string): MessageKey {
  const n = toolName;
  if (
    n === "list-datasources" ||
    n === "list-workbooks" ||
    n === "list-views" ||
    n === "search-content"
  ) {
    return "step.findSources";
  }
  if (n === "get-datasource-metadata") return "step.readModel";
  if (n === "query-datasource") return "step.query";
  if (n === "get-view-image") return "step.capture";
  if (n.startsWith("list-pulse")) return "step.findPulse";
  if (n.startsWith("generate-pulse")) return "step.genPulse";
  if (n === "viz_drawChart") return "step.drawChart";
  if (n === "viz_showPulseCard") return "step.showPulse";
  if (n === "viz_applyFilter" || n === "viz_clearFilter") return "step.filter";
  if (n === "viz_selectMarks" || n === "viz_clearSelectedMarks") return "step.highlight";
  if (n === "viz_switchTab") return "step.switchTab";
  if (n === "viz_setParameter") return "step.setParam";
  if (n.startsWith("campaign_") || n.startsWith("card_")) return "step.buildList";
  if (n.startsWith("carrier_") || n.startsWith("mm_")) return "step.analyze";
  return "step.unknown";
}

/** The localized friendly label for a tool name. */
export function stepLabel(toolName: string, locale: Locale): string {
  return translator(locale)(stepLabelKey(toolName));
}
