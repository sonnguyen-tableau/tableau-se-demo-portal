import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AgentEvent } from "@/lib/agent-events";

/** The four export/download server events (subset of the wire union). */
export type ExportEvent = Extract<
  AgentEvent,
  { type: "campaign_csv" | "card_activation" | "prospect_export" | "carrier_report" }
>;

/** Tableau Pulse embed config (JWT + site), fetched lazily on the first pulse_card. */
export interface PulseEmbedConfig {
  token: string;
  siteUrl: string;
  siteName: string;
}

/**
 * A rich block attached to an assistant message, rendered by <RichBlock>.
 * One shared shape for both the docked panel and the full Agent page (AG-02),
 * so the full page finally renders pulse + export cards (P0 #3).
 */
export type RichBlock =
  | { kind: "image"; mimeType: string; data: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "chart"; spec: Record<string, unknown>; title?: string | undefined }
  | { kind: "pulse"; metricId: string; name: string }
  | { kind: "export"; event: ExportEvent }
  | {
      // An agent viz action, shown as a VizActionCard whose status comes from the
      // client executor (not the server's optimistic tool_result) — AG-05.
      kind: "vizAction";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "pending" | "ok" | "failed";
      error?: string | undefined;
      undo?: (() => Promise<void>) | undefined;
    };

/**
 * Config-driven export/download card props (AG-02) — one component replaces the
 * four hard-coded campaign/cards/prospects/carrier branches. Populated by
 * lib/export-card-adapters from an ExportEvent. Colors come from brand tokens.
 */
export interface ExportCardProps {
  icon: LucideIcon;
  title: string;
  /** Brand-colored count chip (e.g. "1.234 KH"). Omit when using `status`. */
  countLabel?: string | undefined;
  /** Semantic status chip (e.g. a Green/Amber/Red health band) — replaces the count chip. */
  status?: { label: string; tone: "green" | "amber" | "red" | "neutral" } | undefined;
  summary: ReactNode;
  columns?: string[] | undefined;
  preview?: { label: string; text: string } | undefined;
  download: { href: string; label: string };
  destination?: string | undefined;
  variant?: "panel" | "page" | undefined;
}
