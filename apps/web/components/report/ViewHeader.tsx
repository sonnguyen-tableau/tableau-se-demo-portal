"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";
import { ViewTabs, type ViewTab } from "@/components/report/ViewTabs";

/**
 * Report view header (RV-01, DESIGN §4.5): view name (text-h2) + a freshness
 * line from the workbook's updatedAt, a right slot (chat toggle / toolbar), and
 * the in-place sheet-switching tabs below. Replaces the old in-page breadcrumb +
 * segmented control (the global breadcrumb from SH-03 covers the path).
 */
export function ViewHeader({
  tenantSlug,
  workbookSlug,
  workbookName,
  projectName,
  viewName,
  updatedAt,
  tabs,
  locale = DEFAULT_LOCALE,
  rightSlot,
}: {
  tenantSlug: string;
  workbookSlug: string;
  workbookName: string;
  projectName: string;
  viewName: string;
  updatedAt?: string | undefined;
  tabs: ViewTab[];
  locale?: Locale;
  rightSlot?: ReactNode;
}) {
  // Track the active sheet by URL so the title follows an in-place tab switch
  // (pushState updates usePathname) rather than staying on the server-rendered
  // view (FX-02). Falls back to the prop when no tab matches.
  const pathname = usePathname() ?? "";
  const activeSlug = pathname.split("/").filter(Boolean).pop() ?? "";
  const displayName = tabs.find((t) => t.viewSlug === activeSlug)?.viewName ?? viewName;

  // Format client-side (post-mount) so SSR vs client "today" can't mismatch.
  const [freshness, setFreshness] = useState("");
  useEffect(() => {
    if (!updatedAt) return setFreshness("");
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return setFreshness("");
    const tr = translator(locale);
    const sameDay = d.toDateString() === new Date().toDateString();
    setFreshness(
      sameDay
        ? tr("view.updatedToday", { time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })
        : tr("view.updatedOn", { date: d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) }),
    );
  }, [updatedAt, locale]);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {projectName && (
            <p className="truncate text-meta font-medium uppercase tracking-wider text-sf-neutral-5">{projectName}</p>
          )}
          <h1 className="truncate text-h2 font-bold text-sf-neutral-10">{displayName}</h1>
          {freshness && <p className="mt-0.5 text-caption text-sf-neutral-5">{freshness}</p>}
        </div>
        {rightSlot && <div className="flex shrink-0 items-center gap-2">{rightSlot}</div>}
      </div>
      <ViewTabs
        tenantSlug={tenantSlug}
        workbookSlug={workbookSlug}
        workbookName={workbookName}
        projectName={projectName}
        tabs={tabs}
        locale={locale}
      />
    </div>
  );
}
