import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession, workspaceDisplayName } from "@/lib/tenant";
import { getTenant } from "@/lib/tenants";
import { getImpressionStatus } from "@/lib/billing";
import { getUserCatalog } from "@/lib/user-catalog";
import { DashboardCard } from "@/components/dashboards/DashboardCard";
import { PinnedRow } from "@/components/pins/PinnedRow";
import { getRecentViews, getPopularViews } from "@/lib/view-history";
import { getPulseConfig } from "@/lib/pulse";
import { getTenantTheme } from "@/lib/tenant-theme";
import { PulseSection } from "@/components/embed/PulseSection";
import { TenantHero } from "@/components/layout/TenantHero";
import { getT, type Locale, type MessageKey } from "@/lib/i18n";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantHome({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const { tenantSlug } = await params;
  const email = session?.user?.email ?? "";
  const { locale, t } = await getT();

  // Everything on the home page is scoped to the URL tenant (tenantSlug), not
  // the session tenant, so an internal user viewing another portal sees THAT
  // tenant's theme / name / pulse / recents (FX-06). getUserCatalog fails closed
  // on no access, so a forbidden tenant yields an empty page.
  const [impressions, catalog, recentViews, popularRaw, theme, tenantRecord] = await Promise.all([
    getImpressionStatus(tenantSlug),
    getUserCatalog(session, tenantSlug),
    getRecentViews(email),
    getPopularViews(6),
    getTenantTheme(tenantSlug),
    getTenant(tenantSlug),
  ]);
  const tenantName = workspaceDisplayName(tenantSlug, tenantRecord?.name ?? ctx?.tenantName ?? tenantSlug);

  const dashboardIndex = new Map(
    catalog.dashboards.map((d) => [`${d.workbookSlug}/${d.viewSlug}`, d]),
  );

  // Recents are stored per user (not per tenant) — show only views that exist
  // in THIS tenant's visible catalog (FX-06).
  const recentInCatalog = recentViews.filter((v) =>
    dashboardIndex.has(`${v.workbookSlug}/${v.viewSlug}`),
  );

  // Pins are stored per user (session tenant); PinnedRow filters them against
  // this tenant's visible catalog keys (`wb` + `wb/view`) — FX-06.
  const pinAllowedKeys = Array.from(
    new Set(catalog.dashboards.flatMap((d) => [d.workbookSlug, `${d.workbookSlug}/${d.viewSlug}`])),
  );

  const popular = popularRaw
    .map((p) => {
      const d = dashboardIndex.get(`${p.workbookSlug}/${p.viewSlug}`);
      if (!d) return null;
      return { ...d, count: p.count };
    })
    .filter(Boolean) as Array<(typeof catalog.dashboards)[number] & { count: number }>;

  const popularFallback = popular.length === 0
    ? Array.from(new Map(catalog.dashboards.map((d) => [d.workbookSlug, d])).values()).slice(0, 6)
    : popular;

  const workbookCount = new Set(catalog.dashboards.map((d) => d.workbookId)).size;
  const usedPct = impressions ? Math.min(100, Math.round((impressions.used / Math.max(1, impressions.cap)) * 100)) : 0;

  const pulseConfig = getPulseConfig(tenantSlug);

  // Time-of-day greeting (HL-02), resolved server-side at Vietnam time (UTC+7)
  // so it matches the VI-default audience and never mismatches on hydration.
  const vnHour = (new Date().getUTCHours() + 7) % 24;
  const greeting = t(
    vnHour < 12 ? "th.greetingMorning" : vnHour < 18 ? "th.greetingAfternoon" : "th.greetingEvening",
  );

  return (
    <div className="space-y-7 animate-fade-in">
      {/* ── Welcome hero (per-tenant variant) ──────────────────────────── */}
      <TenantHero
        variant={theme.heroVariant ?? "aurora"}
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        greeting={greeting}
        isInternal={ctx?.isInternal ?? false}
        impressions={impressions}
        usedPct={usedPct}
        locale={locale}
        t={t}
      />

      {/* ── KPI tiles — internal only (HL-02; end users get the admin page) ── */}
      {ctx?.isInternal && (
      <section className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          label={t("th.totalWorkbooks")}
          value={workbookCount}
          sub={`${catalog.dashboards.length} ${t("th.viewsWord")}`}
          tone="brand"
          locale={locale}
          viewLabel={t("th.view")}
          href={`/t/${tenantSlug}/dashboards`}
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm10-2h4a2 2 0 012 2v10a2 2 0 01-2 2h-4a2 2 0 01-2-2V7a2 2 0 012-2z" />
          }
        />
        <KpiTile
          label={t("th.viewsUsed")}
          value={impressions?.used ?? 0}
          sub={t("th.today")}
          tone="emerald"
          locale={locale}
          viewLabel={t("th.view")}
          icon={
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </>
          }
        />
        <KpiTile
          label={t("th.dailyQuota")}
          value={impressions?.cap ?? 2000}
          sub={t("th.quotaReset")}
          tone="neutral"
          locale={locale}
          viewLabel={t("th.view")}
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          }
        />
      </section>
      )}

      {/* ── Tableau Pulse metrics ──────────────────────────────────────── */}
      {pulseConfig && pulseConfig.metrics.length > 0 && (
        <section>
          <SectionHeader title={t("th.pulseMetrics")} t={t} />
          <PulseSection metrics={pulseConfig.metrics} locale={locale} />
        </section>
      )}

      {/* ── Continue viewing (recent) ──────────────────────────────────── */}
      <section>
        <SectionHeader
          title={t("th.continueViewing")}
          t={t}
          {...(recentInCatalog.length > 0 ? { actionHref: `/t/${tenantSlug}/dashboards` } : {})}
        />
        {recentInCatalog.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-sf-neutral-3 bg-sf-neutral-2/60 px-5 py-5 text-body-sm text-sf-neutral-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sf-neutral-5 shadow-elev-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </span>
            {t("th.noRecentViews")}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {recentInCatalog.slice(0, 8).map((v) => (
              <div key={`${v.workbookSlug}/${v.viewSlug}`} className="w-[240px] shrink-0 snap-start">
                <DashboardCard
                  href={`/t/${tenantSlug}/dashboards/${v.workbookSlug}/${v.viewSlug}`}
                  title={v.viewName}
                  eyebrow={v.workbookName}
                  subtitle={new Date(v.viewedAt).toLocaleDateString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  projectName={v.workbookName}
                  thumb={{ wb: v.workbookSlug, view: v.viewSlug, t: tenantSlug }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Đã ghim (pinned) ───────────────────────────────────────────── */}
      <PinnedRow tenantSlug={tenantSlug} title={t("th.pinned")} allowedKeys={pinAllowedKeys} />

      {/* ── Popular / Featured ─────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title={popular.length > 0 ? t("th.mostViewed") : t("th.featured")}
          t={t}
          actionHref={`/t/${tenantSlug}/dashboards`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {popularFallback.map((d) => (
            <DashboardCard
              key={`${d.workbookSlug}/${d.viewSlug}`}
              href={`/t/${tenantSlug}/dashboards/${d.workbookSlug}/${d.viewSlug}`}
              title={d.viewName}
              subtitle={d.workbookName}
              eyebrow={d.projectName}
              projectName={d.projectName}
              thumb={{ wb: d.workbookSlug, view: d.viewSlug, t: tenantSlug }}
              badge={
                "count" in d ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-meta font-semibold text-brand shadow-elev-1 backdrop-blur-sm">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {(d as typeof d & { count: number }).count}
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Local presentational helpers ─────────────────────────────────────────────

function SectionHeader({ title, actionHref, t }: { title: string; actionHref?: string; t: T }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-h3 font-semibold text-sf-neutral-9">{title}</h2>
      {actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 text-body-sm font-medium text-brand transition-colors hover:text-sf-blue-80"
        >
          {t("th.viewAll")}
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

const TONE_STYLES: Record<"brand" | "emerald" | "neutral", string> = {
  brand: "bg-brand/8 text-brand",
  emerald: "bg-emerald-50 text-emerald-700",
  neutral: "bg-sf-neutral-2 text-sf-neutral-7",
};

function KpiTile({
  label,
  value,
  sub,
  tone,
  locale,
  viewLabel,
  href,
  icon,
}: {
  label: string;
  value: number;
  sub: string;
  tone: keyof typeof TONE_STYLES;
  locale: Locale;
  viewLabel: string;
  href?: string;
  icon: React.ReactNode;
}) {
  const body = (
    <div className="rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-elev-1 transition-all duration-base ease-smooth group-hover:-translate-y-px group-hover:border-brand/40 group-hover:shadow-elev-2">
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE_STYLES[tone]}`}>
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            {icon}
          </svg>
        </div>
        {href && (
          <span className="inline-flex items-center gap-0.5 text-meta font-medium text-sf-neutral-5 transition-colors group-hover:text-brand">
            {viewLabel}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>
      <p className="mt-3 text-h2 font-bold leading-none text-sf-neutral-9 tabular-nums">{value.toLocaleString(locale)}</p>
      <p className="mt-1.5 text-body-sm font-medium text-sf-neutral-7">{label}</p>
      <p className="text-meta text-sf-neutral-5">{sub}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block">
        {body}
      </Link>
    );
  }
  return <div className="group">{body}</div>;
}
