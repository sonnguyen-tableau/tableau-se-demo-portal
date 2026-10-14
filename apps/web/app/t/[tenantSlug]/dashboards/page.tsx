import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { type LiveProject } from "@/lib/tableau-rest";
import { getUserCatalog } from "@/lib/user-catalog";
import { LibraryBrowser, type LibGroup, type LibSort } from "@/components/dashboards/LibraryBrowser";
import { getT } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string; project?: string; sort?: string }>;
}

export default async function DashboardsIndex({ params, searchParams }: PageProps) {
  const { tenantSlug } = await params;
  const sp = await searchParams;
  const { t } = await getT();
  const session = await auth();
  const ctx = tenantFromSession(session);

  const { projects, dashboards } = await getUserCatalog(session, tenantSlug);

  const projectMap = new Map<string, LiveProject>(projects.map((p) => [p.id, p]));

  type WorkbookEntry = {
    workbookId: string;
    workbookName: string;
    workbookSlug: string;
    projectId: string;
    projectName: string;
    viewCount: number;
    firstViewSlug: string; // representative view for the card thumbnail (HL-01)
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
        firstViewSlug: d.viewSlug,
      });
    }
    workbookMap.get(d.workbookId)!.viewCount++;
  }

  const byProject = new Map<string, LibGroup>();
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

  const totalWorkbooks = workbookMap.size;
  const totalViews = dashboards.length;
  const isEmpty = totalWorkbooks === 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-sf-neutral-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-meta font-semibold uppercase tracking-[0.16em] text-brand">{t("lib.eyebrow")}</p>
          <h1 className="mt-1 text-h1 font-bold text-sf-neutral-10">Dashboards</h1>
          <p className="mt-1 text-body text-sf-neutral-6">
            {isEmpty ? t("lib.emptyConfig") : t("lib.subtitle")}
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
              {t("lib.projectsCount", { n: groups.length })}
            </span>
          </div>
        )}
      </header>

      {isEmpty ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-6 text-amber-900">
          <h3 className="text-h3 font-semibold">{t("lib.emptyTitle")}</h3>
          {/* End users never see PAT/env-var names (HL-04) — only internal admins do. */}
          <p className="mt-1 text-body-sm">{ctx?.isInternal ? t("lib.emptyBody") : t("lib.emptyBodyUser")}</p>
        </div>
      ) : (
        <LibraryBrowser
          tenantSlug={tenantSlug}
          groups={groups}
          initial={{
            q: sp.q ?? "",
            projectId: sp.project ?? "all",
            sort: sp.sort === "views" ? "views" : ("name" as LibSort),
          }}
          labels={{
            searchPlaceholder: t("lib.searchPlaceholder"),
            all: t("lib.all"),
            sortLabel: t("lib.sortLabel"),
            sortName: t("lib.sortName"),
            sortViews: t("lib.sortViews"),
            noMatch: t("lib.noMatch"),
            clearFilters: t("lib.clearFilters"),
            openDashboard: t("lib.openDashboard"),
          }}
        />
      )}
    </div>
  );
}
