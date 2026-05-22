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
  tenantFromSession(session); // auth check handled by middleware

  const catalog = await getLiveCatalog();
  const views = catalog.dashboards
    .filter((d) => d.workbookSlug === workbookSlug)
    .sort((a, b) => a.viewName.localeCompare(b.viewName, "vi"));

  if (views.length === 0) notFound();

  const workbookName = views[0]!.workbookName;
  const projectName = views[0]!.projectName;

  // If only 1 view, skip selection and go straight to embed
  if (views.length === 1) {
    const view = views[0]!;
    return (
      <meta httpEquiv="refresh" content={`0;url=/t/${tenantSlug}/dashboards/${workbookSlug}/${view.viewSlug}`} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-sf-neutral-5">
        <Link href={`/t/${tenantSlug}/dashboards`} className="hover:text-sf-neutral-9 transition-colors">
          Dashboards
        </Link>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium text-sf-neutral-9">{workbookName}</span>
      </nav>

      {/* Header */}
      <div className="border-b border-sf-neutral-3 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-sf-neutral-5">{projectName}</p>
        <h2 className="mt-1 text-2xl font-bold text-sf-neutral-10">{workbookName}</h2>
        <p className="mt-1 text-sm text-sf-neutral-6">
          {views.length} views — chọn một view để mở
        </p>
      </div>

      {/* View cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {views.map((v, i) => (
          <Link
            key={v.viewSlug}
            href={`/t/${tenantSlug}/dashboards/${workbookSlug}/${v.viewSlug}`}
            className="group relative flex flex-col rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-sf-sm transition-all hover:border-sf-blue-70 hover:shadow-sf-md"
          >
            {/* Page number badge */}
            <div className="mb-4 flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sf-blue-10 text-sm font-bold text-sf-blue-70">
                {i + 1}
              </span>
              <svg className="h-4 w-4 text-sf-neutral-4 transition group-hover:text-sf-blue-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h4 className="font-semibold text-sf-neutral-9 leading-snug">{v.viewName}</h4>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-sf-blue-70 opacity-0 transition group-hover:opacity-100">
              Mở view
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
