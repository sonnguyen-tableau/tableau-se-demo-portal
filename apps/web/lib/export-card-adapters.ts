import { Inbox, CreditCard, Plane, FileText } from "lucide-react";
import { translator, type Locale } from "@/lib/i18n-shared";
import type { ExportEvent, ExportCardProps } from "@/components/agent/message/types";

/**
 * Map an export/download server event to generic ExportCardProps (AG-02) — one
 * adapter so a new tenant campaign needs an entry here, not new JSX. All copy is
 * localized; colors come from brand tokens in ExportCard. The SNP carrier report
 * has no count/columns/preview, so its health band rides in countLabel and its
 * KPIs in the summary (a brand-only card can't render a semantic status chip —
 * a known AG-02 limitation to revisit with a semantic status slot).
 */
export function adaptExportEvent(
  event: ExportEvent,
  locale: Locale,
  variant: "panel" | "page",
): ExportCardProps {
  const t = translator(locale);
  const nf = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US");
  const customers = (n: number) => `${nf.format(n)} ${t("export.unit.customers")}`;

  switch (event.type) {
    case "campaign_csv":
      return {
        icon: Inbox,
        title: t("export.campaign.title"),
        countLabel: customers(event.rowCount),
        summary: t("export.campaign.summary", {
          campaign: event.campaign,
          digital: nf.format(event.digital),
          rm: nf.format(event.rm),
          proj: nf.format(Math.round(event.projectedDisbursedVnd / 1e9)),
        }),
        columns: event.columns,
        preview: { label: t("export.zalo"), text: event.zaloPreview },
        download: { href: event.downloadUrl, label: t("export.campaign.download") },
        ...(event.s3Uri ? { destination: `${t("export.s3")}: ${event.s3Uri}` } : {}),
        variant,
      };
    case "card_activation":
      return {
        icon: CreditCard,
        title: t("export.cards.title"),
        countLabel: customers(event.rowCount),
        summary: t("export.cards.summary", {
          campaign: event.campaign,
          digital: nf.format(event.digital),
          rm: nf.format(event.rm),
          activations: nf.format(event.projectedActivations),
        }),
        columns: event.columns,
        preview: { label: t("export.zalo"), text: event.zaloPreview },
        download: { href: event.downloadUrl, label: t("export.cards.download") },
        ...(event.s3Uri ? { destination: `${t("export.s3")}: ${event.s3Uri}` } : {}),
        variant,
      };
    case "prospect_export":
      return {
        icon: Plane,
        title: t("export.prospects.title"),
        countLabel: customers(event.rowCount),
        summary: t("export.prospects.summary", {
          campaign: event.campaign,
          fit: event.avgFitScore.toFixed(3),
          newCards: nf.format(event.projectedNewCards),
        }),
        columns: event.columns,
        download: { href: event.downloadUrl, label: t("export.prospects.download") },
        ...(event.s3Uri ? { destination: `${t("export.s3")}: ${event.s3Uri}` } : {}),
        variant,
      };
    case "carrier_report":
      return {
        icon: FileText,
        title: event.title,
        ...(event.healthBand
          ? { status: { label: event.healthBand, tone: bandTone(event.healthBand) } }
          : {}),
        summary: event.kpis.map((k) => `${k.label}: ${k.value}`).join(" · "),
        download: { href: event.downloadUrl, label: t("export.carrier.download") },
        variant,
      };
  }

  // Exhaustive: every ExportEvent variant is handled above.
  const _exhaustive: never = event;
  return _exhaustive;
}

/** Map a carrier health band to a semantic status tone for its chip color. */
function bandTone(band: string): "green" | "amber" | "red" | "neutral" {
  const b = band.toLowerCase();
  if (b.includes("green")) return "green";
  if (b.includes("amber") || b.includes("yellow")) return "amber";
  if (b.includes("red")) return "red";
  return "neutral";
}
