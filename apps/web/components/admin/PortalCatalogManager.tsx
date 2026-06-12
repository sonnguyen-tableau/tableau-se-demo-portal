"use client";

import { type ReactElement, useState } from "react";
import Link from "next/link";
import type { TenantRecord } from "@/lib/tenants";

interface ProjectOption {
  id: string;
  name: string;
  path: string;
}

interface PortalRow {
  slug: string;
  name: string;
  industry: string;
  isDefault: boolean;
  allowedProjects: string[];
  // UI state
  expanded: boolean;
  projects: ProjectOption[];
  projectsLoading: boolean;
  saving: boolean;
}

interface Props {
  tenants: TenantRecord[];
}

export function PortalCatalogManager({ tenants }: Props): ReactElement {
  const [rows, setRows] = useState<PortalRow[]>(() =>
    tenants.map((t) => ({
      slug: t.slug,
      name: t.name,
      industry: t.industry ?? "",
      isDefault: t.isDefault ?? false,
      allowedProjects: t.allowedProjects ?? [],
      expanded: false,
      projects: [],
      projectsLoading: false,
      saving: false,
    })),
  );
  const [globalMsg, setGlobalMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function update(slug: string, patch: Partial<PortalRow>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));
  }

  // Expand/collapse a row and lazy-load its project list
  async function toggleExpand(slug: string) {
    const row = rows.find((r) => r.slug === slug)!;
    if (row.expanded) {
      update(slug, { expanded: false });
      return;
    }
    update(slug, { expanded: true });
    if (row.projects.length > 0) return; // already loaded
    update(slug, { projectsLoading: true });
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(slug)}/projects`);
      const data = (await res.json()) as { projects?: ProjectOption[] };
      update(slug, { projects: data.projects ?? [], projectsLoading: false });
    } catch {
      update(slug, { projectsLoading: false });
    }
  }

  function toggleProject(slug: string, path: string) {
    const row = rows.find((r) => r.slug === slug)!;
    const next = row.allowedProjects.includes(path)
      ? row.allowedProjects.filter((p) => p !== path)
      : [...row.allowedProjects, path];
    update(slug, { allowedProjects: next });
  }

  async function saveProjects(slug: string) {
    const row = rows.find((r) => r.slug === slug)!;
    update(slug, { saving: true });
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedProjects: row.allowedProjects.length > 0 ? row.allowedProjects : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGlobalMsg({ ok: true, text: `Đã lưu cấu hình cho "${row.name}"` });
    } catch (e) {
      setGlobalMsg({ ok: false, text: e instanceof Error ? e.message : "Lưu thất bại" });
    } finally {
      update(slug, { saving: false });
    }
  }

  async function setDefault(slug: string) {
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(slug)}/set-default`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Update all rows locally
      setRows((prev) => prev.map((r) => ({ ...r, isDefault: r.slug === slug })));
      setGlobalMsg({ ok: true, text: `"${rows.find((r) => r.slug === slug)?.name}" đã được set làm portal mặc định.` });
    } catch (e) {
      setGlobalMsg({ ok: false, text: e instanceof Error ? e.message : "Thất bại" });
    }
  }

  return (
    <div className="space-y-3">
      {globalMsg && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            globalMsg.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {globalMsg.text}
          <button
            onClick={() => setGlobalMsg(null)}
            className="ml-3 text-xs underline opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-[hsl(var(--border))] px-6 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Chưa có portal nào.{" "}
          <Link href="/factory/direct" className="text-brand underline">
            Tạo portal đầu tiên →
          </Link>
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.slug}
          className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
        >
          {/* ── Row header ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Default badge / set button */}
            {row.isDefault ? (
              <span className="shrink-0 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Mặc định
              </span>
            ) : (
              <button
                onClick={() => setDefault(row.slug)}
                className="shrink-0 rounded-full border border-[hsl(var(--border))] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))] hover:border-brand hover:text-brand"
              >
                Set mặc định
              </button>
            )}

            {/* Name + info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">{row.name}</span>
                <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                  /t/{row.slug}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <span>{row.industry}</span>
                {row.allowedProjects.length > 0 ? (
                  <span className="text-brand">
                    {row.allowedProjects.length} folder
                    {row.allowedProjects.length > 1 ? "s" : ""} được gắn
                  </span>
                ) : (
                  <span className="text-amber-600">Xem tất cả folders</span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`/t/${row.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
              >
                Xem →
              </a>
              <button
                onClick={() => toggleExpand(row.slug)}
                className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
              >
                {row.expanded ? "Thu gọn ▲" : "Cấu hình folders ▼"}
              </button>
            </div>
          </div>

          {/* ── Expanded: folder picker ────────────────────────────────── */}
          {row.expanded && (
            <div className="border-t border-[hsl(var(--border))] px-4 py-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Tableau project folders</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    Chọn folders được hiển thị trong portal này. Bỏ chọn tất cả = xem toàn bộ site.
                  </p>
                </div>
                {row.allowedProjects.length > 0 && (
                  <button
                    onClick={() => update(row.slug, { allowedProjects: [] })}
                    className="shrink-0 text-xs text-[hsl(var(--muted-foreground))] underline hover:no-underline"
                  >
                    Bỏ chọn tất cả
                  </button>
                )}
              </div>

              {/* Selected tags */}
              {row.allowedProjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {row.allowedProjects.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand"
                    >
                      📁 {p}
                      <button
                        onClick={() => toggleProject(row.slug, p)}
                        className="ml-0.5 text-brand/60 hover:text-brand"
                        aria-label={`Remove ${p}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Project list */}
              {row.projectsLoading ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Đang tải danh sách folders từ Tableau…
                </p>
              ) : row.projects.length > 0 ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                  {row.projects.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]"
                    >
                      <input
                        type="checkbox"
                        checked={row.allowedProjects.includes(p.path)}
                        onChange={() => toggleProject(row.slug, p.path)}
                        className="accent-brand"
                      />
                      <span className="flex-1 font-mono text-xs">{p.path}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Không lấy được danh sách folders — Tableau site chưa kết nối hoặc PAT chưa cấu hình.
                </p>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => saveProjects(row.slug)}
                  disabled={row.saving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {row.saving ? "Đang lưu…" : "Lưu cấu hình"}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
