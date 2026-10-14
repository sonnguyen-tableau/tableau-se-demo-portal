"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { projectIcon } from "@/lib/project-icon";
import { PinButton } from "@/components/pins/PinButton";
import type { PinInput } from "@/lib/pins";

export interface DashboardCardProps {
  href: string;
  /** Primary title — view name (per-view card) or workbook name (workbook card). */
  title: string;
  /** Secondary line — e.g. the workbook name or a "N views" count. */
  subtitle?: string;
  /** Small uppercase label above the title — usually the project name. */
  eyebrow?: string;
  /** Drives the fallback glyph when there is no thumbnail. */
  projectName: string;
  /**
   * Slugs used to build the thumbnail URL (`/api/tableau/thumbnail?wb&view&t`).
   * Pass a representative view's slugs for a workbook card. `t` is the tenant
   * slug so the thumbnail resolves against the viewed tenant (FX-06), not the
   * session tenant. Omit → icon only.
   */
  thumb?: { wb: string; view: string; t?: string };
  /** Optional pill rendered over the top-right of the thumbnail (e.g. view count). */
  badge?: ReactNode;
  /** Hover CTA text (e.g. "Open dashboard"). */
  ctaLabel?: string;
  /** When set, renders a pin toggle on the thumbnail (HL-03). */
  pin?: PinInput;
}

/**
 * Shared dashboard/view card (HL-01, DESIGN §4.3). Renders a fixed-aspect
 * thumbnail (Tableau previewImage via the authenticated proxy) with a shimmer
 * while loading and a branded project-icon fallback on error / no thumbnail.
 * The thumbnail box has a fixed aspect ratio so cards never shift as images
 * load.
 */
export function DashboardCard({
  href,
  title,
  subtitle,
  eyebrow,
  projectName,
  thumb,
  badge,
  ctaLabel,
  pin,
}: DashboardCardProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(thumb ? "loading" : "error");
  const imgRef = useRef<HTMLImageElement>(null);
  const Glyph = projectIcon(projectName);
  const showIcon = !thumb || status === "error";

  // Hydration race: a browser-cached thumbnail can finish loading BEFORE React
  // attaches onLoad, so the handler never fires and the card stays on the
  // shimmer. After mount, reconcile from the DOM (FX-07).
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) setStatus(img.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  return (
    // A positioned container with an overlay <Link> instead of wrapping the
    // whole card (and the pin <button>) in an <a> — nesting a button inside an
    // anchor is invalid and breaks keyboard/AT semantics (FX-07).
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-sf-neutral-3 bg-white shadow-elev-1 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:shadow-elev-2">
      <Link href={href} aria-label={title} className="absolute inset-0 z-[1] rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />

      {/* Thumbnail — fixed aspect ratio prevents layout shift */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-sf-neutral-2">
        {showIcon ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand/8 to-sf-blue-40/5">
            <Glyph className="h-10 w-10 text-brand/40" strokeWidth={1.5} aria-hidden="true" />
          </div>
        ) : (
          <>
            {status === "loading" && <div className="absolute inset-0 animate-pulse bg-sf-neutral-2" aria-hidden="true" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={`/api/tableau/thumbnail?wb=${encodeURIComponent(thumb!.wb)}&view=${encodeURIComponent(thumb!.view)}${thumb!.t ? `&t=${encodeURIComponent(thumb!.t)}` : ""}`}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
              className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-base ${
                status === "loaded" ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        )}
      </div>

      {/* Overlays — siblings of the link (same stacking context) so they sit
          above it (z-2 > z-1) and stay clickable without nesting in the <a>. */}
      {badge && <div className="absolute right-2 top-2 z-[2]">{badge}</div>}
      {pin && <div className="absolute left-2 top-2 z-[2]"><PinButton item={pin} /></div>}

      {/* Meta */}
      <div className="flex flex-1 flex-col p-4">
        {eyebrow && (
          <span className="truncate text-meta font-medium uppercase tracking-wider text-sf-neutral-6">{eyebrow}</span>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-body-lg font-semibold leading-snug text-sf-neutral-9">{title}</h3>
        {subtitle && <p className="mt-1 truncate text-body-sm text-sf-neutral-6">{subtitle}</p>}
        {ctaLabel && (
          <div className="mt-auto flex items-center gap-1 pt-3 text-caption font-semibold text-brand opacity-0 transition-opacity duration-base group-hover:opacity-100">
            {ctaLabel}
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
