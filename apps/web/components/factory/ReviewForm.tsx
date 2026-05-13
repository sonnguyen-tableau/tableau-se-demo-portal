"use client";

import { type FormEvent, type ReactElement, useState } from "react";

export interface Kpi {
  name: string;
  type: "currency" | "percent" | "number";
  favorable_direction: "up" | "down" | "neutral";
  time_dim?: string;
}

export interface ProfileDraft {
  company_name: string;
  company_url: string;
  tagline?: string;
  logo_url?: string;
  industry: "retail-ecommerce" | "retail-banking" | "manufacturing" | "healthcare" | "logistics";
  sub_vertical?: string;
  products: string[];
  segments: string[];
  geographies: Array<"NA" | "EMEA" | "APAC" | "LATAM">;
  kpis: Kpi[];
  market_events: Array<Record<string, string | number>>;
  growth_trend_pct: number;
}

interface Props {
  jobId: string;
  initial: ProfileDraft;
  onSubmitted: () => void;
}

const INDUSTRY_OPTIONS: Array<{ value: ProfileDraft["industry"]; label: string }> = [
  { value: "retail-ecommerce", label: "Retail / E-commerce" },
  { value: "retail-banking", label: "Retail Banking" },
  { value: "manufacturing", label: "Manufacturing / Operations" },
  { value: "healthcare", label: "Healthcare (synthetic)" },
  { value: "logistics", label: "Logistics / Supply Chain" },
];

export function ReviewForm({ jobId, initial, onSubmitted }: Props): ReactElement {
  const [profile, setProfile] = useState<ProfileDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setKpi = (idx: number, patch: Partial<Kpi>): void => {
    setProfile((p) => ({
      ...p,
      kpis: p.kpis.map((k, i) => (i === idx ? { ...k, ...patch } : k)),
    }));
  };

  const addKpi = (): void => {
    setProfile((p) => ({
      ...p,
      kpis: [
        ...p.kpis,
        { name: "New KPI", type: "number", favorable_direction: "up", time_dim: "OrderDate" },
      ],
    }));
  };

  const removeKpi = (idx: number): void => {
    setProfile((p) => ({ ...p, kpis: p.kpis.filter((_, i) => i !== idx) }));
  };

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/factory/${encodeURIComponent(jobId)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_override: profile }),
      });
      if (!res.ok) {
        setError(`Confirm failed (HTTP ${res.status})`);
        return;
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-6 rounded-lg border border-[hsl(var(--border))] p-5">
      <header>
        <h3 className="text-lg font-semibold">Review the detected profile</h3>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Adjust the industry, KPIs, or segments before the factory generates the demo data.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Company name</span>
          <input
            value={profile.company_name}
            onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2"
            required
            maxLength={200}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Industry</span>
          <select
            value={profile.industry}
            onChange={(e) =>
              setProfile({ ...profile, industry: e.target.value as ProfileDraft["industry"] })
            }
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2"
          >
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Tagline</span>
          <input
            value={profile.tagline ?? ""}
            onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2"
            maxLength={280}
          />
        </label>
      </section>

      <section>
        <header className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">KPIs ({profile.kpis.length})</h4>
          <button
            type="button"
            onClick={addKpi}
            className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
          >
            + Add KPI
          </button>
        </header>
        <ul className="space-y-2">
          {profile.kpis.map((k, idx) => (
            <li
              key={idx}
              className="grid grid-cols-[1fr_120px_140px_60px] items-center gap-2 rounded-md border border-[hsl(var(--border))] p-2"
            >
              <input
                value={k.name}
                onChange={(e) => setKpi(idx, { name: e.target.value })}
                className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-sm"
                maxLength={120}
              />
              <select
                value={k.type}
                onChange={(e) => setKpi(idx, { type: e.target.value as Kpi["type"] })}
                className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-sm"
              >
                <option value="currency">currency</option>
                <option value="percent">percent</option>
                <option value="number">number</option>
              </select>
              <select
                value={k.favorable_direction}
                onChange={(e) =>
                  setKpi(idx, { favorable_direction: e.target.value as Kpi["favorable_direction"] })
                }
                className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-sm"
              >
                <option value="up">up is good</option>
                <option value="down">down is good</option>
                <option value="neutral">neutral</option>
              </select>
              <button
                type="button"
                onClick={() => removeKpi(idx)}
                className="text-xs text-red-700 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <footer className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Generate Portal"}
        </button>
      </footer>
    </form>
  );
}
