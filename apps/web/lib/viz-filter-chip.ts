type AnyRecord = Record<string, unknown>;

/**
 * Reduce an Embedding-API Filter object to a display chip, or null when it
 * shouldn't show one (FX-09): a categorical filter with everything selected or
 * no applied values carries no state. Range / quantitative / date filters
 * render as `min – max` instead of a value list.
 *
 * Pure (no React / SDK) so it can be unit-tested; consumed by TableauVizShell's
 * filterchanged handler and firstinteractive chip seeding.
 */
export function filterToChip(filter: AnyRecord): { field: string; values: string[] } | null {
  const field = String(filter["fieldName"] ?? "");
  if (!field) return null;
  const type = String(filter["filterType"] ?? "").toLowerCase();
  const fmt = (v: unknown): string => {
    const o = v as AnyRecord | undefined;
    return o ? String(o["formattedValue"] ?? o["value"] ?? "") : "";
  };
  if (type === "quantitative" || type === "range" || type === "relativedate" || type === "relative-date") {
    const min = fmt(filter["minValue"] ?? filter["min"]);
    const max = fmt(filter["maxValue"] ?? filter["max"]);
    if (!min && !max) return null;
    return { field, values: [`${min} – ${max}`.trim()] };
  }
  // Categorical: "all selected" or empty means no active filter → no chip.
  if (filter["isAllSelected"] === true) return null;
  const applied = Array.isArray(filter["appliedValues"])
    ? (filter["appliedValues"] as AnyRecord[])
        .map((v) => String(v["formattedValue"] ?? v["value"] ?? ""))
        .filter(Boolean)
    : [];
  if (applied.length === 0) return null;
  return { field, values: applied };
}
