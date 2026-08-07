import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getImpressionStatus } from "@/lib/billing";
import { getLiveCatalog } from "@/lib/tableau-rest";
import { getTenant } from "@/lib/tenants";
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

  const tenantRecord = await getTenant(tenantSlug);
  const [impressions, catalog, recentViews, popularRaw, theme] = await Promise.all([
    ctx ? getImpressionStatus(ctx.tenantId) : Promise.resolve(null),
    getLiveCatalog(ctx?.tenantId, tenantRecord?.allowedProjects),
    getRecentViews(email),
    getPopularViews(6),
    getTenantTheme(ctx?.tenantId ?? tenantSlug),
  ]);

  const dashboardIndex = new Map(
    catalog.dashboards.map((d) => [`${d.workbookSlug}/${d.viewSlug}`, d]),
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

  const pulseConfig = ctx ? getPulseConfig(ctx.tenantId) : null;

  return (
    <div className="space-y-7 animate-fade-in">
      {/* ── Welcome hero (per-tenant variant) ──────────────────────────── */}
      <TenantHero
        variant={theme.heroVariant ?? "aurora"}
        tenantSlug={tenantSlug}
        tenantName={ctx?.tenantName ?? tenantSlug}
        impressions={impressions}
        usedPct={usedPct}
        locale={locale}
        t={t}
      />

      {/* ── KPI tiles ──────────────────────────────────────────────────── */}
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

      {/* ── Tableau Pulse metrics ──────────────────────────────────────── */}
      {pulseConfig && pulseConfig.metrics.length > 0 && (
        <section>
          <SectionHeader title={t("th.pulseMetrics")} t={t} />
          <PulseSection metrics={pulseConfig.metrics} />
        </section>
      )}

      {/* ── Recent views ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title={t("th.recentlyViewed")}
          t={t}
          {...(recentViews.length > 0 ? { actionHref: `/t/${tenantSlug}/dashboards` } : {})}
        />
        {recentViews.length === 0 ? (
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
            {recentViews.slice(0, 8).map((v) => (
              <Link
                key={`${v.workbookSlug}/${v.viewSlug}`}
                href={`/t/${tenantSlug}/dashboards/${v.workbookSlug}/${v.viewSlug}`}
                className="group flex min-w-[220px] max-w-[260px] shrink-0 snap-start flex-col rounded-xl border border-sf-neutral-3 bg-white p-4 shadow-elev-1 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:shadow-elev-2"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/8 text-brand transition-colors group-hover:bg-brand/12">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                    </svg>
                  </div>
                  <svg className="h-4 w-4 text-sf-neutral-4 transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <p className="line-clamp-2 text-body-sm font-semibold leading-snug text-sf-neutral-9">{v.viewName}</p>
                <p className="mt-1 truncate text-caption text-sf-neutral-6">{v.workbookName}</p>
                <p className="mt-auto pt-3 text-meta text-sf-neutral-5">
                  {new Date(v.viewedAt).toLocaleDateString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Popular / Featured ─────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title={popular.length > 0 ? t("th.mostViewed") : t("th.featured")}
          t={t}
          actionHref={`/t/${tenantSlug}/dashboards`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {popularFallback.map((d) => (
            <Link
              key={`${d.workbookSlug}/${d.viewSlug}`}
              href={`/t/${tenantSlug}/dashboards/${d.workbookSlug}/${d.viewSlug}`}
              className="group rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-elev-1 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:shadow-elev-2"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-meta font-medium uppercase tracking-wider text-sf-neutral-6">{d.projectName}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {"count" in d && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/8 px-2 py-0.5 text-meta font-semibold text-brand">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {(d as typeof d & { count: number }).count}
                    </span>
                  )}
                  <svg className="h-4 w-4 text-sf-neutral-4 transition-transform duration-base group-hover:translate-x-0.5 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <h4 className="text-body-lg font-semibold leading-snug text-sf-neutral-9">{d.viewName}</h4>
              <p className="mt-1 text-body-sm text-sf-neutral-6">{d.workbookName}</p>
            </Link>
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
