import { describe, expect, it } from "vitest";
import { parseNumeric, isNumericColumn, sortRows, rowsToCsv, escapeCsv } from "./TableBlock";

describe("parseNumeric", () => {
  it("parses numbers after stripping commas, spaces, %", () => {
    expect(parseNumeric("1,234")).toBe(1234);
    expect(parseNumeric(" 12.5 % ")).toBe(12.5);
    expect(parseNumeric("-3")).toBe(-3);
  });
  it("returns null for empty / non-numeric", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("N/A")).toBeNull();
  });

  it("parses VN-formatted numbers + currency (FX-13 / AG-12)", () => {
    expect(parseNumeric("1.234.567")).toBe(1234567); // dot thousands
    expect(parseNumeric("1,5")).toBe(1.5); // comma decimal
    expect(parseNumeric("1.234,5")).toBe(1234.5); // VN both separators
    expect(parseNumeric("₫1.234.567")).toBe(1234567); // đồng symbol
    expect(parseNumeric("1.234.567 ₫")).toBe(1234567);
    expect(parseNumeric("-1.000.000")).toBe(-1000000);
  });

  it("keeps EN conventions intact", () => {
    expect(parseNumeric("1,234")).toBe(1234); // comma thousands
    expect(parseNumeric("1,234,567")).toBe(1234567);
    expect(parseNumeric("12.5")).toBe(12.5); // dot decimal
    expect(parseNumeric("1,234.5")).toBe(1234.5); // US both separators
  });
});

describe("isNumericColumn", () => {
  const rows = [
    ["North", "1,000", "n/a"],
    ["South", "2,500", "7"],
    ["", "", ""], // blanks are ignored
  ];
  it("flags a column where every non-empty cell is numeric", () => {
    expect(isNumericColumn(rows, 1)).toBe(true);
  });
  it("rejects a text column and a mixed column", () => {
    expect(isNumericColumn(rows, 0)).toBe(false);
    expect(isNumericColumn(rows, 2)).toBe(false);
  });
});

describe("sortRows", () => {
  const rows = [
    ["B", "10"],
    ["A", "2"],
    ["C", ""], // empty numeric cell
  ];
  const numericCols = [false, true];

  it("sorts a numeric column by value, empties sink to the bottom (both dirs)", () => {
    const asc = sortRows(rows, { col: 1, dir: "asc" }, numericCols).map((r) => r[1]);
    expect(asc).toEqual(["2", "10", ""]);
    const desc = sortRows(rows, { col: 1, dir: "desc" }, numericCols).map((r) => r[1]);
    expect(desc).toEqual(["10", "2", ""]);
  });

  it("sorts a text column with locale compare", () => {
    const asc = sortRows(rows, { col: 0, dir: "asc" }, numericCols).map((r) => r[0]);
    expect(asc).toEqual(["A", "B", "C"]);
  });

  it("does not mutate the input array", () => {
    const copy = rows.map((r) => [...r]);
    sortRows(rows, { col: 1, dir: "asc" }, numericCols);
    expect(rows).toEqual(copy);
  });
});

describe("rowsToCsv", () => {
  it("builds header + CRLF rows and escapes commas/quotes/newlines", () => {
    const csv = rowsToCsv(["Name", "Note"], [["A, Inc", 'he said "hi"'], ["B", "line1\nline2"]]);
    expect(csv).toBe('Name,Note\r\n"A, Inc","he said ""hi"""\r\nB,"line1\nline2"');
  });
  it("fills missing cells with empty strings", () => {
    expect(rowsToCsv(["a", "b"], [["x"]])).toBe("a,b\r\nx,");
  });
});

describe("escapeCsv — formula injection (FX-04 / C7)", () => {
  it("prefixes an apostrophe to formula-triggering cells", () => {
    expect(escapeCsv("=1+1")).toBe("'=1+1");
    expect(escapeCsv("+1")).toBe("'+1");
    expect(escapeCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsv("=HYPERLINK(0)")).toBe("'=HYPERLINK(0)");
    // A dangerous negative that is NOT a plain number (a formula) is neutralized.
    expect(escapeCsv("-2+3")).toBe("'-2+3");
  });

  it("leaves plain numbers (incl. negatives) numeric", () => {
    expect(escapeCsv("-5")).toBe("-5");
    expect(escapeCsv("-12.5")).toBe("-12.5");
    expect(escapeCsv("42")).toBe("42");
  });

  it("still quotes commas/quotes/newlines, and quotes a neutralized+comma cell", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('he "hi"')).toBe('"he ""hi"""');
    expect(escapeCsv("=A1,B2")).toBe('"\'=A1,B2"');
  });

  it("neutralizes a TAB/CR-leading cell", () => {
    expect(escapeCsv("\t=1").startsWith("'")).toBe(true);
  });
});
