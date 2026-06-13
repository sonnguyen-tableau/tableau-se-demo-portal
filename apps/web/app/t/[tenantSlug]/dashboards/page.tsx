import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getLiveCatalog, type LiveProject } from "@/lib/tableau-rest";
import { getTenant } from "@/lib/tenants";
import { getVisibleWorkbookIds } from "@/lib/catalog-filter";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

function projectIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("banking") || n.includes("financial")) return "🏦";
  if (n.includes("retail")) return "🛒";
  if (n.includes("sales")) return "📈";
  if (n.includes("risk")) return "⚠️";
  if (n.includes("operation")) return "⚙️";
  if (n.includes("digital")) return "💻";
  if (n.includes("energy") || n.includes("evn")) return "⚡";
  if (n.includes("gaming")) return "🎮";
  if (n.includes("education")) return "🎓";
  if (n.includes("health")) return "🏥";
  if (n.includes("manufactur")) return "🏭";
  if (n.includes("ride") || n.includes("transport")) return "🚗";
  if (n.includes("sample")) return "📋";
  if (n.includes("demo")) return "🔬";
  return "📁";
}

export default async function DashboardsIndex({ params }: PageProps) {
  const { tenantSlug } = await params;
  const session = await auth();
  const ctx = tenantFromSession(session);
  const userEmail = session?.user?.email ?? "";

  const tenantRecord = await getTenant(tenantSlug);
  const [catalog, visibleIds] = await Promise.all([
    getLiveCatalog(ctx?.tenantId, tenantRecord?.allowedProjects),
    getVisibleWorkbookIds(userEmail),
  ]);

  const dashboards = visibleIds
    ? catalog.dashboards.filter((d) => visibleIds.has(d.workbookId))
    : catalog.dashboards;

  const projectMap = new Map<string, LiveProject>(catalog.projects.map((p) => [p.id, p]));

  type WorkbookEntry = {
    workbookId: string;
    workbookName: string;
    workbookSlug: string;
    projectId: string;
    projectName: string;
    viewCount: number;
  };
  const workbookMap = new Map<string, WorkbookEntry>();
  for (const d of dashboards) {
    if (!workbookMap.has(d.workbookId)) {
      workbookMap.set(d.workbookId, {
        workbookId: d.workbookId,
        workbookName: d.workbookName,
        workbookSlug: d.workbookSlug,
        projectId: d.projectId,
        projectName: d.projectName,
        viewCount: 0,
      });
    }
    workbookMap.get(d.workbookId)!.viewCount++;
  }

  const byProject = new Map<string, { project: LiveProject; workbooks: WorkbookEntry[] }>();
  for (const wb of workbookMap.values()) {
    if (!byProject.has(wb.projectId)) {
      const project = projectMap.get(wb.projectId) ?? { id: wb.projectId, name: wb.projectName };
      byProject.set(wb.projectId, { project, workbooks: [] });
    }
    byProject.get(wb.projectId)!.workbooks.push(wb);
  }

  const groups = [...byProject.values()].sort((a, b) =>
    a.project.name.localeCompare(b.project.name, "vi"),
  );
  for (const g of groups) {
    g.workbooks.sort((a, b) => a.workbookName.localeCompare(b.workbookName, "vi"));
  }

  const totalWorkbooks = workbookMap.size;
  const totalViews = dashboards.length;
  const isEmpty = totalWorkbooks === 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-sf-neutral-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-meta font-semibold uppercase tracking-[0.16em] text-brand">Thư viện</p>
          <h1 className="mt-1 text-h1 font-bold text-sf-neutral-10">Dashboards</h1>
          <p className="mt-1 text-body text-sf-neutral-6">
            {isEmpty
              ? "Chưa có dashboard nào — kiểm tra cấu hình Tableau REST API."
              : "Tìm và mở các báo cáo bạn đã được cấp quyền."}
          </p>
        </div>
        {!isEmpty && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sf-neutral-3 bg-white px-3 py-1 text-meta font-medium text-sf-neutral-7 shadow-elev-0">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
              {totalWorkbooks} workbooks
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sf-neutral-3 bg-white px-3 py-1 text-meta font-medium text-sf-neutral-7 shadow-elev-0">
              <span className="h-1.5 w-1.5 rounded-full bg-sf-blue-40" aria-hidden="true" />
              {totalViews} views
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sf-neutral-3 bg-white px-3 py-1 text-meta font-medium text-sf-neutral-7 shadow-elev-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {groups.length} dự án
            </span>
          </div>
        )}
      </header>

      {isEmpty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6 text-amber-900">
          <h3 className="text-h3 font-semibold">Không tìm thấy dashboard</h3>
          <p className="mt-1 text-body-sm">
            Đảm bảo rằng <code className="font-mono text-caption">TABLEAU_PAT_NAME</code> và{" "}
            <code className="font-mono text-caption">TABLEAU_PAT_SECRET</code> được cấu hình đúng.
          </p>
        </div>
      )}

      {/* ── Project groups ──────────────────────────────────────────── */}
      {groups.map(({ project, workbooks }) => (
        <section key={project.id} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-base ring-1 ring-brand/10">
              {projectIcon(project.name)}
            </span>
            <div className="flex flex-col leading-tight">
              <h2 className="text-h3 font-semibold text-sf-neutral-10">{project.name}</h2>
              <span className="text-meta text-sf-neutral-5">
                {workbooks.length} {workbooks.length === 1 ? "workbook" : "workbooks"}
              </span>
            </div>
            <div className="ml-2 h-px flex-1 bg-gradient-to-r from-sf-neutral-3 to-transparent" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workbooks.map((wb) => (
              <Link
                key={wb.workbookId}
                href={`/t/${tenantSlug}/dashboards/${wb.workbookSlug}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-elev-1 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:shadow-elev-2"
              >
                {/* Gradient accent strip on hover */}
                <span
                  className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand via-sf-blue-60 to-sf-blue-40 transition-transform duration-base ease-smooth group-hover:scale-x-100"
                  aria-hidden="true"
                />
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/8 text-brand transition-colors group-hover:bg-brand/12">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-sf-neutral-4 transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h3 className="text-body-lg font-semibold leading-snug text-sf-neutral-9 line-clamp-2">{wb.workbookName}</h3>
                <p className="mt-1.5 text-caption text-sf-neutral-5">
                  {wb.viewCount} {wb.viewCount === 1 ? "view" : "views"}
                </p>
                <div className="mt-4 flex items-center gap-1 text-caption font-semibold text-brand opacity-0 transition-opacity duration-base group-hover:opacity-100">
                  Mở dashboard
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
