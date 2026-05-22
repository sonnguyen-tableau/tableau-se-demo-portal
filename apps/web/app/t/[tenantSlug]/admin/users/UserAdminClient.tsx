"use client";

import { useState, useMemo, useTransition } from "react";
import type { PortalUserPublic } from "@/lib/portal-users";

interface Workbook {
  id: string;
  name: string;
  contentUrl: string;
  projectId: string;
  projectName: string;
}

interface ProjectGroup {
  projectName: string;
  workbooks: Workbook[];
}

interface Props {
  tenantSlug: string;
  tenantId: string;
  tenantName: string;
  initialUsers: PortalUserPublic[];
  projectGroups: ProjectGroup[];
}

type EditingUser = {
  email: string;
  password: string;
  tenantId: string;
  tenantName: string;
  region: "NA" | "EMEA" | "APAC" | "";
  groups: string;
  allowedWorkbookIds: Set<string> | null; // null = all
  isNew: boolean;
};

function blankUser(tenantId: string, tenantName: string): EditingUser {
  return {
    email: "",
    password: "",
    tenantId,
    tenantName,
    region: "",
    groups: "",
    allowedWorkbookIds: null,
    isNew: true,
  };
}

function userToEditing(u: PortalUserPublic): EditingUser {
  return {
    email: u.email,
    password: "",
    tenantId: u.tenantId,
    tenantName: u.tenantName,
    region: u.region ?? "",
    groups: u.groups.join(", "),
    allowedWorkbookIds: u.allowedWorkbookIds !== null ? new Set(u.allowedWorkbookIds) : null,
    isNew: false,
  };
}

export function UserAdminClient({ tenantId, tenantName, initialUsers, projectGroups }: Props) {
  const [users, setUsers] = useState<PortalUserPublic[]>(initialUsers);
  const [editing, setEditing] = useState<EditingUser | null>(null);
  const [search, setSearch] = useState("");
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [status, setStatus] = useState<{ type: "ok" | "error"; msg: string } | null>(null);

  const totalWorkbooks = projectGroups.reduce((s, p) => s + p.workbooks.length, 0);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          !search ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.tenantId.toLowerCase().includes(search.toLowerCase()),
      ),
    [users, search],
  );

  function openNew() {
    setEditing(blankUser(tenantId, tenantName));
    setStatus(null);
  }

  function openEdit(u: PortalUserPublic) {
    setEditing(userToEditing(u));
    setStatus(null);
  }

  function closeEditor() {
    setEditing(null);
    setStatus(null);
  }

  function toggleWorkbook(id: string) {
    if (!editing) return;
    setEditing((prev) => {
      if (!prev) return prev;
      if (prev.allowedWorkbookIds === null) {
        // switch from "all" to explicit list — start with all except this one
        const allIds = new Set(projectGroups.flatMap((p) => p.workbooks.map((w) => w.id)));
        allIds.delete(id);
        return { ...prev, allowedWorkbookIds: allIds };
      }
      const next = new Set(prev.allowedWorkbookIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, allowedWorkbookIds: next };
    });
  }

  function toggleProject(workbooks: Workbook[]) {
    if (!editing) return;
    setEditing((prev) => {
      if (!prev) return prev;
      const current = prev.allowedWorkbookIds;
      const ids = workbooks.map((w) => w.id);

      if (current === null) {
        // switch from all → explicit: all workbooks except this project's
        const allIds = new Set(projectGroups.flatMap((p) => p.workbooks.map((w) => w.id)));
        ids.forEach((id) => allIds.delete(id));
        return { ...prev, allowedWorkbookIds: allIds };
      }

      const allChecked = ids.every((id) => current.has(id));
      const next = new Set(current);
      if (allChecked) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return { ...prev, allowedWorkbookIds: next };
    });
  }

  function setAllWorkbooks(unrestricted: boolean) {
    if (!editing) return;
    setEditing((prev) => {
      if (!prev) return prev;
      if (unrestricted) return { ...prev, allowedWorkbookIds: null };
      const allIds = new Set(projectGroups.flatMap((p) => p.workbooks.map((w) => w.id)));
      return { ...prev, allowedWorkbookIds: allIds };
    });
  }

  function save() {
    if (!editing) return;
    startSave(async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: editing.email,
            ...(editing.password ? { password: editing.password } : {}),
            tenantId: editing.tenantId,
            tenantName: editing.tenantName,
            ...(editing.region ? { region: editing.region } : {}),
            groups: editing.groups
              .split(",")
              .map((g) => g.trim())
              .filter(Boolean),
            allowedWorkbookIds:
              editing.allowedWorkbookIds === null
                ? null
                : [...editing.allowedWorkbookIds],
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: unknown };
          setStatus({ type: "error", msg: JSON.stringify(err.error ?? "Lỗi khi lưu") });
          return;
        }
        // Refresh user list
        const listRes = await fetch("/api/admin/users");
        const data = (await listRes.json()) as { users: PortalUserPublic[] };
        setUsers(data.users);
        setStatus({ type: "ok", msg: editing.isNew ? "Đã tạo user" : "Đã cập nhật" });
        setEditing(null);
      } catch {
        setStatus({ type: "error", msg: "Lỗi kết nối" });
      }
    });
  }

  function deleteUser(email: string) {
    if (!confirm(`Xoá user ${email}?`)) return;
    startDelete(async () => {
      try {
        await fetch("/api/admin/users", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setUsers((prev) => prev.filter((u) => u.email !== email));
      } catch {
        setStatus({ type: "error", msg: "Xoá thất bại" });
      }
    });
  }

  const allowedCount =
    editing?.allowedWorkbookIds === null
      ? totalWorkbooks
      : (editing?.allowedWorkbookIds?.size ?? 0);

  return (
    <div className="flex gap-6 min-h-0" style={{ minHeight: "600px" }}>
      {/* ── Left: user list ─────────────────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-sf-neutral-10">Quản lý người dùng</h2>
            <p className="mt-0.5 text-xs text-sf-neutral-5">{users.length} người dùng</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-sf-blue-70 px-3 py-2 text-sm font-semibold text-white shadow-sf-sm hover:bg-sf-blue-80 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Thêm
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sf-neutral-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm email, tenant…"
            className="w-full rounded-lg border border-sf-neutral-3 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-sf-neutral-4 focus:border-sf-blue-70 focus:ring-2 focus:ring-sf-blue-10 transition"
          />
        </div>

        {/* Status toast */}
        {status && (
          <div className={`rounded-lg px-3 py-2 text-sm font-medium ${status.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {status.type === "ok" ? "✓ " : "✗ "}{status.msg}
          </div>
        )}

        {/* User cards */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-sf-neutral-5">Chưa có người dùng nào.</p>
          )}
          {filtered.map((u) => {
            const isSelected = editing?.email === u.email && !editing.isNew;
            const wb = u.allowedWorkbookIds;
            return (
              <div
                key={u.email}
                className={`group flex items-start justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                  isSelected
                    ? "border-sf-blue-70 bg-sf-blue-10"
                    : "border-sf-neutral-3 bg-white hover:border-sf-neutral-5"
                }`}
                onClick={() => openEdit(u)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sf-blue-60 text-xs font-bold text-white">
                      {u.email.slice(0, 1).toUpperCase()}
                    </div>
                    <p className="truncate text-sm font-medium text-sf-neutral-9">{u.email}</p>
                  </div>
                  <p className="mt-1 pl-9 text-xs text-sf-neutral-5">
                    {u.tenantId} ·{" "}
                    {wb === null
                      ? <span className="text-emerald-600">Tất cả workbooks</span>
                      : <span>{wb.length} workbooks</span>}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteUser(u.email); }}
                  disabled={deleting}
                  className="ml-2 shrink-0 rounded p-1 text-sf-neutral-4 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-30"
                  title="Xoá user"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: editor ───────────────────────────────────────────────── */}
      {editing ? (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto rounded-xl border border-sf-neutral-3 bg-white p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-sf-neutral-10">
              {editing.isNew ? "Tạo người dùng mới" : `Chỉnh sửa: ${editing.email}`}
            </h3>
            <button onClick={closeEditor} className="rounded p-1 text-sf-neutral-4 hover:text-sf-neutral-9 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Basic info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email *">
              <input
                type="email"
                value={editing.email}
                readOnly={!editing.isNew}
                onChange={(e) => setEditing((p) => p && ({ ...p, email: e.target.value }))}
                className="field-input"
                placeholder="user@company.com"
              />
            </Field>
            <Field label={editing.isNew ? "Mật khẩu *" : "Mật khẩu mới (để trống = giữ nguyên)"}>
              <input
                type="password"
                value={editing.password}
                onChange={(e) => setEditing((p) => p && ({ ...p, password: e.target.value }))}
                className="field-input"
                placeholder={editing.isNew ? "Tối thiểu 8 ký tự" : "••••••••"}
              />
            </Field>
            <Field label="Tenant ID *">
              <input
                type="text"
                value={editing.tenantId}
                onChange={(e) => setEditing((p) => p && ({ ...p, tenantId: e.target.value }))}
                className="field-input"
                placeholder="salesforce-bank"
              />
            </Field>
            <Field label="Tenant Name *">
              <input
                type="text"
                value={editing.tenantName}
                onChange={(e) => setEditing((p) => p && ({ ...p, tenantName: e.target.value }))}
                className="field-input"
                placeholder="Salesforce Bank"
              />
            </Field>
            <Field label="Region">
              <select
                value={editing.region}
                onChange={(e) => setEditing((p) => p && ({ ...p, region: e.target.value as EditingUser["region"] }))}
                className="field-input"
              >
                <option value="">— Không chọn —</option>
                <option value="NA">NA</option>
                <option value="EMEA">EMEA</option>
                <option value="APAC">APAC</option>
              </select>
            </Field>
            <Field label="Groups (phân cách bởi dấu phẩy)">
              <input
                type="text"
                value={editing.groups}
                onChange={(e) => setEditing((p) => p && ({ ...p, groups: e.target.value }))}
                className="field-input"
                placeholder="internal, sales"
              />
            </Field>
          </div>

          {/* Workbook permissions */}
          <div className="border-t border-sf-neutral-3 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-sf-neutral-10">Quyền xem workbooks</h4>
                <p className="mt-0.5 text-xs text-sf-neutral-5">
                  Đang cho phép <strong>{allowedCount}</strong> / {totalWorkbooks} workbooks
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAllWorkbooks(true)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    editing.allowedWorkbookIds === null
                      ? "bg-sf-blue-70 text-white"
                      : "border border-sf-neutral-3 text-sf-neutral-7 hover:border-sf-blue-70"
                  }`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setAllWorkbooks(false)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    editing.allowedWorkbookIds !== null
                      ? "bg-sf-blue-70 text-white"
                      : "border border-sf-neutral-3 text-sf-neutral-7 hover:border-sf-blue-70"
                  }`}
                >
                  Tuỳ chọn
                </button>
              </div>
            </div>

            {editing.allowedWorkbookIds !== null && (
              <div className="space-y-4 max-h-80 overflow-y-auto rounded-lg border border-sf-neutral-3 p-4">
                {projectGroups.map((pg) => {
                  const ids = pg.workbooks.map((w) => w.id);
                  const checkedCount = ids.filter((id) => editing.allowedWorkbookIds?.has(id)).length;
                  const allChecked = checkedCount === ids.length;
                  const indeterminate = checkedCount > 0 && !allChecked;
                  return (
                    <div key={pg.projectName}>
                      <label className="mb-2 flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = indeterminate; }}
                          onChange={() => toggleProject(pg.workbooks)}
                          className="h-4 w-4 rounded border-sf-neutral-3 text-sf-blue-70"
                        />
                        <span className="text-sm font-semibold text-sf-neutral-9">{pg.projectName}</span>
                        <span className="text-xs text-sf-neutral-5">{checkedCount}/{ids.length}</span>
                      </label>
                      <div className="ml-6 grid gap-1.5 sm:grid-cols-2">
                        {pg.workbooks.map((wb) => {
                          const checked = editing.allowedWorkbookIds?.has(wb.id) ?? false;
                          return (
                            <label
                              key={wb.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition ${
                                checked
                                  ? "border-sf-blue-20 bg-sf-blue-10 text-sf-neutral-9"
                                  : "border-transparent bg-sf-neutral-1 text-sf-neutral-6 hover:border-sf-neutral-3"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleWorkbook(wb.id)}
                                className="h-3.5 w-3.5 shrink-0 rounded border-sf-neutral-3 text-sf-blue-70"
                              />
                              <span className="truncate">{wb.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-sf-neutral-3 pt-4">
            <button
              onClick={closeEditor}
              className="rounded-lg border border-sf-neutral-3 px-4 py-2 text-sm font-medium text-sf-neutral-7 hover:border-sf-neutral-5 transition"
            >
              Huỷ
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-sf-blue-70 px-5 py-2 text-sm font-semibold text-white shadow-sf-sm hover:bg-sf-blue-80 disabled:opacity-50 transition"
            >
              {saving ? "Đang lưu…" : editing.isNew ? "Tạo user" : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sf-neutral-3 bg-sf-neutral-1 text-sf-neutral-5">
          <svg className="h-10 w-10 text-sf-neutral-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">Chọn người dùng để chỉnh sửa hoặc nhấn <strong>Thêm</strong></p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-sf-neutral-7">{label}</label>
      {children}
    </div>
  );
}
