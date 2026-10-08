"use client";

import { type ReactElement } from "react";
import { translator, type Locale } from "@/lib/i18n-shared";
import { adaptExportEvent } from "@/lib/export-card-adapters";
import type { RichBlock as RichBlockData, PulseEmbedConfig } from "./types";
import { ChartBlock } from "./ChartBlock";
import { TableBlock } from "./TableBlock";
import { PulseBlock } from "./PulseBlock";
import { ExportCard } from "./ExportCard";
import { VizActionCard } from "./VizActionCard";

/**
 * Renders one assistant-message rich block, dispatching on kind to the shared
 * block components (AG-02). Used by BOTH the docked panel (variant="panel") and
 * the full Agent page (variant="page"), so the full page finally renders pulse
 * and export cards (P0 #3). Labels are localized here so the leaf components
 * stay pure/prop-driven.
 */
export function RichBlock({
  block,
  variant = "panel",
  locale,
  pulseConfig = null,
}: {
  block: RichBlockData;
  variant?: "panel" | "page";
  locale: Locale;
  pulseConfig?: PulseEmbedConfig | null;
}): ReactElement {
  const t = translator(locale);
  const dark = variant === "page";

  switch (block.kind) {
    case "image":
      // A restored history session stores images as empty placeholders (the
      // base64 is dropped before persisting, FX-04) — render a muted stub
      // instead of a broken <img>.
      if (!block.data) {
        return (
          <div
            className={`rounded-xl border px-3 py-2 text-caption ${dark ? "border-white/[0.08] bg-black/30 text-white/50" : "border-sf-neutral-3 bg-sf-neutral-2 text-sf-neutral-5"}`}
          >
            {t("block.chartImage")}
          </div>
        );
      }
      return (
        <div
          className={`overflow-hidden rounded-xl border ${dark ? "border-white/[0.08] bg-black/30" : "border-sf-neutral-3 bg-white"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${block.mimeType};base64,${block.data}`}
            alt={t("block.chartImage")}
            className="w-full object-contain"
            style={{ maxHeight: 420 }}
          />
        </div>
      );
    case "table":
      return (
        <TableBlock
          columns={block.columns}
          rows={block.rows}
          variant={variant}
          csvLabel={t("block.csv")}
          rowsLabel={(shown, total) => t("block.rows", { shown, total })}
        />
      );
    case "chart":
      return (
        <ChartBlock
          spec={block.spec}
          variant={variant}
          locale={locale}
          downloadLabel={t("block.downloadPng")}
          {...(block.title !== undefined ? { title: block.title } : {})}
        />
      );
    case "pulse":
      return (
        <PulseBlock
          metricId={block.metricId}
          name={block.name}
          config={pulseConfig}
          variant={variant}
          loadingLabel={t("block.pulseLoading")}
        />
      );
    case "export":
      return <ExportCard {...adaptExportEvent(block.event, locale, variant)} />;
    case "vizAction":
      return (
        <VizActionCard
          name={block.name}
          input={block.input}
          status={block.status}
          error={block.error}
          undo={block.undo}
          variant={variant}
          locale={locale}
        />
      );
  }

  const _exhaustive: never = block;
  return _exhaustive;
}
