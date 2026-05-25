import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getLiveCatalog } from "@/lib/tableau-rest";

interface PageProps {
  params: Promise<{ tenantSlug: string; workbookSlug: string }>;
}

export default async function WorkbookPage({ params }: PageProps) {
  const { tenantSlug, workbookSlug } = await params;

  const session = await auth();
  if (!session?.user) notFound();
  tenantFromSession(session);

  const catalog = await getLiveCatalog();
  const views = catalog.dashboards
    .filter((d) => d.workbookSlug === workbookSlug)
    .sort((a, b) => a.viewName.localeCompare(b.viewName, "vi"));

  if (views.length === 0) notFound();

  const workbookName = views[0]!.workbookName;
  const projectName = views[0]!.projectName;

  if (views.length === 1) {
    const view = views[0]!;
    return (
      <meta httpEquiv="refresh" content={`0;url=/t/${tenantSlug}/dashboards/${workbookSlug}/${view.viewSlug}`} />
    );
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
              {views.length} views — chọn một view để mở
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
        {views.map((v, i) => (
          <Link
            key={v.viewSlug}
            href={`/t/${tenantSlug}/dashboards/${workbookSlug}/${v.viewSlug}`}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-elev-1 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:shadow-elev-2"
          >
            <span
              className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand via-sf-blue-60 to-sf-blue-40 transition-transform duration-base ease-smooth group-hover:scale-x-100"
              aria-hidden="true"
            />
            <div className="mb-4 flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/8 text-body-sm font-bold text-brand tabular-nums ring-1 ring-brand/10">
                {String(i + 1).padStart(2, "0")}
              </span>
              <svg className="h-4 w-4 text-sf-neutral-4 transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-body-lg font-semibold leading-snug text-sf-neutral-9 line-clamp-2">{v.viewName}</h3>
            <div className="mt-3 flex items-center gap-1 text-caption font-semibold text-brand opacity-0 transition-opacity duration-base group-hover:opacity-100">
              Mở view
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
