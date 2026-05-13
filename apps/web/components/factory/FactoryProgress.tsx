"use client";

import { type ReactElement, useEffect, useMemo, useState } from "react";
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

const STAGE_ORDER = [
  "scrape",
  "profile",
  "schema",
  "confirm",
  "generate",
  "hyper",
  "publish",
  "workbook",
  "pulse",
  "brand",
  "provision",
];

const STAGE_LABELS: Record<string, string> = {
  scrape: "Reading the customer website",
  profile: "Profiling the business with Claude",
  schema: "Designing the data model",
  confirm: "Awaiting confirmation (skipped in MVP)",
  generate: "Generating 2 years of sample data",
  hyper: "Building the Hyper extract",
  publish: "Publishing to Tableau Cloud",
  workbook: "Provisioning the dashboard",
  pulse: "Creating Pulse KPI metrics",
  brand: "Extracting brand colors",
  provision: "Wiring up the tenant",
};

export function FactoryProgress({ jobId }: { jobId: string }): ReactElement {
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/factory/${encodeURIComponent(jobId)}`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as StageEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.stage === "done" || ev.status === "error") setDone(true);
      } catch {
        // ignore malformed event
      }
    };
    es.onerror = () => {
      setError("Factory stream interrupted. Refresh to retry.");
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
        geographies: Array.isArray(p.geographies)
          ? (p.geographies as ProfileDraft["geographies"])
          : [],
        kpis: Array.isArray(p.kpis) ? (p.kpis as ProfileDraft["kpis"]) : [],
        market_events: Array.isArray(p.market_events)
          ? (p.market_events as ProfileDraft["market_events"])
          : [],
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

  return (
    <div className="mt-6 space-y-4">
      {awaitingConfirm && profileDraft ? (
        <ReviewForm
          jobId={jobId}
          initial={profileDraft}
          onSubmitted={() => {
            // Stream will continue automatically; nothing to do client-side.
          }}
        />
      ) : null}

      <ol className="space-y-2">
        {STAGE_ORDER.map((stage) => {
          const ev = byStage.get(stage);
          const status = ev?.status ?? "pending";
          return (
            <li
              key={stage}
              className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                status === "ok"
                  ? "border-green-200 bg-green-50"
                  : status === "running"
                    ? "border-blue-200 bg-blue-50"
                    : status === "error"
                      ? "border-red-200 bg-red-50"
                      : status === "skipped"
                        ? "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                        : "border-[hsl(var(--border))]"
              }`}
            >
              <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-current opacity-60" />
              <div className="flex-1">
                <div className="font-medium">{STAGE_LABELS[stage] ?? stage}</div>
                {ev?.detail ? (
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{ev.detail}</div>
                ) : null}
                {ev?.error ? (
                  <div className="text-xs text-red-700">error: {ev.error}</div>
                ) : null}
              </div>
              <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {status}
              </span>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : done ? (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Pipeline finished. Phase 8 will provision the workbook; for now, inspect the generator
          output in the factory logs.
        </div>
      ) : null}
    </div>
  );
}
