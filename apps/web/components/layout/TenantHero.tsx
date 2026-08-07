import Link from "next/link";
import type { HeroVariant } from "@/lib/tenant-theme";
import type { Locale, MessageKey } from "@/lib/i18n";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface ImpressionInfo {
  used: number;
  cap: number;
}

interface Props {
  variant: HeroVariant;
  tenantSlug: string;
  tenantName: string;
  impressions: ImpressionInfo | null;
  usedPct: number;
  locale: Locale;
  t: T;
}

/**
 * Tenant-home hero. All variants share the same content (title, subtitle, the
 * two CTAs, the optional impression meter) and the same brand CSS variables —
 * only the visual treatment differs. This is the one per-tenant "tailored"
 * surface; the sidebar, dashboards, agent, RLS and i18n are identical across
 * every tenant, so adding a variant never forks the single-shell architecture.
 *
 * Add a new look by adding a `HeroVariant` value + a case here. Keep each
 * variant self-contained and WCAG-AA safe against the brand palette.
 */
export function TenantHero(props: Props) {
  switch (props.variant) {
    case "editorial":
      return <EditorialHero {...props} />;
    case "spotlight":
      return <SpotlightHero {...props} />;
    case "aurora":
    default:
      return <AuroraHero {...props} />;
  }
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function PrimaryCta({ tenantSlug, t, tone }: { tenantSlug: string; t: T; tone: "light" | "brand" }) {
  const cls =
    tone === "light"
      ? "bg-white text-sf-neutral-9 shadow-elev-1 hover:-translate-y-px hover:bg-sf-neutral-2 hover:shadow-elev-2"
      : "bg-brand text-white shadow-elev-1 hover:-translate-y-px hover:brightness-110 hover:shadow-elev-2";
  return (
    <Link
      href={`/t/${tenantSlug}/dashboards`}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-body-sm font-semibold transition-all duration-base ease-smooth active:scale-[0.98] ${cls}`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      {t("th.viewDashboards")}
    </Link>
  );
}

function AgentCta({ tenantSlug, t, tone }: { tenantSlug: string; t: T; tone: "onDark" | "onLight" }) {
  const cls =
    tone === "onDark"
      ? "border-white/20 bg-white/[0.08] text-white backdrop-blur-sm hover:-translate-y-px hover:border-white/30 hover:bg-white/[0.14]"
      : "border-sf-neutral-3 bg-white text-sf-neutral-9 hover:-translate-y-px hover:border-brand/40 hover:shadow-elev-1";
  return (
    <Link
      href={`/t/${tenantSlug}/agent`}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-body-sm font-semibold transition-all duration-base ease-smooth ${cls}`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" />
      </svg>
      {t("th.askAgent")}
    </Link>
  );
}

function ImpressionMeterDark({ impressions, usedPct, locale, t }: { impressions: ImpressionInfo; usedPct: number; locale: Locale; t: T }) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-3 backdrop-blur-md min-w-[220px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-meta font-semibold uppercase tracking-[0.14em] text-sf-blue-40">{t("th.viewsToday")}</span>
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5 text-white">
        <span className="text-h2 font-bold">{impressions.used.toLocaleString(locale)}</span>
        <span className="text-body-sm text-white/60">/ {impressions.cap.toLocaleString(locale)}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sf-blue-40 transition-[width] duration-slow ease-smooth" style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}

function ImpressionMeterLight({ impressions, usedPct, locale, t }: { impressions: ImpressionInfo; usedPct: number; locale: Locale; t: T }) {
  return (
    <div className="rounded-xl border border-sf-neutral-3 bg-white px-4 py-3 shadow-elev-1 min-w-[220px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-meta font-semibold uppercase tracking-[0.14em] text-sf-neutral-6">{t("th.viewsToday")}</span>
        <span className="flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5 text-sf-neutral-9">
        <span className="text-h2 font-bold tabular-nums">{impressions.used.toLocaleString(locale)}</span>
        <span className="text-body-sm text-sf-neutral-5">/ {impressions.cap.toLocaleString(locale)}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sf-neutral-2">
        <div className="h-full rounded-full bg-brand transition-[width] duration-slow ease-smooth" style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}

function WelcomeHeading({ t, className }: { t: T; className: string }) {
  return (
    <h1 className={className}>
      {t("th.welcome")}
      <span className="ml-2 inline-block animate-[fade-in_400ms_ease-out]">👋</span>
    </h1>
  );
}

// ── Variant: aurora (default — brand-gradient mesh, unchanged from original) ──

function AuroraHero({ tenantSlug, tenantName, impressions, usedPct, locale, t }: Props) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] px-7 py-8 text-white shadow-elev-3"
      style={{
        background:
          "linear-gradient(135deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 80%, var(--brand-primary) 20%) 70%, var(--brand-primary) 130%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 bg-mesh-brand mix-blend-screen" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.06] blur-2xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-16 right-32 h-40 w-40 rounded-full bg-sf-blue-60/20 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-meta font-semibold uppercase tracking-[0.16em] text-sf-blue-40">
            <span className="h-1 w-1 rounded-full bg-sf-blue-40" aria-hidden="true" />
            {tenantName}
          </p>
          <WelcomeHeading t={t} className="mt-2 text-h1 font-bold leading-tight text-white" />
          <p className="mt-2 text-body-lg text-white/75 leading-relaxed">{t("th.subtitle")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PrimaryCta tenantSlug={tenantSlug} t={t} tone="light" />
            <AgentCta tenantSlug={tenantSlug} t={t} tone="onDark" />
          </div>
        </div>
        {impressions && <ImpressionMeterDark impressions={impressions} usedPct={usedPct} locale={locale} t={t} />}
      </div>
    </section>
  );
}

// ── Variant: editorial (light surface, left brand accent bar) ────────────────

function EditorialHero({ tenantSlug, tenantName, impressions, usedPct, locale, t }: Props) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-sf-neutral-3 bg-white px-7 py-8 shadow-elev-1">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: "linear-gradient(to bottom, var(--brand-primary), var(--brand-secondary))" }} aria-hidden="true" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-meta font-semibold uppercase tracking-[0.16em] text-brand">
            <span className="h-1 w-1 rounded-full bg-brand" aria-hidden="true" />
            {tenantName}
          </p>
          <WelcomeHeading t={t} className="mt-2 text-h1 font-bold leading-tight text-sf-neutral-10" />
          <p className="mt-2 text-body-lg text-sf-neutral-6 leading-relaxed">{t("th.subtitle")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PrimaryCta tenantSlug={tenantSlug} t={t} tone="brand" />
            <AgentCta tenantSlug={tenantSlug} t={t} tone="onLight" />
          </div>
        </div>
        {impressions && <ImpressionMeterLight impressions={impressions} usedPct={usedPct} locale={locale} t={t} />}
      </div>
    </section>
  );
}

// ── Variant: spotlight (centered, brand ring, minimal) ───────────────────────

function SpotlightHero({ tenantSlug, tenantName, impressions, usedPct, locale, t }: Props) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl px-7 py-10 text-center shadow-elev-1"
      style={{
        background: "radial-gradient(120% 120% at 50% 0%, color-mix(in oklab, var(--brand-primary) 14%, #ffffff) 0%, #ffffff 60%)",
        border: "1px solid color-mix(in oklab, var(--brand-primary) 22%, transparent)",
      }}
    >
      <div className="relative mx-auto flex max-w-2xl flex-col items-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-meta font-semibold uppercase tracking-[0.16em] text-brand">
          {tenantName}
        </p>
        <WelcomeHeading t={t} className="mt-4 text-display font-extrabold leading-tight text-sf-neutral-10" />
        <p className="mt-2 text-body-lg text-sf-neutral-6 leading-relaxed">{t("th.subtitle")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta tenantSlug={tenantSlug} t={t} tone="brand" />
          <AgentCta tenantSlug={tenantSlug} t={t} tone="onLight" />
        </div>
        {impressions && (
          <p className="mt-6 text-caption text-sf-neutral-5">
            {t("th.viewsToday")}:{" "}
            <span className="font-semibold text-sf-neutral-8 tabular-nums">{impressions.used.toLocaleString(locale)}</span>
            <span className="text-sf-neutral-4"> / {impressions.cap.toLocaleString(locale)}</span>
            <span className="ml-2 text-sf-neutral-4">({usedPct}%)</span>
          </p>
        )}
      </div>
    </section>
  );
}
