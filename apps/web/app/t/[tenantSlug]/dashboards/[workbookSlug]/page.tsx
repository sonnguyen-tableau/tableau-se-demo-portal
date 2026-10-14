import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserCatalog } from "@/lib/user-catalog";
import { DashboardCard } from "@/components/dashboards/DashboardCard";
import { getT } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ tenantSlug: string; workbookSlug: string }>;
}

export default async function WorkbookPage({ params }: PageProps) {
  const { tenantSlug, workbookSlug } = await params;
  const { t } = await getT();

  const session = await auth();
  if (!session?.user) notFound();

  const { dashboards } = await getUserCatalog(session, tenantSlug);
  const views = dashboards
    .filter((d) => d.workbookSlug === workbookSlug)
    .sort((a, b) => a.viewName.localeCompare(b.viewName, "vi"));

  if (views.length === 0) notFound();

  const workbookName = views[0]!.workbookName;
  const projectName = views[0]!.projectName;

  if (views.length === 1) {
    // Single-view workbook: go straight to the view. `redirect()` issues a real
    // server redirect (no blank flash, no lingering empty page in history) —
    // unlike the old <meta http-equiv="refresh"> (HL-06).
    redirect(`/t/${tenantSlug}/dashboards/${workbookSlug}/${views[0]!.viewSlug}`);
  }

  return (
    <div className="space-y-7 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="border-b border-sf-neutral-3 pb-6">
        <nav className="flex items-center gap-1.5 text-caption text-sf-neutral-5">
          <Link href={`/t/${tenantSlug}/dashboards`} className="transition-colors hover:text-sf-neutral-9">
            Dashboards
          </Link>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-sf-neutral-8 truncate max-w-[280px]">{workbookName}</span>
        </nav>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-meta font-semibold uppercase tracking-[0.16em] text-brand">{projectName}</p>
            <h1 className="mt-1 text-h1 font-bold leading-tight text-sf-neutral-10">{workbookName}</h1>
            <p className="mt-1.5 text-body text-sf-neutral-6">
              {t("workbook.chooseView", { n: views.length })}
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-sf-neutral-3 bg-white px-3 py-1 text-meta font-medium text-sf-neutral-7 shadow-elev-0">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            {views.length} views
          </span>
        </div>
      </header>

      {/* ── View cards ──────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {views.map((v) => (
          <DashboardCard
            key={v.viewSlug}
            href={`/t/${tenantSlug}/dashboards/${workbookSlug}/${v.viewSlug}`}
            title={v.viewName}
            eyebrow={projectName}
            projectName={projectName}
            thumb={{ wb: workbookSlug, view: v.viewSlug }}
            ctaLabel={t("workbook.openView")}
          />
        ))}
      </div>
    </div>
  );
}
