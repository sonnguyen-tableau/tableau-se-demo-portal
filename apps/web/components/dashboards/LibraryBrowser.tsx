"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DashboardCard } from "@/components/dashboards/DashboardCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { projectIcon } from "@/lib/project-icon";
import { normalizeText } from "@/lib/normalize-text";

// Re-exported for existing importers; the implementation now lives in the
// shared lib so the library + command palette share one normalizer (FX-11).
export { normalizeText };

export interface LibWorkbook {
  workbookId: string;
  workbookName: string;
  workbookSlug: string;
  projectId: string;
  projectName: string;
  viewCount: number;
  firstViewSlug: string;
}
export interface LibGroup {
  project: { id: string; name: string };
  workbooks: LibWorkbook[];
}
export type LibSort = "name" | "views";

export interface LibLabels {
  searchPlaceholder: string;
  all: string;
  sortLabel: string;
  sortName: string;
  sortViews: string;
  noMatch: string;
  clearFilters: string;
  openDashboard: string;
}

/** Pure filter + sort over the library groups. Exported for unit tests. */
export function filterGroups(
  groups: LibGroup[],
  { q, projectId, sort }: { q: string; projectId: string; sort: LibSort },
): LibGroup[] {
  const nq = normalizeText(q);
  const out: LibGroup[] = [];
  for (const g of groups) {
    if (projectId !== "all" && g.project.id !== projectId) continue;
    const wbs = nq
      ? g.workbooks.filter((w) => normalizeText(w.workbookName).includes(nq))
      : g.workbooks;
    if (wbs.length === 0) continue;
    const sorted = [...wbs].sort((a, b) =>
      sort === "views"
        ? b.viewCount - a.viewCount
        : a.workbookName.localeCompare(b.workbookName, "vi"),
    );
    out.push({ project: g.project, workbooks: sorted });
  }
  return out;
}

/**
 * Library browser (HL-04, DESIGN §4.4): client-side search + project filter +
 * sort over the workbook groups, with state mirrored to the URL (`?q&project&
 * sort`) so a filtered library is shareable. Empty result → EmptyState with a
 * "clear filters" action.
 */
export function LibraryBrowser({
  tenantSlug,
  groups,
  labels,
  initial,
}: {
  tenantSlug: string;
  groups: LibGroup[];
  labels: LibLabels;
  initial: { q: string; projectId: string; sort: LibSort };
}) {
  const [q, setQ] = useState(initial.q);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [sort, setSort] = useState<LibSort>(initial.sort);

  // Mirror state → URL (replaceState: shareable, no history spam, no navigation).
  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (projectId !== "all") params.set("project", projectId);
    if (sort !== "name") params.set("sort", sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, projectId, sort]);

  const filtered = useMemo(() => filterGroups(groups, { q, projectId, sort }), [groups, q, projectId, sort]);
  const hasFilters = q.trim() !== "" || projectId !== "all";

  const clear = () => {
    setQ("");
    setProjectId("all");
    setSort("name");
  };

  return (
    <div className="space-y-6">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sf-neutral-5" strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.searchPlaceholder}
            className="w-full rounded-lg border border-sf-neutral-3 bg-white py-2 pl-9 pr-3 text-body-sm text-sf-neutral-9 shadow-elev-0 outline-none transition-colors placeholder:text-sf-neutral-5 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
            aria-label={labels.searchPlaceholder}
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-caption text-sf-neutral-6">
          {labels.sortLabel}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as LibSort)}
            className="rounded-lg border border-sf-neutral-3 bg-white px-2.5 py-2 text-body-sm text-sf-neutral-9 shadow-elev-0 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
          >
            <option value="name">{labels.sortName}</option>
            <option value="views">{labels.sortViews}</option>
          </select>
        </label>
      </div>

      {/* Project filter chips */}
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={projectId === "all"} onClick={() => setProjectId("all")}>
            {labels.all}
          </FilterChip>
          {groups.map((g) => (
            <FilterChip key={g.project.id} active={projectId === g.project.id} onClick={() => setProjectId(g.project.id)}>
              {g.project.name}
            </FilterChip>
          ))}
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          title={labels.noMatch}
          action={
            hasFilters ? (
              <button onClick={clear} className="text-body-sm font-semibold text-brand transition-colors hover:text-brand-text">
                {labels.clearFilters}
              </button>
            ) : undefined
          }
        />
      ) : (
        filtered.map(({ project, workbooks }) => {
          const ProjectGlyph = projectIcon(project.name);
          return (
            <section key={project.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand ring-1 ring-brand/10">
                  <ProjectGlyph className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
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
                  <DashboardCard
                    key={wb.workbookId}
                    href={`/t/${tenantSlug}/dashboards/${wb.workbookSlug}`}
                    title={wb.workbookName}
                    subtitle={`${wb.viewCount} ${wb.viewCount === 1 ? "view" : "views"}`}
                    projectName={wb.projectName}
                    thumb={{ wb: wb.workbookSlug, view: wb.firstViewSlug }}
                    ctaLabel={labels.openDashboard}
                    pin={{
                      key: wb.workbookSlug,
                      kind: "workbook",
                      workbookSlug: wb.workbookSlug,
                      title: wb.workbookName,
                      workbookName: wb.workbookName,
                      projectName: wb.projectName,
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-caption font-medium transition-all duration-base ease-smooth ${
        active
          ? "border-brand bg-brand text-brand-on shadow-elev-1"
          : "border-sf-neutral-3 bg-white text-sf-neutral-7 hover:border-brand/40 hover:text-sf-neutral-9"
      }`}
    >
      {children}
    </button>
  );
}
