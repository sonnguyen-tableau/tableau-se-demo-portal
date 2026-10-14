"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download } from "lucide-react";

type SortDir = "asc" | "desc";
type AriaSort = "none" | "ascending" | "descending";

interface SortState {
  col: number;
  dir: SortDir;
}

export interface TableBlockProps {
  columns: string[];
  rows: string[][];
  variant?: "panel" | "page";
  maxRows?: number;
  /** Label for the CSV download button, e.g. "Tải CSV". */
  csvLabel: string;
  /** Footer text builder, e.g. (50, 312) => "Hiển thị 50 / 312 dòng". */
  rowsLabel: (shown: number, total: number) => string;
  /** Downloaded file name; defaults to "data.csv". */
  fileName?: string;
}

/**
 * Parse a formatted cell to a number, understanding both EN and VN conventions
 * (AG-12 / FX-13): currency symbols (₫ $ € £ ¥), spaces and % are stripped, and
 * the thousands/decimal separators are disambiguated — "1.234.567" → 1234567,
 * "1,5" → 1.5, "1.234,5" → 1234.5, while "1,234" and "12.5" keep their EN
 * meaning. Null when the cell is empty or non-numeric.
 */
export function parseNumeric(raw: string): number | null {
  let s = raw.trim().replace(/[₫$€£¥%\s]/g, "");
  if (s === "") return null;
  const sign = s.startsWith("-") ? -1 : 1;
  s = s.replace(/^[+-]/, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // The separator that appears LAST is the decimal point.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    // "1,5"/"1,55" (not a 3-digit group) → decimal; "1,234"/"1,234,567" → thousands.
    s = parts.length === 2 && parts[1]!.length !== 3 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    // Multiple dots can only be thousands grouping (e.g. "1.234.567").
    if (s.split(".").length > 2) s = s.replace(/\./g, "");
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = sign * Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A column is numeric iff it has ≥1 value and every non-empty cell parses as a number. */
export function isNumericColumn(rows: string[][], colIndex: number): boolean {
  let sawValue = false;
  for (const row of rows) {
    const cell = row[colIndex];
    if (cell === undefined) continue;
    const trimmed = cell.trim();
    if (trimmed === "") continue;
    sawValue = true;
    if (parseNumeric(trimmed) === null) return false;
  }
  return sawValue;
}

export function escapeCsv(value: string): string {
  // Neutralize spreadsheet formula injection (FX-04 / C7): a cell a spreadsheet
  // would evaluate as a formula — leading = + - @, TAB or CR — gets a leading
  // apostrophe so Excel/Sheets treats it as text. Plain numbers (incl. negatives
  // like -12.5) are left untouched so numeric columns stay numeric.
  let v = value;
  const isPlainNumber = /^-?\d+(?:\.\d+)?$/.test(v);
  if (/^[=+\-@\t\r]/.test(v) && !isPlainNumber) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Sort a copy of `rows` by one column. Numeric columns sort by value with
 * empty/non-numeric cells sinking to the bottom regardless of direction; text
 * columns use locale compare.
 */
export function sortRows(rows: string[][], sort: SortState, numericCols: boolean[]): string[][] {
  const { col, dir } = sort;
  const numeric = numericCols[col] ?? false;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = (a[col] ?? "").trim();
    const bv = (b[col] ?? "").trim();
    let cmp: number;
    if (numeric) {
      const an = parseNumeric(av);
      const bn = parseNumeric(bv);
      if (an === null && bn === null) return 0;
      if (an === null) return 1;
      if (bn === null) return -1;
      cmp = an - bn;
    } else {
      cmp = av.localeCompare(bv);
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return copy;
}

/** Build CSV text (header + rows, CRLF-joined, cells escaped). No BOM — the caller adds one. */
export function rowsToCsv(columns: string[], rows: string[][]): string {
  const lines = [columns.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(columns.map((_, ci) => escapeCsv(row[ci] ?? "")).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Pure, presentational data table for an assistant message (DESIGN v2 §4.9).
 * Detects numeric columns (right-aligned + tabular-nums), sorts on header click
 * (none → asc → desc → none, numeric-aware), caps visible rows, and offers a
 * client-side CSV export. Two surfaces via `variant`: light "panel", dark "page".
 */
export function TableBlock({
  columns,
  rows,
  variant = "panel",
  maxRows,
  csvLabel,
  rowsLabel,
  fileName,
}: TableBlockProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const dark = variant === "page";

  const numericCols = useMemo(
    () => columns.map((_, ci) => isNumericColumn(rows, ci)),
    [columns, rows],
  );

  const sortedRows = useMemo(
    () => (sort ? sortRows(rows, sort, numericCols) : rows),
    [rows, sort, numericCols],
  );

  const cap = maxRows ?? 50;
  const visibleRows = sortedRows.slice(0, cap);
  const shownCount = visibleRows.length;

  function toggleSort(col: number): void {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  }

  function handleDownload(): void {
    // Prepend a BOM so Excel reads UTF-8 (Vietnamese) correctly.
    const blob = new Blob(["﻿" + rowsToCsv(columns, sortedRows)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ?? "data.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const surface = dark
    ? "rounded-xl border border-white/10 bg-white/[0.03]"
    : "rounded-xl border border-sf-neutral-3 bg-white";
  const bodyText = dark ? "text-white/85" : "text-sf-neutral-8";
  const mutedText = dark ? "text-white/60" : "text-sf-neutral-6";
  const headerBg = dark ? "bg-white/[0.06]" : "bg-sf-neutral-2";
  const divider = dark ? "border-white/10" : "border-sf-neutral-3";
  const rowDivider = dark ? "border-white/[0.06]" : "border-sf-neutral-2";
  const headerHover = dark ? "hover:text-white" : "hover:text-brand-text";
  const downloadBtn = dark
    ? "bg-white/[0.08] text-white hover:bg-white/[0.14]"
    : "bg-brand/8 text-brand-text hover:bg-brand/12";

  return (
    <div className={`overflow-hidden ${surface}`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr>
              {columns.map((col, ci) => {
                const numeric = numericCols[ci] ?? false;
                const activeDir: SortDir | null =
                  sort && sort.col === ci ? sort.dir : null;
                const ariaSort: AriaSort =
                  activeDir === "asc"
                    ? "ascending"
                    : activeDir === "desc"
                      ? "descending"
                      : "none";
                return (
                  <th
                    key={ci}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`sticky top-0 z-10 border-b p-0 font-semibold ${divider} ${headerBg} ${bodyText}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(ci)}
                      className={`flex w-full items-center gap-1 whitespace-nowrap px-3 py-2 transition-colors ${headerHover} ${
                        numeric ? "justify-end text-right" : "justify-start text-left"
                      }`}
                    >
                      <span>{col}</span>
                      {activeDir === "asc" ? (
                        <ChevronUp
                          className="h-3.5 w-3.5 shrink-0"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      ) : activeDir === "desc" ? (
                        <ChevronDown
                          className="h-3.5 w-3.5 shrink-0"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr key={ri} className={`border-b last:border-b-0 ${rowDivider}`}>
                {columns.map((_, ci) => {
                  const numeric = numericCols[ci] ?? false;
                  return (
                    <td
                      key={ci}
                      className={`whitespace-nowrap px-3 py-1.5 ${bodyText} ${
                        numeric ? "text-right tabular-nums" : "text-left"
                      }`}
                    >
                      {row[ci] ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`flex items-center justify-between gap-2 border-t px-3 py-2 ${divider}`}>
        <span className={`text-meta ${mutedText}`}>
          {rowsLabel(shownCount, rows.length)}
        </span>
        <button
          type="button"
          onClick={handleDownload}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-meta font-semibold transition-colors ${downloadBtn}`}
        >
          <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {csvLabel}
        </button>
      </div>
    </div>
  );
}
