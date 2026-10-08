"use client";

import { usePins } from "@/components/pins/PinsProvider";
import { DashboardCard } from "@/components/dashboards/DashboardCard";
import type { PinInput } from "@/lib/pins";

/**
 * Home "Đã ghim" row (HL-03). Renders the user's pins as cards (each still
 * pin-toggleable); hidden when there are none. Client-side so it reflects the
 * shared pins state immediately after a toggle.
 *
 * Pins are stored per user (session tenant), so `allowedKeys` — the current
 * tenant's visible catalog keys (`wb` and `wb/view`) — filters out a pin that
 * belongs to another tenant or a now-hidden workbook (FX-06).
 */
export function PinnedRow({
  tenantSlug,
  title,
  allowedKeys,
}: {
  tenantSlug: string;
  title: string;
  allowedKeys: string[];
}) {
  const { pins } = usePins();
  const allowed = new Set(allowedKeys);
  const visible = pins.filter((p) => allowed.has(p.key));
  if (visible.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-h3 font-semibold text-sf-neutral-9">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => {
          const pin: PinInput = {
            key: p.key,
            kind: p.kind,
            workbookSlug: p.workbookSlug,
            ...(p.viewSlug ? { viewSlug: p.viewSlug } : {}),
            title: p.title,
            workbookName: p.workbookName,
            projectName: p.projectName,
          };
          return (
            <DashboardCard
              key={p.key}
              href={`/t/${tenantSlug}/dashboards/${p.workbookSlug}${p.viewSlug ? `/${p.viewSlug}` : ""}`}
              title={p.title}
              eyebrow={p.projectName}
              projectName={p.projectName}
              {...(p.kind === "view" ? { subtitle: p.workbookName } : {})}
              {...(p.viewSlug ? { thumb: { wb: p.workbookSlug, view: p.viewSlug, t: tenantSlug } } : {})}
              pin={pin}
            />
          );
        })}
      </div>
    </section>
  );
}
