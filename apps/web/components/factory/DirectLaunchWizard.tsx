"use client";

import { type FormEvent, type ReactElement, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type Industry =
  | "retail-ecommerce"
  | "retail-banking"
  | "retail-mall"
  | "manufacturing"
  | "healthcare"
  | "logistics";

interface BrandValues {
  primary_color: string;
  secondary_color: string;
  neutral_color: string;
  font_family: string;
  logo_url: string;
  tone: "professional" | "playful" | "technical";
}

// Per-industry generator param definitions for the dynamic form
interface ParamDef {
  key: string;
  label: string;
  type: "int" | "float" | "percent";
  default: number;
  min?: number;
  max?: number;
  hint?: string;
}

const INDUSTRY_PARAMS: Record<Industry, ParamDef[]> = {
  "retail-ecommerce": [
    { key: "base_daily_orders", label: "Đơn hàng / ngày (baseline)", type: "int", default: 70, min: 1, hint: "Số đơn hàng trung bình mỗi ngày trước khi tính seasonality" },
    { key: "yoy_growth_pct", label: "Tăng trưởng YoY (%)", type: "float", default: 12, min: -50, max: 200 },
    { key: "seed", label: "Random seed", type: "int", default: 42, min: 0, hint: "Giữ nguyên để reproducible" },
  ],
  "retail-banking": [
    { key: "base_daily_transactions", label: "Giao dịch / ngày (baseline)", type: "int", default: 320, min: 10 },
    { key: "seed", label: "Random seed", type: "int", default: 42, min: 0 },
  ],
  "retail-mall": [
    { key: "n_winmart", label: "Số siêu thị WinMart", type: "int", default: 12, min: 1, max: 200 },
    { key: "n_winmart_plus", label: "Số cửa hàng WinMart+", type: "int", default: 85, min: 1, max: 1000 },
    { key: "n_malls", label: "Số Vincom Center", type: "int", default: 6, min: 1, max: 20 },
    { key: "n_products", label: "Số SKU sản phẩm", type: "int", default: 3000, min: 100, max: 50000 },
    { key: "n_lessees", label: "Số khách thuê mặt bằng", type: "int", default: 280, min: 10 },
    { key: "base_daily_sales_winmart", label: "Giao dịch/ngày/WinMart", type: "int", default: 1800, min: 100 },
    { key: "base_daily_sales_winmart_plus", label: "Giao dịch/ngày/WinMart+", type: "int", default: 320, min: 10 },
    { key: "target_occupancy_rate", label: "Tỷ lệ lấp đầy mục tiêu (%)", type: "percent", default: 87, min: 0, max: 100 },
    { key: "yoy_growth_pct", label: "Tăng trưởng YoY (%)", type: "float", default: 8, min: -50, max: 200 },
    { key: "seed", label: "Random seed", type: "int", default: 42, min: 0 },
  ],
  "manufacturing": [
    { key: "n_plants", label: "Số nhà máy", type: "int", default: 8, min: 1, max: 100 },
    { key: "lines_per_plant", label: "Dây chuyền / nhà máy", type: "int", default: 6, min: 1, max: 50 },
    { key: "n_products", label: "Số sản phẩm", type: "int", default: 60, min: 1, max: 5000 },
    { key: "n_suppliers", label: "Số nhà cung cấp", type: "int", default: 24, min: 1, max: 500 },
    { key: "seed", label: "Random seed", type: "int", default: 42, min: 0 },
  ],
  "healthcare": [
    { key: "n_patients", label: "Số bệnh nhân", type: "int", default: 4200, min: 100 },
    { key: "n_providers", label: "Số bác sĩ / nhân viên y tế", type: "int", default: 180, min: 10 },
    { key: "n_beds", label: "Số giường bệnh", type: "int", default: 320, min: 10 },
    { key: "seed", label: "Random seed", type: "int", default: 42, min: 0 },
  ],
  "logistics": [
    { key: "n_carriers", label: "Số nhà vận chuyển", type: "int", default: 18, min: 1 },
    { key: "n_hubs", label: "Số trung tâm phân phối", type: "int", default: 14, min: 1 },
    { key: "n_lanes", label: "Số tuyến đường", type: "int", default: 70, min: 1 },
    { key: "n_vehicles", label: "Số phương tiện", type: "int", default: 240, min: 1 },
    { key: "n_customers", label: "Số khách hàng doanh nghiệp", type: "int", default: 380, min: 10 },
    { key: "seed", label: "Random seed", type: "int", default: 42, min: 0 },
  ],
};

const INDUSTRY_LABELS: Record<Industry, string> = {
  "retail-ecommerce": "Retail / E-commerce",
  "retail-banking": "Retail Banking",
  "retail-mall": "Retail & Mall Leasing (VinCommerce)",
  "manufacturing": "Manufacturing / Operations",
  "healthcare": "Healthcare (synthetic)",
  "logistics": "Logistics / Supply Chain",
};

// ─── Step indicator ────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: "Thông tin công ty",
  2: "Tham số dữ liệu",
  3: "Brand & màu sắc",
  4: "Site & Admin",
};

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} className="flex items-center gap-1.5">
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
            <div className={`h-px w-6 ${n < current ? "bg-green-400" : "bg-[hsl(var(--border))]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Color swatch input ────────────────────────────────────────────────────────

function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const isValid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isValid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-[hsl(var(--border))] p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1A56DB"
          maxLength={7}
          className={`w-28 rounded-md border px-2 py-1.5 font-mono text-sm outline-none focus:ring-1 focus:ring-brand ${
            isValid ? "border-[hsl(var(--border))]" : "border-red-400"
          }`}
        />
        {isValid && (
          <span className="inline-block h-5 w-5 rounded-full border border-white/30 shadow-sm" style={{ backgroundColor: value }} />
        )}
      </div>
      {hint && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
    </label>
  );
}

// ─── Numeric param input ───────────────────────────────────────────────────────

function ParamField({ def, value, onChange }: { def: ParamDef; value: number; onChange: (v: number) => void }) {
  const handleChange = (raw: string) => {
    const n = def.type === "float" || def.type === "percent" ? parseFloat(raw) : parseInt(raw, 10);
    if (!isNaN(n)) onChange(n);
  };
  // percent is stored as 0–100 in UI but sent as 0–1 to API
  return (
    <label className="block text-sm">
      <span className="mb-0.5 flex items-center justify-between">
        <span className="font-medium">{def.label}</span>
        <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
          {def.type === "percent" ? `${value}%` : value}
        </span>
      </span>
      <input
        type="range"
        min={def.min ?? 0}
        max={def.max ?? (def.type === "percent" ? 100 : def.default * 10)}
        step={def.type === "float" || def.type === "percent" ? 0.5 : 1}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full accent-brand"
      />
      {def.hint && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{def.hint}</p>}
    </label>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  factoryConfigured: boolean;
}

export function DirectLaunchWizard({ factoryConfigured }: Props): ReactElement {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Company identity
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("https://");
  const [industry, setIndustry] = useState<Industry>("retail-ecommerce");
  const [tagline, setTagline] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");

  // Step 2 — Generator params (keyed by param.key → number value)
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const all: Record<string, number> = {};
    for (const defs of Object.values(INDUSTRY_PARAMS)) {
      for (const d of defs) all[d.key] = d.default;
    }
    return all;
  });

  // Step 3 — Brand
  const [brand, setBrand] = useState<BrandValues>({
    primary_color: "#0176d3",
    secondary_color: "#1b96ff",
    neutral_color: "#032d60",
    font_family: "Inter",
    logo_url: "",
    tone: "professional",
  });

  // Step 4 — Admin only (no site selector — all demos share the default site)
  const [adminEmail, setAdminEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive slug from company name
  const handleCompanyName = (v: string) => {
    setCompanyName(v);
    if (!tenantSlug || tenantSlug === toSlug(companyName)) {
      setTenantSlug(toSlug(v));
    }
  };

  const currentParams = INDUSTRY_PARAMS[industry];

  const setParam = (key: string, value: number) => {
    setParamValues((prev) => ({ ...prev, [key]: value }));
  };


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build generator_params — only include fields for current industry; convert percent to fraction
    const genParams: Record<string, number | string[]> = {};
    for (const d of currentParams) {
      const v = paramValues[d.key] ?? d.default;
      genParams[d.key] = d.type === "percent" ? v / 100 : v;
    }

    const payload = {
      company_name: companyName,
      company_url: companyUrl,
      industry,
      tagline: tagline || undefined,
      generator_params: genParams,
      brand: {
        primary_color: brand.primary_color,
        secondary_color: brand.secondary_color,
        neutral_color: brand.neutral_color,
        font_family: brand.font_family || "Inter",
        tone: brand.tone,
        ...(brand.logo_url ? { logo_url: brand.logo_url } : {}),
      },
      tenant_slug: tenantSlug || undefined,
      admin_email: adminEmail || undefined,
    };

    try {
      const res = await fetch("/api/factory/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text.slice(0, 400));
        return;
      }
      const data = (await res.json()) as { job_id?: string; redirect?: string };
      if (data.redirect) {
        window.location.href = data.redirect;
      } else if (data.job_id) {
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
      <StepIndicator current={step} total={4} />
      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        Bước {step} / 4 — {STEP_TITLES[step]}
      </h2>

      <form onSubmit={handleSubmit} className="mt-4">

        {/* ── Step 1: Company identity ────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tên công ty *</span>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => handleCompanyName(e.target.value)}
                placeholder="VinCommerce"
                maxLength={120}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Website *</span>
              <input
                type="url"
                required
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://vincommerce.vn"
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                Dùng cho metadata — không scrape trong direct mode.
              </p>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ngành nghề *</span>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry)}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
              >
                {(Object.entries(INDUSTRY_LABELS) as [Industry, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tagline (tuỳ chọn)</span>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Hệ sinh thái bán lẻ hiện đại nhất Việt Nam"
                maxLength={280}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tenant slug</span>
              <input
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(toSlug(e.target.value))}
                placeholder="vincommerce"
                pattern="[a-z0-9-]{2,48}"
                maxLength={48}
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 font-mono text-sm outline-none focus:border-brand"
              />
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                Portal URL: /t/{tenantSlug || "…"}
              </p>
            </label>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!companyName || !companyUrl || companyUrl === "https://"}
                onClick={() => setStep(2)}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              >
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Generator params ────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              <span className="font-medium text-[hsl(var(--foreground))]">{INDUSTRY_LABELS[industry]}</span>
              {" "}— Kéo slider để tuỳ chỉnh quy mô dữ liệu tổng hợp.
            </div>

            <div className="space-y-4">
              {currentParams.map((d) => (
                <ParamField
                  key={d.key}
                  def={d}
                  value={paramValues[d.key] ?? d.default}
                  onChange={(v) => setParam(d.key, v)}
                />
              ))}
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]">← Quay lại</button>
              <button type="button" onClick={() => setStep(3)} className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:opacity-90">Tiếp theo →</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Brand ──────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Màu chính (Primary)" value={brand.primary_color} onChange={(v) => setBrand({ ...brand, primary_color: v })} hint="Buttons, links, focus rings" />
              <ColorField label="Màu phụ (Secondary)" value={brand.secondary_color} onChange={(v) => setBrand({ ...brand, secondary_color: v })} hint="Hover states, accents" />
              <ColorField label="Màu sidebar (Neutral)" value={brand.neutral_color} onChange={(v) => setBrand({ ...brand, neutral_color: v })} hint="Sidebar background" />
            </div>

            {/* Live preview */}
            <div
              className="rounded-lg border border-[hsl(var(--border))] p-4 text-sm space-y-2"
              style={{ background: brand.neutral_color }}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">Preview sidebar</p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: brand.primary_color }} />
                <span className="text-white/70 text-xs">{companyName || "Company Name"}</span>
              </div>
              <button
                type="button"
                className="rounded-md px-3 py-1 text-xs font-medium text-white"
                style={{ background: brand.primary_color }}
              >
                Primary action
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Font family</span>
                <select
                  value={brand.font_family}
                  onChange={(e) => setBrand({ ...brand, font_family: e.target.value })}
                  className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
                >
                  {["Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Nunito", "Source Sans Pro"].map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">Tone</span>
                <select
                  value={brand.tone}
                  onChange={(e) => setBrand({ ...brand, tone: e.target.value as BrandValues["tone"] })}
                  className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
                >
                  <option value="professional">Professional</option>
                  <option value="playful">Playful</option>
                  <option value="technical">Technical</option>
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Logo URL (tuỳ chọn)</span>
              <input
                type="url"
                value={brand.logo_url}
                onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })}
                placeholder="https://vincommerce.vn/logo.png"
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
              />
            </label>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]">← Quay lại</button>
              <button type="button" onClick={() => setStep(4)} className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:opacity-90">Tiếp theo →</button>
            </div>
          </div>
        )}

        {/* ── Step 4: Admin & Submit ──────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            {/* Info: all demos share the default Tableau site */}
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Portal sẽ được tạo trong project folder <strong>Demo/{companyName || tenantSlug}</strong> trên Tableau site mặc định.
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Email admin đầu tiên (tuỳ chọn)</span>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@vincommerce.vn"
                className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
              />
            </label>

            {/* Summary card */}
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm space-y-1.5">
              <p className="font-semibold mb-2">Tóm tắt</p>
              <Row label="Công ty" value={companyName} />
              <Row label="Ngành" value={INDUSTRY_LABELS[industry]} />
              <Row label="Slug" value={tenantSlug || "(auto)"} mono />
              <Row label="Tableau folder" value={`Demo/${companyName || tenantSlug}`} mono />
              {adminEmail && <Row label="Admin" value={adminEmail} />}
              <div className="flex justify-between pt-1">
                <span className="text-[hsl(var(--muted-foreground))]">Brand</span>
                <div className="flex items-center gap-1.5">
                  {[brand.primary_color, brand.secondary_color, brand.neutral_color].map((c, i) => (
                    <span key={i} className="inline-block h-4 w-4 rounded-full border border-white/30" style={{ background: c }} />
                  ))}
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{brand.font_family}</span>
                </div>
              </div>
              {!factoryConfigured && (
                <p className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-700">
                  ⚠️ FACTORY_URL chưa được cấu hình.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            )}

            <div className="flex justify-between pt-1">
              <button type="button" onClick={() => setStep(3)} className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]">← Quay lại</button>
              <button
                type="submit"
                disabled={submitting || !companyName || !factoryConfigured}
                className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90"
              >
                {submitting ? "Đang khởi động…" : "🚀 Tạo Portal"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-[hsl(var(--muted-foreground))]">{label}:</span>
      <span className={`truncate text-right ${mono ? "font-mono text-xs" : "text-xs"}`}>{value}</span>
    </div>
  );
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}
