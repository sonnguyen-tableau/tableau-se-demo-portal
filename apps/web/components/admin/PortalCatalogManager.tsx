"use client";

import { type FormEvent, type ReactElement, useState } from "react";
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

const INDUSTRIES = [
  { value: "retail-ecommerce", label: "Retail / E-commerce" },
  { value: "retail-banking", label: "Retail Banking" },
  { value: "retail-mall", label: "Retail & Mall Leasing" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "healthcare", label: "Healthcare" },
  { value: "logistics", label: "Logistics" },
];

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

  // ── Register form state ──────────────────────────────────────────────────────
  const [showRegister, setShowRegister] = useState(tenants.length === 0);
  const [regName, setRegName] = useState("");
  const [regSlug, setRegSlug] = useState("");
  const [regSlugTouched, setRegSlugTouched] = useState(false);
  const [regIndustry, setRegIndustry] = useState("retail-banking");
  const [regRegistering, setRegRegistering] = useState(false);

  function handleRegName(v: string) {
    setRegName(v);
    if (!regSlugTouched) setRegSlug(toSlug(v));
  }

  async function registerPortal(e: FormEvent) {
    e.preventDefault();
    setRegRegistering(true);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(regSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, industry: regIndustry }),
      });
      if (res.status === 404) {
        // Doesn't exist yet — create via provision endpoint
        const res2 = await fetch("/api/admin/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: regSlug, name: regName, industry: regIndustry }),
        });
        if (!res2.ok) throw new Error(`HTTP ${res2.status}: ${await res2.text()}`);
        const t = (await res2.json()) as TenantRecord;
        addRow(t);
      } else if (res.ok) {
        const t = (await res.json()) as TenantRecord;
        addRow(t);
      } else {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      setRegName(""); setRegSlug(""); setRegSlugTouched(false);
      setShowRegister(false);
      setGlobalMsg({ ok: true, text: `Portal "${regName}" đã được đăng ký.` });
    } catch (err) {
      setGlobalMsg({ ok: false, text: err instanceof Error ? err.message : "Thất bại" });
    } finally {
      setRegRegistering(false);
    }
  }

  function addRow(t: TenantRecord) {
    setRows((prev) => {
      if (prev.find((r) => r.slug === t.slug)) {
        return prev.map((r) => r.slug === t.slug
          ? { ...r, name: t.name, industry: t.industry ?? "" }
          : r);
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
      {/* Global message */}
      {globalMsg && (
        <div className={`rounded-md border px-4 py-2 text-sm flex items-center justify-between ${
          globalMsg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <span>{globalMsg.text}</span>
          <button onClick={() => setGlobalMsg(null)} className="text-xs underline opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* ── Register form ─────────────────────────────────────────────── */}
      {showRegister ? (
        <form
          onSubmit={registerPortal}
          className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/5 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand">Đăng ký portal có sẵn</p>
            {rows.length > 0 && (
              <button type="button" onClick={() => setShowRegister(false)}
                className="text-xs text-[hsl(var(--muted-foreground))] underline hover:no-underline">
                Huỷ
              </button>
            )}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Đăng ký portal có sẵn để quản lý trong catalog này. Sau khi đăng ký, bạn có thể gắn Tableau folders cho từng portal.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm col-span-1">
              <span className="mb-1 block text-xs font-medium">Tên portal *</span>
              <input
                value={regName}
                onChange={(e) => handleRegName(e.target.value)}
                placeholder="Salesforce Bank"
                required
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="block text-sm col-span-1">
              <span className="mb-1 block text-xs font-medium">Slug (URL) *</span>
              <input
                value={regSlug}
                onChange={(e) => { setRegSlug(e.target.value); setRegSlugTouched(true); }}
                placeholder="salesforce-bank"
                required
                pattern="[a-z0-9-]{2,48}"
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
              <span className="mt-0.5 block text-[10px] text-[hsl(var(--muted-foreground))]">
                → /t/{regSlug || "…"}
              </span>
            </label>
            <label className="block text-sm col-span-1">
              <span className="mb-1 block text-xs font-medium">Ngành</span>
              <select
                value={regIndustry}
                onChange={(e) => setRegIndustry(e.target.value)}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm bg-white outline-none focus:border-brand"
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={regRegistering || !regName || !regSlug}
              className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {regRegistering ? "Đang đăng ký…" : "Đăng ký portal"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowRegister(true)}
          className="w-full rounded-xl border-2 border-dashed border-[hsl(var(--border))] py-3 text-sm text-[hsl(var(--muted-foreground))] hover:border-brand hover:text-brand transition-colors"
        >
          + Đăng ký portal có sẵn
        </button>
      )}

      {/* ── Portal rows ───────────────────────────────────────────────── */}
      {rows.map((row) => (
        <div
          key={row.slug}
          className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
        >
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
                <span>{row.industry}</span>
                {row.allowedProjects.length > 0 ? (
                  <span className="text-brand">
                    {row.allowedProjects.length} folder{row.allowedProjects.length > 1 ? "s" : ""} được gắn
                  </span>
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
                  <button
                    onClick={() => update(row.slug, { allowedProjects: [] })}
                    className="shrink-0 text-xs text-[hsl(var(--muted-foreground))] underline hover:no-underline"
                  >
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
