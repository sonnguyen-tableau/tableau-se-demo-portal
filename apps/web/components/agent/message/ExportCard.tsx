"use client";

import { Cloud, Download } from "lucide-react";
import type { ExportCardProps } from "./types";

/**
 * Config-driven export/download card (DESIGN v2 §4.9). One presentational
 * component that replaces the four hard-coded campaign / cards / prospects /
 * carrier branches formerly inlined in ChatPanel's RichBlockView. All
 * user-facing text arrives via props; colours use brand + neutral design
 * tokens only (no per-tenant hex), with a light "panel" surface for the docked
 * chat panel and a dark "page" surface for the full Agent page.
 */
const STATUS_CHIP: Record<"green" | "amber" | "red" | "neutral", { light: string; dark: string }> = {
  green: { light: "bg-emerald-100 text-emerald-700", dark: "bg-emerald-400/15 text-emerald-300" },
  amber: { light: "bg-amber-100 text-amber-700", dark: "bg-amber-400/15 text-amber-300" },
  red: { light: "bg-red-100 text-red-700", dark: "bg-red-400/15 text-red-300" },
  neutral: { light: "bg-sf-neutral-2 text-sf-neutral-7", dark: "bg-white/10 text-white/70" },
};

export function ExportCard({
  icon: Icon,
  title,
  countLabel,
  status,
  summary,
  columns,
  preview,
  download,
  destination,
  variant = "panel",
}: ExportCardProps) {
  const dark = variant === "page";

  const surface = dark
    ? "border-white/10 bg-white/[0.03]"
    : "border-sf-neutral-3 bg-white";
  const headerTint = dark
    ? "border-white/10 bg-white/[0.04]"
    : "border-sf-neutral-3 bg-brand/8";
  const titleColor = dark ? "text-white/85" : "text-sf-neutral-8";
  const mutedColor = dark ? "text-white/60" : "text-sf-neutral-6";
  const tagClass = dark
    ? "bg-white/10 text-white/60"
    : "bg-sf-neutral-2 text-sf-neutral-6";
  const previewBox = dark
    ? "border-white/10 bg-white/[0.04] text-white/60"
    : "border-sf-neutral-3 bg-sf-neutral-2 text-sf-neutral-6";

  const shownCols = columns ? columns.slice(0, 8) : [];
  const moreCols = columns ? columns.length - shownCols.length : 0;

  return (
    <div className={`overflow-hidden rounded-xl border ${surface}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${headerTint}`}>
        <div className={`flex items-center gap-2 text-body-sm font-semibold ${titleColor}`}>
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{title}</span>
        </div>
        {status ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold ${
              dark ? STATUS_CHIP[status.tone].dark : STATUS_CHIP[status.tone].light
            }`}
          >
            {status.label}
          </span>
        ) : countLabel ? (
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-caption font-semibold text-brand-on">
            {countLabel}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <p className={`text-caption ${mutedColor}`}>{summary}</p>

        {columns && columns.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {shownCols.map((col) => (
              <span
                key={col}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${tagClass}`}
              >
                {col}
              </span>
            ))}
            {moreCols > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${tagClass}`}>
                +{moreCols}
              </span>
            )}
          </div>
        )}

        {preview && (
          <div className={`rounded-md border px-2.5 py-2 text-[11px] leading-relaxed ${previewBox}`}>
            <span className="mr-1 font-semibold text-brand-text">{preview.label}</span>
            {preview.text}
          </div>
        )}

        <a href={download.href} download className="btn-primary text-body-sm">
          <Download className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {download.label}
        </a>

        {destination && (
          <p className={`flex items-center gap-1.5 text-[11px] ${mutedColor}`}>
            <Cloud className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-mono">{destination}</span>
          </p>
        )}
      </div>
    </div>
  );
}
