"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteConfigPublic } from "@/lib/site-config";
import { INDUSTRY_OPTIONS } from "@/lib/site-config";

interface Props {
  mode: "create" | "edit";
  initial?: SiteConfigPublic;
}

const EMPTY: Omit<SiteConfigPublic, "createdAt" | "updatedAt"> & { connectedAppSecretValue: string } = {
  id: "",
  label: "",
  industries: [],
  tableauSite: "",
  tableauSiteName: "",
  tableauSiteVersion: "2026.1",
  connectedAppClientId: "",
  connectedAppSecretId: "",
  connectedAppSecretValue: "",
  mcpUrl: "",
  factoryUrl: "",
};

export function SiteConfigForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...EMPTY,
    ...(initial
      ? {
          id: initial.id,
          label: initial.label,
          industries: initial.industries,
          tableauSite: initial.tableauSite,
          tableauSiteName: initial.tableauSiteName,
          tableauSiteVersion: initial.tableauSiteVersion,
          connectedAppClientId: initial.connectedAppClientId,
          connectedAppSecretId: initial.connectedAppSecretId,
          mcpUrl: initial.mcpUrl ?? "",
          factoryUrl: initial.factoryUrl ?? "",
        }
      : {}),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleIndustry(ind: string) {
    setForm((f) => ({
      ...f,
      industries: f.industries.includes(ind as never)
        ? f.industries.filter((i) => i !== ind)
        : [...f.industries, ind as never],
    }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url =
        mode === "create" ? "/api/admin/sites" : `/api/admin/sites/${encodeURIComponent(form.id)}`;
      const method = mode === "create" ? "POST" : "PUT";
      const body = {
        ...form,
        mcpUrl: form.mcpUrl || undefined,
        factoryUrl: form.factoryUrl || undefined,
        // Only send secret if filled — empty string means "keep existing" on edit
        connectedAppSecretValue: form.connectedAppSecretValue || (mode === "edit" ? "" : form.connectedAppSecretValue),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
        throw new Error(json?.issues?.[0]?.message ?? `HTTP ${res.status}`);
      }
      router.push("/admin/sites");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ID + Label */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site ID" hint="Không đổi được sau khi tạo">
          <input
            value={form.id}
            onChange={(e) => set("id", e.target.value)}
            placeholder="site-retail-bank"
            pattern="[a-z0-9-]{2,48}"
            required
            disabled={mode === "edit"}
            className="input"
          />
        </Field>
        <Field label="Label">
          <input
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="Retail & Banking"
            required
            className="input"
          />
        </Field>
      </div>

      {/* Industries */}
      <Field label="Industries" hint="Chọn ≥1 industry site này phục vụ">
        <div className="flex flex-wrap gap-2 pt-1">
          {INDUSTRY_OPTIONS.map((ind) => (
            <button
              key={ind}
              type="button"
              onClick={() => toggleIndustry(ind)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                form.industries.includes(ind as never)
                  ? "border-[hsl(var(--brand,#1a56db))] bg-[hsl(var(--brand,#1a56db))] text-white"
                  : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
              }`}
            >
              {ind}
            </button>
          ))}
        </div>
      </Field>

      {/* Tableau */}
      <hr className="border-[hsl(var(--border))]" />
      <h3 className="text-sm font-semibold">Tableau Cloud</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site URL" hint="Toàn bộ URL kể cả #/site/...">
          <input
            type="url"
            value={form.tableauSite}
            onChange={(e) => set("tableauSite", e.target.value)}
            placeholder="https://10ax.online.tableau.com/#/site/your-site"
            required
            className="input"
          />
        </Field>
        <Field label="Site Name (contentUrl)">
          <input
            value={form.tableauSiteName}
            onChange={(e) => set("tableauSiteName", e.target.value)}
            placeholder="retail"
            required
            className="input"
          />
        </Field>
        <Field label="Site Version">
          <input
            value={form.tableauSiteVersion}
            onChange={(e) => set("tableauSiteVersion", e.target.value)}
            placeholder="2026.1"
            required
            className="input"
          />
        </Field>
      </div>

      {/* Connected App */}
      <hr className="border-[hsl(var(--border))]" />
      <h3 className="text-sm font-semibold">Connected App (Direct Trust)</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client ID (UUID)">
          <input
            value={form.connectedAppClientId}
            onChange={(e) => set("connectedAppClientId", e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
            className="input font-mono text-xs"
          />
        </Field>
        <Field label="Secret ID (UUID)">
          <input
            value={form.connectedAppSecretId}
            onChange={(e) => set("connectedAppSecretId", e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
            className="input font-mono text-xs"
          />
        </Field>
        <Field
          label="Secret Value"
          hint={mode === "edit" ? "Để trống để giữ nguyên giá trị hiện tại" : ""}
        >
          <input
            type="password"
            value={form.connectedAppSecretValue}
            onChange={(e) => set("connectedAppSecretValue", e.target.value)}
            placeholder={mode === "edit" ? "(giữ nguyên)" : "secret value"}
            required={mode === "create"}
            className="input font-mono text-xs"
          />
        </Field>
      </div>

      {/* Sidecars */}
      <hr className="border-[hsl(var(--border))]" />
      <h3 className="text-sm font-semibold">Railway Sidecars</h3>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Để trống để sử dụng TABLEAU_MCP_URL / FACTORY_URL env vars mặc định của deployment.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="MCP Sidecar URL">
          <input
            type="url"
            value={form.mcpUrl}
            onChange={(e) => set("mcpUrl", e.target.value)}
            placeholder="https://mcp-retail.railway.app"
            className="input"
          />
        </Field>
        <Field label="Factory Sidecar URL">
          <input
            type="url"
            value={form.factoryUrl}
            onChange={(e) => set("factoryUrl", e.target.value)}
            placeholder="https://factory-retail.railway.app"
            className="input"
          />
        </Field>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={busy || form.industries.length === 0}
          className="rounded-md bg-[hsl(var(--brand,#1a56db))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : mode === "create" ? "Create site" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>}
      {children}
    </label>
  );
}
