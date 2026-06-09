"use client";

import { type ReactElement, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReviewForm, type ProfileDraft } from "@/components/factory/ReviewForm";

interface StageEvent {
  job_id: string;
  stage: string;
  status: "pending" | "running" | "ok" | "skipped" | "error";
  detail?: string;
  error?: string;
  ts_ms: number;
  payload?: Record<string, unknown> | null;
}

interface ProvisionPayload {
  skipped?: boolean;
  tenant_slug?: string;
  portal_url?: string;
  company_name?: string;
  industry?: string;
  admin_email?: string;
  temp_password?: string;
}

const STAGE_ORDER = [
  "scrape", "profile", "schema", "confirm", "generate",
  "hyper", "publish", "workbook", "pulse", "brand", "provision",
];

const STAGE_LABELS: Record<string, string> = {
  scrape:    "Đọc website khách hàng",
  profile:   "Phân tích doanh nghiệp với Claude",
  schema:    "Thiết kế mô hình dữ liệu",
  confirm:   "Chờ xác nhận profile",
  generate:  "Sinh 2 năm dữ liệu tổng hợp",
  hyper:     "Tạo Hyper extract",
  publish:   "Publish lên Tableau Cloud",
  workbook:  "Tạo workbook & dashboards",
  pulse:     "Tạo Pulse KPI metrics",
  brand:     "Trích xuất brand colors",
  provision: "Provisioning portal tenant",
};

const STAGE_ICONS: Record<string, string> = {
  scrape: "🔍", profile: "🤖", schema: "🗂️", confirm: "👤",
  generate: "⚙️", hyper: "💾", publish: "📤", workbook: "📊",
  pulse: "📈", brand: "🎨", provision: "🏗️",
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

function PortalReady({ payload, jobId }: { payload: ProvisionPayload; jobId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border-2 border-green-400 bg-green-50 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">✅</span>
        <div>
          <h2 className="text-lg font-semibold text-green-900">
            Portal {payload.company_name ?? "tenant"} đã sẵn sàng!
          </h2>
          <p className="text-sm text-green-700">Pipeline hoàn thành — tất cả 11 stages.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {payload.tenant_slug && (
          <>
            <dt className="text-green-700 font-medium">Tenant slug</dt>
            <dd className="font-mono text-green-900">{payload.tenant_slug}</dd>
          </>
        )}
        {payload.industry && (
          <>
            <dt className="text-green-700 font-medium">Industry</dt>
            <dd className="text-green-900">{payload.industry}</dd>
          </>
        )}
        {payload.admin_email && (
          <>
            <dt className="text-green-700 font-medium">Admin email</dt>
            <dd className="font-mono text-green-900">{payload.admin_email}</dd>
          </>
        )}
        {payload.temp_password && (
          <>
            <dt className="text-green-700 font-medium">Password tạm thời</dt>
            <dd className="font-mono text-sm text-green-900 flex items-center gap-2">
              <span className="bg-green-100 rounded px-2 py-0.5">{payload.temp_password}</span>
              <button
                type="button"
                onClick={() => copy(payload.temp_password!)}
                className="text-xs text-green-600 underline hover:no-underline"
              >
                {copied ? "Đã copy" : "Copy"}
              </button>
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-3 pt-2">
        {payload.portal_url && (
          <a
            href={payload.portal_url}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Mở Portal →
          </a>
        )}
        {payload.portal_url && (
          <button
            type="button"
            onClick={() => copy(payload.portal_url!)}
            className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium hover:bg-[hsl(var(--muted))]"
          >
            📋 Copy URL
          </button>
        )}
        {payload.tenant_slug && (
          <a
            href={`/admin/tenants/${payload.tenant_slug}`}
            className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium hover:bg-[hsl(var(--muted))]"
          >
            Quản lý Tenant
          </a>
        )}
      </div>

      <p className="text-xs text-green-600 pt-1">
        Job ID: <span className="font-mono">{jobId}</span>
      </p>
    </div>
  );
}

export function FactoryProgress({ jobId }: { jobId: string }): ReactElement {
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [done, setDone] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [logCopied, setLogCopied] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/factory/${encodeURIComponent(jobId)}`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as StageEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.stage === "done" || (ev.status === "error" && ev.stage !== "hyper")) setDone(true);
      } catch {
        // ignore malformed event
      }
    };
    es.onerror = () => {
      setStreamError("Kết nối stream bị gián đoạn. Refresh để thử lại.");
      setDone(true);
      es.close();
    };
    return () => es.close();
  }, [jobId]);

  const byStage = new Map<string, StageEvent>();
  for (const e of events) byStage.set(e.stage, e);

  const profileEvent = byStage.get("profile");
  const profileDraft = useMemo<ProfileDraft | null>(() => {
    if (!profileEvent?.payload) return null;
    const p = profileEvent.payload as Record<string, unknown>;
    try {
      const draft: ProfileDraft = {
        company_name: String(p.company_name ?? ""),
        company_url: String(p.company_url ?? ""),
        industry: (p.industry as ProfileDraft["industry"]) ?? "retail-ecommerce",
        products: Array.isArray(p.products) ? (p.products as string[]) : [],
        segments: Array.isArray(p.segments) ? (p.segments as string[]) : [],
        geographies: Array.isArray(p.geographies) ? (p.geographies as ProfileDraft["geographies"]) : [],
        kpis: Array.isArray(p.kpis) ? (p.kpis as ProfileDraft["kpis"]) : [],
        market_events: Array.isArray(p.market_events) ? (p.market_events as ProfileDraft["market_events"]) : [],
        growth_trend_pct: Number(p.growth_trend_pct ?? 0),
      };
      if (typeof p.tagline === "string") draft.tagline = p.tagline;
      if (typeof p.logo_url === "string") draft.logo_url = p.logo_url;
      if (typeof p.sub_vertical === "string") draft.sub_vertical = p.sub_vertical;
      return draft;
    } catch {
      return null;
    }
  }, [profileEvent]);

  const confirmEvent = byStage.get("confirm");
  const awaitingConfirm = confirmEvent?.status === "running";

  // Provision payload for delivery screen
  const provisionEvent = byStage.get("provision");
  const provisionPayload = provisionEvent?.status === "ok"
    ? (provisionEvent.payload as ProvisionPayload | null)
    : null;

  // Progress calculation
  const completedStages = STAGE_ORDER.filter((s) => {
    const ev = byStage.get(s);
    return ev?.status === "ok" || ev?.status === "skipped";
  }).length;
  const runningStage = STAGE_ORDER.find((s) => byStage.get(s)?.status === "running");
  const progressPct = Math.round((completedStages / STAGE_ORDER.length) * 100);
  const hasError = STAGE_ORDER.some((s) => byStage.get(s)?.status === "error");

  const copyLogs = () => {
    const text = events
      .map((e) => `[${e.stage}] ${e.status}${e.detail ? " — " + e.detail : ""}${e.error ? " ERROR: " + e.error : ""}`)
      .join("\n");
    copyToClipboard(`Factory Job: ${jobId}\n\n${text}`);
    setLogCopied(true);
    setTimeout(() => setLogCopied(false), 2000);
  };

  return (
    <div className="mt-6 space-y-5">
      {/* Delivery screen */}
      {provisionPayload && !provisionPayload.skipped && (
        <PortalReady payload={provisionPayload} jobId={jobId} />
      )}

      {/* Review form during confirm stage */}
      {awaitingConfirm && profileDraft && (
        <ReviewForm jobId={jobId} initial={profileDraft} onSubmitted={() => {}} />
      )}

      {/* Progress bar */}
      {!provisionPayload && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <span>
              {done && !hasError
                ? "Hoàn thành"
                : runningStage
                  ? STAGE_LABELS[runningStage]
                  : hasError
                    ? "Đã xảy ra lỗi"
                    : "Đang chuẩn bị…"}
            </span>
            <span className="font-medium">{completedStages} / {STAGE_ORDER.length} stages ({progressPct}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                hasError ? "bg-red-400" : "bg-brand"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stage list */}
      <ol className="space-y-1.5">
        {STAGE_ORDER.map((stage) => {
          const ev = byStage.get(stage);
          const status = ev?.status ?? "pending";
          return (
            <li
              key={stage}
              className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                status === "ok"
                  ? "border-green-200 bg-green-50"
                  : status === "running"
                    ? "border-blue-200 bg-blue-50"
                    : status === "error"
                      ? "border-red-200 bg-red-50"
                      : status === "skipped"
                        ? "border-[hsl(var(--border))] bg-[hsl(var(--muted))] opacity-60"
                        : "border-[hsl(var(--border))]"
              }`}
            >
              <span className="mt-0.5 text-base leading-none" aria-hidden="true">
                {status === "ok" ? "✅" : status === "running" ? "⏳" : status === "error" ? "❌" : status === "skipped" ? "⏭️" : STAGE_ICONS[stage] ?? "⬜"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{STAGE_LABELS[stage] ?? stage}</div>
                {ev?.detail && (
                  <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">{ev.detail}</div>
                )}
                {ev?.error && (
                  <div className="text-xs text-red-700">❗ {ev.error}</div>
                )}
              </div>
              <span className="shrink-0 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {status}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Action bar: copy logs + retry */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={copyLogs}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[hsl(var(--muted))]"
        >
          {logCopied ? "✅ Đã copy logs" : "📋 Copy logs"}
        </button>
        {(done || streamError) && (
          <Link
            href="/factory/new"
            className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[hsl(var(--muted))]"
          >
            ← Tạo portal mới
          </Link>
        )}
        {hasError && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            🔄 Thử lại stream
          </button>
        )}
      </div>

      {streamError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {streamError}
        </div>
      )}
    </div>
  );
}
