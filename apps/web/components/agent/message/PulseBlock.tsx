"use client";

import { type ReactElement } from "react";
import { Activity } from "lucide-react";
import { TableauPulseCard } from "@/components/embed/TableauPulseCard";
import type { PulseEmbedConfig } from "./types";

export interface PulseBlockProps {
  metricId: string;
  name: string;
  config: PulseEmbedConfig | null;
  variant?: "panel" | "page";
  loadingLabel: string;
}

/**
 * A Tableau Pulse metric card attached to an assistant message (DESIGN v2
 * §4.9). Pure/presentational: all copy arrives via props. Renders a standard
 * message surface (panel = light, page = dark) with a header row (metric name
 * + "Pulse" chip). While `config` is null the body is a muted, shimmering
 * ~240px skeleton; once the JWT/site config arrives it embeds the live
 * <TableauPulseCard>.
 */
export function PulseBlock({
  metricId,
  name,
  config,
  variant = "panel",
  loadingLabel,
}: PulseBlockProps): ReactElement {
  const dark = variant === "page";

  const surface = dark
    ? "rounded-xl border border-white/10 bg-white/[0.03]"
    : "rounded-xl border border-sf-neutral-3 bg-white";
  const titleColor = dark ? "text-white/85" : "text-sf-neutral-8";
  const mutedColor = dark ? "text-white/60" : "text-sf-neutral-6";
  const chipClass = dark
    ? "border-white/15 bg-white/10 text-white/70"
    : "border-sf-neutral-3 bg-sf-neutral-2 text-sf-neutral-6";
  const skeletonBg = dark ? "bg-white/[0.04]" : "bg-sf-neutral-2/60";

  return (
    <div className={surface}>
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-2.5">
        <h4 className={`min-w-0 truncate text-body-sm font-semibold ${titleColor}`}>{name}</h4>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium ${chipClass}`}
        >
          <Activity className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          Pulse
        </span>
      </div>

      <div className="px-3 pb-3">
        {config === null ? (
          <div
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg ${skeletonBg} animate-pulse`}
            style={{ height: "240px" }}
          >
            <span className={`text-body-sm ${mutedColor}`}>{loadingLabel}</span>
            <span className={`text-caption ${mutedColor}`}>{name}</span>
          </div>
        ) : (
          <PulseEmbed metricId={metricId} name={name} config={config} />
        )}
      </div>
    </div>
  );
}

function PulseEmbed({
  metricId,
  name,
  config,
}: {
  metricId: string;
  name: string;
  config: PulseEmbedConfig;
}): ReactElement {
  const src = `${config.siteUrl}/pulse/site/${config.siteName}/metrics/${metricId}`;
  return <TableauPulseCard src={src} token={config.token} name={name} height="240px" />;
}
