"use client";

import { type FormEvent, type ReactElement, useEffect, useState } from "react";
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
  expanded: boolean;
  projects: ProjectOption[];
  projectsLoading: boolean;
  saving: boolean;
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
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

  // ── Demo projects from Tableau (shared across all portals) ──────────────────
  const [demoProjects, setDemoProjects] = useState<ProjectOption[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    setDemoLoading(true);
    fetch("/api/admin/tableau/demo-projects")
      .then((r) => r.json())
      .then((d: { projects?: ProjectOption[] }) => setDemoProjects(d.projects ?? []))
      .catch(() => {})
      .finally(() => setDemoLoading(false));
  }, []);

  // ── Register form state ──────────────────────────────────────────────────────
  const [showRegister, setShowRegister] = useState(tenants.length === 0);
  const [regMode, setRegMode] = useState<"existing" | "new">("existing");
  // existing mode
  const [regSelectedProject, setRegSelectedProject] = useState<ProjectOption | null>(null);
  // new mode
  const [regNewName, setRegNewName] = useState("");
  const [regSlug, setRegSlug] = useState("");
  const [regSlugTouched, setRegSlugTouched] = useState(false);
  const [regRegistering, setRegRegistering] = useState(false);

  function handleNewName(v: string) {
    setRegNewName(v);
    if (!regSlugTouched) setRegSlug(toSlug(v));
  }

  function handleSelectProject(proj: ProjectOption) {
    setRegSelectedProject(proj);
    if (!regSlugTouched) setRegSlug(toSlug(proj.name));
  }

  async function registerPortal(e: FormEvent) {
    e.preventDefault();
    setRegRegistering(true);

    const isNew = regMode === "new";
    const projectName = isNew ? regNewName : (regSelectedProject?.name ?? "");
    const slug = regSlug || toSlug(projectName);
    const name = projectName;

    try {
      // Try PATCH first (in case it already exists in KV)
      let res = await fetch(`/api/admin/tenants/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, industry: projectName }),
      });

      let t: TenantRecord;
      if (res.status === 404 || !res.ok) {
        // Create new, optionally creating Tableau project
        res = await fetch("/api/admin/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            name,
            industry: projectName,
            createTableauProject: isNew,
            tableauProjectName: projectName,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        t = (await res.json()) as TenantRecord;

        // If new mode, refresh demo projects list
        if (isNew) {
          fetch("/api/admin/tableau/demo-projects")
            .then((r) => r.json())
            .then((d: { projects?: ProjectOption[] }) => setDemoProjects(d.projects ?? []))
            .catch(() => {});
        }
      } else {
        t = (await res.json()) as TenantRecord;
      }

      // Wire allowedProjects automatically for existing mode
      if (!isNew && regSelectedProject) {
        await fetch(`/api/admin/tenants/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowedProjects: [regSelectedProject.path] }),
        });
        t = { ...t, allowedProjects: [regSelectedProject.path] };
      }

      addRow(t);
      setRegNewName(""); setRegSlug(""); setRegSlugTouched(false);
      setRegSelectedProject(null);
      setShowRegister(false);
      setGlobalMsg({ ok: true, text: `Portal "${name}" đã được đăng ký.${isNew ? " Tableau project Demo/" + projectName + " đã được tạo." : ""}` });
    } catch (err) {
      setGlobalMsg({ ok: false, text: err instanceof Error ? err.message : "Thất bại" });
    } finally {
      setRegRegistering(false);
    }
  }

  function addRow(t: TenantRecord) {
    setRows((prev) => {
      if (prev.find((r) => r.slug === t.slug)) {
        return prev.map((r) =>
          r.slug === t.slug
            ? { ...r, name: t.name, industry: t.industry ?? "", allowedProjects: t.allowedProjects ?? [] }
            : r,
        );
      }
      return [...prev, {
        slug: t.slug, name: t.name, industry: t.industry ?? "",
        isDefault: t.isDefault ?? false, allowedProjects: t.allowedProjects ?? [],
        expanded: false, projects: [], projectsLoading: false, saving: false,
      }];
    });
  }

  // ── Row helpers ──────────────────────────────────────────────────────────────

  function update(slug: string, patch: Partial<PortalRow>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));
  }

  async function toggleExpand(slug: string) {
    const row = rows.find((r) => r.slug === slug)!;
    if (row.expanded) { update(slug, { expanded: false }); return; }
    update(slug, { expanded: true });
    if (row.projects.length > 0) return;
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
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(slug)}/set-default`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((prev) => prev.map((r) => ({ ...r, isDefault: r.slug === slug })));
      setGlobalMsg({ ok: true, text: `"${rows.find((r) => r.slug === slug)?.name}" đã được set làm portal mặc định.` });
    } catch (e) {
      setGlobalMsg({ ok: false, text: e instanceof Error ? e.message : "Thất bại" });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {globalMsg && (
        <div className={`rounded-md border px-4 py-2 text-sm flex items-center justify-between ${
          globalMsg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <span>{globalMsg.text}</span>
          <button onClick={() => setGlobalMsg(null)} className="text-xs underline opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* ── Register form ──────────────────────────────────────────────── */}
      {showRegister ? (
        <form onSubmit={registerPortal} className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand">Thêm portal vào catalog</p>
            {rows.length > 0 && (
              <button type="button" onClick={() => setShowRegister(false)}
                className="text-xs text-[hsl(var(--muted-foreground))] underline hover:no-underline">
                Huỷ
              </button>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 rounded-lg border border-[hsl(var(--border))] p-1 w-fit">
            <button
              type="button"
              onClick={() => setRegMode("existing")}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                regMode === "existing"
                  ? "bg-brand text-white"
                  : "text-[hsl(var(--muted-foreground))] hover:text-foreground"
              }`}
            >
              Gắn project có sẵn
            </button>
            <button
              type="button"
              onClick={() => setRegMode("new")}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                regMode === "new"
                  ? "bg-brand text-white"
                  : "text-[hsl(var(--muted-foreground))] hover:text-foreground"
              }`}
            >
              Tạo project mới
            </button>
          </div>

          {regMode === "existing" ? (
            /* ── Existing: pick from Demo/* list ── */
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium mb-1.5">Chọn project từ Demo/ trên Tableau site</p>
                {demoLoading ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Đang tải từ Tableau…</p>
                ) : demoProjects.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Không tìm thấy projects con của Demo/ — Tableau PAT chưa cấu hình hoặc chưa có portal nào.
                    Chuyển sang <button type="button" onClick={() => setRegMode("new")} className="underline font-medium">Tạo project mới</button>.
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                    {demoProjects.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[hsl(var(--muted))]">
                        <input
                          type="radio"
                          name="demoProject"
                          checked={regSelectedProject?.id === p.id}
                          onChange={() => handleSelectProject(p)}
                          className="accent-brand"
                        />
                        <span className="font-mono text-sm">{p.path}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {regSelectedProject && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium">
                    Slug (URL) — mặc định từ tên project
                  </span>
                  <input
                    value={regSlug}
                    onChange={(e) => { setRegSlug(e.target.value); setRegSlugTouched(true); }}
                    placeholder="salesforce-bank"
                    pattern="[a-z0-9-]{2,48}"
                    required
                    className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono outline-none focus:border-brand"
                  />
                  <span className="mt-0.5 block text-[10px] text-[hsl(var(--muted-foreground))]">
                    → /t/{regSlug || "…"}
                  </span>
                </label>
              )}
            </div>
          ) : (
            /* ── New: enter name, create project on Tableau ── */
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Tên project / portal *</span>
                <input
                  value={regNewName}
                  onChange={(e) => handleNewName(e.target.value)}
                  placeholder="VinCommerce"
                  required
                  className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <span className="mt-0.5 block text-[10px] text-[hsl(var(--muted-foreground))]">
                  Tạo Tableau project: Demo/{regNewName || "…"}
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Slug (URL) *</span>
                <input
                  value={regSlug}
                  onChange={(e) => { setRegSlug(e.target.value); setRegSlugTouched(true); }}
                  placeholder="vincommerce"
                  required
                  pattern="[a-z0-9-]{2,48}"
                  className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono outline-none focus:border-brand"
                />
                <span className="mt-0.5 block text-[10px] text-[hsl(var(--muted-foreground))]">
                  → /t/{regSlug || "…"}
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                regRegistering ||
                (regMode === "existing" ? !regSelectedProject || !regSlug : !regNewName || !regSlug)
              }
              className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {regRegistering
                ? "Đang xử lý…"
                : regMode === "new"
                  ? "Tạo project & đăng ký portal"
                  : "Đăng ký portal"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowRegister(true)}
          className="w-full rounded-xl border-2 border-dashed border-[hsl(var(--border))] py-3 text-sm text-[hsl(var(--muted-foreground))] hover:border-brand hover:text-brand transition-colors"
        >
          + Thêm portal vào catalog
        </button>
      )}

      {/* ── Portal rows ───────────────────────────────────────────────── */}
      {rows.map((row) => (
        <div key={row.slug} className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
          <div className="flex items-center gap-3 px-4 py-3">
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

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">{row.name}</span>
                <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">/t/{row.slug}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                {row.allowedProjects.length > 0 ? (
                  row.allowedProjects.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] text-brand">
                      📁 {p}
                    </span>
                  ))
                ) : (
                  <span className="text-amber-600">Chưa gắn folder — xem toàn bộ site</span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/t/${row.slug}`}
                target="_blank"
                className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
              >
                Xem →
              </Link>
              <button
                onClick={() => toggleExpand(row.slug)}
                className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
              >
                {row.expanded ? "Thu gọn ▲" : "Gắn folders ▼"}
              </button>
            </div>
          </div>

          {row.expanded && (
            <div className="border-t border-[hsl(var(--border))] px-4 py-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Tableau project folders</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    Tick folder muốn hiển thị trong portal này. Bỏ chọn tất cả = xem toàn bộ site.
                  </p>
                </div>
                {row.allowedProjects.length > 0 && (
                  <button onClick={() => update(row.slug, { allowedProjects: [] })}
                    className="shrink-0 text-xs text-[hsl(var(--muted-foreground))] underline hover:no-underline">
                    Bỏ chọn tất cả
                  </button>
                )}
              </div>

              {row.allowedProjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {row.allowedProjects.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                      📁 {p}
                      <button onClick={() => toggleProject(row.slug, p)} className="ml-0.5 text-brand/60 hover:text-brand" aria-label={`Remove ${p}`}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {row.projectsLoading ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Đang tải danh sách folders từ Tableau…</p>
              ) : row.projects.length > 0 ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                  {row.projects.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]">
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
                  Không lấy được danh sách folders — Tableau PAT chưa cấu hình.
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
