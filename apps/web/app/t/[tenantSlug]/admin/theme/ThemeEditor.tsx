"use client";

import { useState, useTransition } from "react";
import type { LogoLayout, TenantTheme, Tone } from "@/lib/tenant-theme";

const FONT_OPTIONS = ["Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans Pro"];
const LOGO_LAYOUT_OPTIONS: { value: LogoLayout; label: string; desc: string }[] = [
  { value: "icon", label: "Biểu tượng", desc: "Logo vuông/gọn, hiện kèm tên công ty bên cạnh" },
  { value: "wordmark", label: "Logo chữ (ngang)", desc: "Logo đã có sẵn tên → hiện to, không kèm chữ trùng" },
];
const TONE_OPTIONS: { value: Tone; label: string; desc: string }[] = [
  { value: "professional", label: "Chuyên nghiệp", desc: "Nghiêm túc, rõ ràng, tin cậy" },
  { value: "playful", label: "Năng động", desc: "Thân thiện, sáng tạo, gần gũi" },
  { value: "technical", label: "Kỹ thuật", desc: "Chính xác, chi tiết, chuyên sâu" },
];

interface Props {
  initial: TenantTheme;
  tenantId: string;
}

export function ThemeEditor({ initial, tenantId }: Props) {
  const [form, setForm] = useState<TenantTheme>(initial);
  const [saving, startSave] = useTransition();
  const [resetting, startReset] = useTransition();
  const [status, setStatus] = useState<"idle" | "ok" | "error" | "reset-ok">("idle");

  function set<K extends keyof TenantTheme>(key: K, value: TenantTheme[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  function save() {
    startSave(async () => {
      try {
        const res = await fetch("/api/admin/theme", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, tenantId }),
        });
        setStatus(res.ok ? "ok" : "error");
        if (res.ok) {
          // Reload to apply new theme to layout
          window.location.reload();
        }
      } catch {
        setStatus("error");
      }
    });
  }

  function resetToDefault() {
    const ok = window.confirm(
      "Khôi phục về Salesforce Bank mặc định?\n\nTất cả tuỳ chỉnh logo, màu sắc và font sẽ bị xoá.",
    );
    if (!ok) return;
    startReset(async () => {
      try {
        const res = await fetch("/api/admin/theme", { method: "DELETE" });
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const fresh = (await res.json()) as TenantTheme;
        setForm(fresh);
        setStatus("reset-ok");
        window.location.reload();
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-sf-neutral-3 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-sf-neutral-10">Tuỳ chỉnh giao diện</h2>
          <p className="mt-1 text-sm text-sf-neutral-6">
            Thay đổi logo, màu sắc và tên công ty hiển thị trong portal.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status === "ok" && <span className="text-sm text-emerald-600 font-medium">✓ Đã lưu</span>}
          {status === "reset-ok" && <span className="text-sm text-emerald-600 font-medium">✓ Đã khôi phục</span>}
          {status === "error" && <span className="text-sm text-red-600 font-medium">Lỗi khi lưu</span>}
          <button
            onClick={resetToDefault}
            disabled={resetting || saving}
            title="Khôi phục về Salesforce Bank mặc định"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2 text-sm font-semibold text-sf-neutral-7 transition-all duration-base ease-smooth hover:border-sf-neutral-4 hover:bg-sf-neutral-2 hover:text-sf-neutral-9 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8" />
            </svg>
            {resetting ? "Đang khôi phục…" : "Trở về mặc định"}
          </button>
          <button
            onClick={save}
            disabled={saving || resetting}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-brand to-sf-blue-80 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition-all duration-base ease-smooth hover:shadow-glow-brand active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Form */}
        <div className="space-y-6">
          {/* Company info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-sf-neutral-6">Thông tin công ty</h3>

            <Field label="Tên công ty">
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="Salesforce Bank"
                className={inputCls}
              />
            </Field>

            <Field label="URL Logo" hint="Dán URL ảnh logo (PNG/SVG, nền trong suốt)">
              <input
                type="url"
                value={form.logoUrl ?? ""}
                onChange={(e) => set("logoUrl", e.target.value || undefined)}
                placeholder="https://example.com/logo.png"
                className={inputCls}
              />
            </Field>

            <Field label="Kiểu logo" hint="Logo dạng chữ ngang (đã chứa tên công ty) sẽ hiện to trên nền trắng, không kèm chữ trùng">
              <div className="grid gap-3 sm:grid-cols-2">
                {LOGO_LAYOUT_OPTIONS.map((o) => {
                  const active = (form.logoLayout ?? "icon") === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set("logoLayout", o.value)}
                      className={`rounded-xl border p-4 text-left transition ${
                        active ? "border-sf-blue-70 bg-sf-blue-10" : "border-sf-neutral-3 bg-white hover:border-sf-blue-70"
                      }`}
                    >
                      <p className={`text-sm font-semibold ${active ? "text-sf-blue-80" : "text-sf-neutral-9"}`}>{o.label}</p>
                      <p className="mt-0.5 text-xs text-sf-neutral-5">{o.desc}</p>
                    </button>
                  );
                })}
              </div>
            </Field>
          </section>

          {/* Colors */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-sf-neutral-6">Màu sắc</h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ColorField
                label="Màu chính"
                hint="Nút, link, accent"
                value={form.primaryColor}
                onChange={(v) => set("primaryColor", v)}
              />
              <ColorField
                label="Màu phụ"
                hint="Highlight, badge"
                value={form.secondaryColor}
                onChange={(v) => set("secondaryColor", v)}
              />
              <ColorField
                label="Màu nền sidebar"
                hint="Nền tối sidebar"
                value={form.neutralColor}
                onChange={(v) => set("neutralColor", v)}
              />
              <ColorField
                label="Màu chữ sidebar"
                hint="Chữ trên nền sidebar"
                value={form.sidebarTextColor ?? "#ffffff"}
                onChange={(v) => set("sidebarTextColor", v)}
              />
            </div>
          </section>

          {/* Font */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-sf-neutral-6">Font chữ</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => set("fontFamily", f)}
                  style={{ fontFamily: f }}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    form.fontFamily === f
                      ? "border-sf-blue-70 bg-sf-blue-10 text-sf-blue-80 font-semibold"
                      : "border-sf-neutral-3 bg-white text-sf-neutral-8 hover:border-sf-blue-70"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </section>

          {/* Tone */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-sf-neutral-6">Phong cách AI</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => set("tone", t.value)}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.tone === t.value
                      ? "border-sf-blue-70 bg-sf-blue-10"
                      : "border-sf-neutral-3 bg-white hover:border-sf-blue-70"
                  }`}
                >
                  <p className={`text-sm font-semibold ${form.tone === t.value ? "text-sf-blue-80" : "text-sf-neutral-9"}`}>
                    {t.label}
                  </p>
                  <p className="mt-0.5 text-xs text-sf-neutral-5">{t.desc}</p>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-sf-neutral-6">Xem trước</h3>
          <Preview theme={form} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2.5 text-sm text-sf-neutral-9 outline-none placeholder:text-sf-neutral-4 focus:border-sf-blue-70 focus:ring-2 focus:ring-sf-blue-10 transition";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-sf-neutral-8">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-sf-neutral-5">{hint}</p>}
      {children}
    </div>
  );
}

function ColorField({
  label, hint, value, onChange,
}: {
  label: string; hint: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-sf-neutral-8">{label}</label>
      <p className="mb-1.5 text-xs text-sf-neutral-5">{hint}</p>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded-lg border border-sf-neutral-3 p-0.5"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
          className="w-28 rounded-lg border border-sf-neutral-3 bg-white px-2.5 py-2 font-mono text-sm text-sf-neutral-9 outline-none focus:border-sf-blue-70 focus:ring-2 focus:ring-sf-blue-10 transition"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function Preview({ theme }: { theme: TenantTheme }) {
  return (
    <div className="overflow-hidden rounded-xl border border-sf-neutral-3 shadow-sf-sm">
      {/* Sidebar preview */}
      {theme.logoLayout === "wordmark" && theme.logoUrl ? (
        <div className="flex flex-col gap-2 px-3 py-3" style={{ backgroundColor: theme.neutralColor }}>
          <div className="flex items-center justify-center rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme.logoUrl} alt="logo" className="h-7 w-auto max-h-7 object-contain" />
          </div>
          <p className="px-0.5 text-[10px] uppercase tracking-widest" style={{ color: `${theme.sidebarTextColor ?? "#ffffff"}80` }}>Analytics Portal</p>
        </div>
      ) : (
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ backgroundColor: theme.neutralColor }}
        >
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt="logo" className="h-7 w-7 rounded object-contain" />
          ) : (
            <div
              className="flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-white"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {theme.companyName.slice(0, 1)}
            </div>
          )}
          <div>
            <p className="text-xs font-bold leading-tight" style={{ fontFamily: theme.fontFamily, color: theme.sidebarTextColor ?? "#ffffff" }}>
              {theme.companyName || "Tên công ty"}
            </p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: `${theme.sidebarTextColor ?? "#ffffff"}80` }}>Analytics Portal</p>
          </div>
        </div>
      )}

      {/* Nav items preview */}
      <div className="space-y-0.5 px-2 py-2" style={{ backgroundColor: theme.neutralColor }}>
        {["Trang chủ", "Dashboards", "AI Agent"].map((item, i) => (
          <div
            key={item}
            className="rounded px-2 py-1.5 text-xs"
            style={{
              backgroundColor: i === 1 ? theme.primaryColor + "33" : "transparent",
              color: i === 1 ? (theme.sidebarTextColor ?? "#ffffff") : `${theme.sidebarTextColor ?? "#ffffff"}99`,
              fontFamily: theme.fontFamily,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      {/* Content area preview */}
      <div className="bg-white p-4 space-y-3">
        <div
          className="h-8 rounded-lg text-white text-xs font-semibold flex items-center px-3"
          style={{ backgroundColor: theme.primaryColor, fontFamily: theme.fontFamily }}
        >
          Xem Dashboards
        </div>
        <div className="flex gap-2">
          <div className="h-3 flex-1 rounded bg-sf-neutral-2" />
          <div
            className="h-3 w-16 rounded"
            style={{ backgroundColor: theme.secondaryColor + "66" }}
          />
        </div>
        <div className="h-3 w-3/4 rounded bg-sf-neutral-2" />
        <div className="h-3 w-1/2 rounded bg-sf-neutral-2" />
      </div>
    </div>
  );
}
