"use client";

import { type FormEvent, type ReactElement, useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantRecord } from "@/lib/tenants";
import type { SiteConfigPublic } from "@/lib/site-config";

interface Props {
  tenant: TenantRecord;
  availableSites?: SiteConfigPublic[];
}

export function TenantAdminForm({ tenant, availableSites = [] }: Props): ReactElement {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [siteId, setSiteId] = useState(tenant.siteId ?? "");
  const [primary, setPrimary] = useState("#1a56db");
  const [secondary, setSecondary] = useState("#f59e0b");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const saveRename = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...(siteId ? { siteId } : { siteId: null }) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInfo("Saved.");
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const saveTheme = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.slug)}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColor: primary,
          secondaryColor: secondary,
          logoUrl: logoUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInfo("Theme updated.");
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (): Promise<void> => {
    if (!confirm(`Archive tenant ${tenant.slug}? Generated Tableau artifacts remain in place.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/admin/tenants");
    } catch (e) {
      setError(e instanceof Error ? e.message : "archive failed");
      setBusy(false);
    }
  };

  const destroy = async (): Promise<void> => {
    if (!confirm(`Permanently delete tenant ${tenant.slug}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenant.slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/admin/tenants");
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
      {info ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{info}</div>
      ) : null}

      <form
        onSubmit={saveRename}
        className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4"
      >
        <h2 className="text-sm font-semibold">General settings</h2>
        <label className="block text-sm">
          <span className="mb-1 block">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2"
            maxLength={120}
            required
          />
        </label>
        {availableSites.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block">Tableau Site</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 bg-white"
            >
              <option value="">(dùng env vars mặc định)</option>
              {availableSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.tableauSiteName})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>

      <form onSubmit={saveTheme} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="text-sm font-semibold">Re-brand</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block">Primary color</span>
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-full" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Secondary color</span>
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-10 w-full" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block">Logo URL</span>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save theme
        </button>
      </form>

      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="text-xs text-red-900">
          Archive hides the tenant from the portal; delete removes it entirely. Tableau-side
          artifacts (data sources, workbooks, Pulse metrics) are NOT removed automatically.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={archive}
            disabled={busy}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-900 disabled:opacity-50"
          >
            Archive
          </button>
          <button
            onClick={destroy}
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
