"use client";

import { useState, useMemo, useTransition } from "react";
import type { LiveWorkbook } from "@/lib/tableau-rest";

interface ProjectGroup {
  projectName: string;
  workbooks: LiveWorkbook[];
}

interface Props {
  tenantSlug: string;
  projects: ProjectGroup[];
  initialHiddenIds: string[];
}

export function CatalogFilterAdmin({ projects, initialHiddenIds }: Props) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set(initialHiddenIds));
  const [search, setSearch] = useState("");
  const [saving, startSave] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");

  const totalWorkbooks = projects.reduce((s, p) => s + p.workbooks.length, 0);
  const hiddenCount = hiddenIds.size;
  const visibleCount = totalWorkbooks - hiddenCount;

  const searchLower = search.toLowerCase();
  const filteredProjects = useMemo(
    () =>
      projects
        .map((p) => ({
          ...p,
          workbooks: p.workbooks.filter(
            (wb) =>
              !searchLower ||
              wb.name.toLowerCase().includes(searchLower) ||
              p.projectName.toLowerCase().includes(searchLower),
          ),
        }))
        .filter((p) => p.workbooks.length > 0),
    [projects, searchLower],
  );

  function toggleWorkbook(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaveStatus("idle");
  }

  function toggleProject(projectName: string, workbooks: LiveWorkbook[]) {
    const allHidden = workbooks.every((wb) => hiddenIds.has(wb.id));
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (allHidden) {
        workbooks.forEach((wb) => next.delete(wb.id));
      } else {
        workbooks.forEach((wb) => next.add(wb.id));
      }
      return next;
    });
    setSaveStatus("idle");
    void projectName;
  }

  function save() {
    startSave(async () => {
      try {
        const res = await fetch("/api/admin/catalog-filter", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hiddenWorkbookIds: [...hiddenIds] }),
        });
        setSaveStatus(res.ok ? "ok" : "error");
      } catch {
        setSaveStatus("error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-sf-neutral-3 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-sf-neutral-10">Cấu hình catalog</h2>
          <p className="mt-1 text-sm text-sf-neutral-6">
            Chọn workbook hiển thị trong portal. Workbook bị ẩn sẽ không xuất hiện ở Dashboards và AI Agent.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saveStatus === "ok" && (
            <span className="text-sm text-emerald-600 font-medium">✓ Đã lưu</span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-red-600 font-medium">Lỗi khi lưu</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-sf-blue-70 px-4 py-2 text-sm font-semibold text-white shadow-sf-sm transition hover:bg-sf-blue-80 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-sf-neutral-6">
          Tổng: <strong className="text-sf-neutral-9">{totalWorkbooks}</strong> workbooks
        </span>
        <span className="text-emerald-700">
          Hiển thị: <strong>{visibleCount}</strong>
        </span>
        <span className="text-slate-500">
          Ẩn: <strong>{hiddenCount}</strong>
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sf-neutral-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm workbook hoặc dự án…"
          className="w-full rounded-lg border border-sf-neutral-3 bg-white py-2 pl-9 pr-3 text-sm text-sf-neutral-9 outline-none placeholder:text-sf-neutral-4 focus:border-sf-blue-70 focus:ring-2 focus:ring-sf-blue-10 transition"
        />
      </div>

      {/* Project sections */}
      <div className="space-y-6">
        {filteredProjects.map((p) => {
          const allVisible = p.workbooks.every((wb) => !hiddenIds.has(wb.id));
          const allHidden = p.workbooks.every((wb) => hiddenIds.has(wb.id));
          const indeterminate = !allVisible && !allHidden;

          return (
            <section key={p.projectName}>
              {/* Project header */}
              <div className="mb-3 flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allVisible}
                    ref={(el) => {
                      if (el) el.indeterminate = indeterminate;
                    }}
                    onChange={() => toggleProject(p.projectName, p.workbooks)}
                    className="h-4 w-4 rounded border-sf-neutral-3 text-sf-blue-70 focus:ring-sf-blue-10"
                  />
                  <span className="text-base font-semibold text-sf-neutral-10">{p.projectName}</span>
                </label>
                <span className="rounded-full bg-sf-blue-10 px-2 py-0.5 text-xs font-medium text-sf-blue-80">
                  {p.workbooks.filter((wb) => !hiddenIds.has(wb.id)).length} / {p.workbooks.length}
                </span>
                <div className="h-px flex-1 bg-sf-neutral-3" />
              </div>

              {/* Workbook grid */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {p.workbooks.map((wb) => {
                  const isHidden = hiddenIds.has(wb.id);
                  return (
                    <label
                      key={wb.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                        isHidden
                          ? "border-sf-neutral-3 bg-sf-neutral-1 opacity-60"
                          : "border-sf-neutral-3 bg-white hover:border-sf-blue-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleWorkbook(wb.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-sf-neutral-3 text-sf-blue-70 focus:ring-sf-blue-10"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-sf-neutral-9 leading-tight">{wb.name}</p>
                        <p className="mt-0.5 text-xs text-sf-neutral-5 font-mono truncate">{wb.contentUrl}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {filteredProjects.length === 0 && (
        <p className="py-12 text-center text-sm text-sf-neutral-5">Không tìm thấy workbook nào.</p>
      )}
    </div>
  );
}
