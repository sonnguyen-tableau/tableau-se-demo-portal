"use client";

import { type FormEvent, type ReactElement, useState } from "react";
import Link from "next/link";
import type { SiteConfigPublic } from "@/lib/site-config";

interface Props {
  sites: SiteConfigPublic[];
  factoryConfigured: boolean;
}

type Step = 1 | 2 | 3;

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              n < current
                ? "bg-green-500 text-white"
                : n === current
                  ? "bg-brand text-white"
                  : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
            }`}
          >
            {n < current ? "✓" : n}
          </div>
          {n < total && (
            <div className={`h-px w-8 ${n < current ? "bg-green-400" : "bg-[hsl(var(--border))]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const STEP_TITLES: Record<Step, string> = {
  1: "Website khách hàng",
  2: "Tableau Site & credentials",
  3: "Admin & xác nhận",
};

export function LaunchWizard({ sites, factoryConfigured }: Props): ReactElement {
  const [step, setStep] = useState<Step>(1);
  const [url, setUrl] = useState(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("factory:url") ?? "") : "",
  );
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [adminEmail, setAdminEmail] = useState(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("factory:adminEmail") ?? "") : "",
  );
  const [tenantSlug, setTenantSlug] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSite = sites.find((s) => s.id === siteId);

  // Persist across page reloads
  const persist = (field: string, value: string) => {
    try {
      localStorage.setItem(`factory:${field}`, value);
    } catch {
      // ignore
    }
  };

  const testConnection = async () => {
    if (!siteId) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${encodeURIComponent(siteId)}/verify`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setVerifyResult(data);
    } catch {
      setVerifyResult({ ok: false, message: "Không thể kết nối — kiểm tra lại URL sidecar." });
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/factory/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          tenant_slug: tenantSlug || undefined,
          site_id: siteId || undefined,
          admin_email: adminEmail || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text.slice(0, 300));
        return;
      }
      // Follow redirect (fetch follows by default) or parse JSON
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      const data = (await res.json()) as { job_id?: string };
      if (data.job_id) {
        window.location.href = `/factory/${data.job_id}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6">
      <StepIndicator current={step} total={3} />
      <h2 className="mt-4 text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
        Bước {step} / 3 — {STEP_TITLES[step]}
      </h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-5">
        {/* ── Step 1: URL ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Website khách hàng *</span>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  persist("url", e.target.value);
                }}
                placeholder="https://vincommerce.vn"
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Pipeline sẽ scrape trang này để phân tích ngành, KPI và branding.
              </p>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tenant slug (tuỳ chọn)</span>
              <input
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="vincommerce"
                pattern="[a-z0-9-]{2,48}"
                maxLength={48}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Nếu để trống, tự động tạo từ hostname. Ví dụ: vincommerce → /t/vincommerce
              </p>
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!url}
                onClick={() => setStep(2)}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              >
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Site & Test Connection ───────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {sites.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Chưa có Tableau site nào được đăng ký.{" "}
                <Link href="/admin/sites/new" className="underline font-medium">
                  Tạo site mới
                </Link>{" "}
                trước khi tiếp tục.
              </div>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Tableau Site *</span>
                <select
                  value={siteId}
                  onChange={(e) => {
                    setSiteId(e.target.value);
                    setVerifyResult(null);
                  }}
                  className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.tableauSiteName})
                    </option>
                  ))}
                </select>
                {selectedSite && (
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {selectedSite.tableauSite}
                  </p>
                )}
              </label>
            )}

            {/* Test Connection */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!siteId || verifying}
                onClick={testConnection}
                className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-40"
              >
                {verifying ? "Đang kiểm tra…" : "🔌 Test Connection"}
              </button>
              {verifyResult && (
                <span
                  className={`text-sm font-medium ${verifyResult.ok ? "text-green-700" : "text-red-700"}`}
                >
                  {verifyResult.ok ? "✅" : "❌"} {verifyResult.message}
                </span>
              )}
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]"
              >
                ← Quay lại
              </button>
              <button
                type="button"
                disabled={!siteId || sites.length === 0}
                onClick={() => setStep(3)}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              >
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Admin email + summary + launch ────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Email admin đầu tiên (tuỳ chọn)</span>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value);
                  persist("adminEmail", e.target.value);
                }}
                placeholder="admin@vincommerce.vn"
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                User này sẽ được tạo tự động sau khi pipeline hoàn tất. Password tạm thời hiển thị ở màn hình kết quả.
              </p>
            </label>

            {/* Summary card */}
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm space-y-1.5">
              <div className="font-semibold mb-2">Tóm tắt</div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">URL:</span>
                <span className="font-mono text-xs truncate max-w-[60%]">{url}</span>
              </div>
              {tenantSlug && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Slug:</span>
                  <span className="font-mono text-xs">{tenantSlug}</span>
                </div>
              )}
              {selectedSite && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Site:</span>
                  <span className="text-xs">{selectedSite.label}</span>
                </div>
              )}
              {adminEmail && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Admin:</span>
                  <span className="text-xs">{adminEmail}</span>
                </div>
              )}
              {!factoryConfigured && (
                <p className="mt-2 text-xs text-amber-700 border-t border-amber-200 pt-2">
                  ⚠️ FACTORY_URL chưa được cấu hình — pipeline sẽ thất bại.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]"
              >
                ← Quay lại
              </button>
              <button
                type="submit"
                disabled={submitting || !url || !factoryConfigured}
                className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90"
              >
                {submitting ? "Đang khởi động…" : "🚀 Launch Portal"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
