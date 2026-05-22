import Link from "next/link";
import { getLiveCatalog, type LiveProject } from "@/lib/tableau-rest";

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
  const catalog = await getLiveCatalog();

  const projectMap = new Map<string, LiveProject>(catalog.projects.map((p) => [p.id, p]));

  // De-duplicate: one entry per workbook
  type WorkbookEntry = {
    workbookId: string;
    workbookName: string;
    workbookSlug: string;
    projectId: string;
    projectName: string;
    viewCount: number;
  };
  const workbookMap = new Map<string, WorkbookEntry>();
  for (const d of catalog.dashboards) {
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

  // Group workbooks by project
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
  const isEmpty = totalWorkbooks === 0;

  return (
    <div className="space-y-8">
      <div className="border-b border-sf-neutral-3 pb-5">
        <h2 className="text-2xl font-bold text-sf-neutral-10">Dashboards</h2>
        <p className="mt-1 text-sm text-sf-neutral-6">
          {isEmpty
            ? "Chưa có dashboard nào — kiểm tra cấu hình Tableau REST API."
            : `${totalWorkbooks} workbooks trong ${groups.length} dự án`}
        </p>
      </div>

      {isEmpty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h3 className="font-semibold">Không tìm thấy dashboard</h3>
          <p className="mt-1 text-sm">
            Đảm bảo rằng <code className="font-mono text-xs">TABLEAU_PAT_NAME</code> và{" "}
            <code className="font-mono text-xs">TABLEAU_PAT_SECRET</code> được cấu hình đúng.
          </p>
        </div>
      )}

      {groups.map(({ project, workbooks }) => (
        <section key={project.id}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className="text-xl">{projectIcon(project.name)}</span>
            <h3 className="text-base font-semibold text-sf-neutral-10">{project.name}</h3>
            <span className="rounded-full bg-sf-blue-10 px-2 py-0.5 text-xs font-medium text-sf-blue-80">
              {workbooks.length}
            </span>
            <div className="h-px flex-1 bg-sf-neutral-3" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workbooks.map((wb) => (
              <Link
                key={wb.workbookId}
                href={`/t/${tenantSlug}/dashboards/${wb.workbookSlug}`}
                className="group flex flex-col rounded-lg border border-sf-neutral-3 bg-white p-5 shadow-sf-sm transition-all hover:border-sf-blue-70 hover:shadow-sf-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sf-blue-10 text-xl">
                    📊
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-sf-neutral-4 transition group-hover:text-sf-blue-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h4 className="font-semibold text-sf-neutral-9 leading-snug">{wb.workbookName}</h4>
                <p className="mt-1 text-xs text-sf-neutral-5">
                  {wb.viewCount} {wb.viewCount === 1 ? "view" : "views"}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-sf-blue-70 opacity-0 transition group-hover:opacity-100">
                  Xem dashboard
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
