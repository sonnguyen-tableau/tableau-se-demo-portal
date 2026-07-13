import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getImpressionStatus } from "@/lib/billing";
import { getLiveCatalog } from "@/lib/tableau-rest";
import { getTenant } from "@/lib/tenants";
import { getRecentViews, getPopularViews } from "@/lib/view-history";
import { getPulseConfig } from "@/lib/pulse";
import { PulseSection } from "@/components/embed/PulseSection";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantHome({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const { tenantSlug } = await params;
  const email = session?.user?.email ?? "";

  const tenantRecord = await getTenant(tenantSlug);
  const [impressions, catalog, recentViews, popularRaw] = await Promise.all([
    ctx ? getImpressionStatus(ctx.tenantId) : Promise.resolve(null),
    getLiveCatalog(ctx?.tenantId, tenantRecord?.allowedProjects),
    getRecentViews(email),
    getPopularViews(6),
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
      {/* ── Welcome banner ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] px-7 py-8 text-white shadow-elev-3"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 80%, var(--brand-primary) 20%) 70%, var(--brand-primary) 130%)",
        }}
      >
        {/* mesh accents */}
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-mesh-brand mix-blend-screen" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.06] blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 right-32 h-40 w-40 rounded-full bg-sf-blue-60/20 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-meta font-semibold uppercase tracking-[0.16em] text-sf-blue-40">
              <span className="h-1 w-1 rounded-full bg-sf-blue-40" aria-hidden="true" />
              {ctx?.tenantName ?? tenantSlug}
            </p>
            <h1 className="mt-2 text-h1 font-bold leading-tight text-white">
              Chào mừng trở lại
              <span className="ml-2 inline-block animate-[fade-in_400ms_ease-out]">👋</span>
            </h1>
            <p className="mt-2 text-body-lg text-white/75 leading-relaxed">
              Khám phá dashboards hoặc hỏi AI Agent để nhận phân tích tức thì.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={`/t/${tenantSlug}/dashboards`}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-body-sm font-semibold text-sf-neutral-9 shadow-elev-1 transition-all duration-base ease-smooth hover:-translate-y-px hover:bg-sf-neutral-2 hover:shadow-elev-2 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Xem Dashboards
              </Link>
              <Link
                href={`/t/${tenantSlug}/agent`}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-4 py-2 text-body-sm font-semibold text-white backdrop-blur-sm transition-all duration-base ease-smooth hover:-translate-y-px hover:border-white/30 hover:bg-white/[0.14]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" />
                </svg>
                Hỏi AI Agent
              </Link>
            </div>
          </div>

          {impressions && (
            <div className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-3 backdrop-blur-md min-w-[220px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-meta font-semibold uppercase tracking-[0.14em] text-sf-blue-40">Lượt xem hôm nay</span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" aria-hidden="true" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5 text-white">
                <span className="text-h2 font-bold">{impressions.used.toLocaleString("vi-VN")}</span>
                <span className="text-body-sm text-white/60">/ {impressions.cap.toLocaleString("vi-VN")}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sf-blue-40 transition-[width] duration-slow ease-smooth"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── KPI tiles ──────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          label="Tổng workbooks"
          value={workbookCount}
          sub={`${catalog.dashboards.length} views`}
          tone="brand"
          href={`/t/${tenantSlug}/dashboards`}
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm10-2h4a2 2 0 012 2v10a2 2 0 01-2 2h-4a2 2 0 01-2-2V7a2 2 0 012-2z" />
          }
        />
        <KpiTile
          label="Lượt xem đã dùng"
          value={impressions?.used ?? 0}
          sub="hôm nay"
          tone="emerald"
          icon={
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </>
          }
        />
        <KpiTile
          label="Hạn mức ngày"
          value={impressions?.cap ?? 2000}
          sub="reset lúc 00:00 UTC"
          tone="neutral"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          }
        />
      </section>

      {/* ── Tableau Pulse metrics ──────────────────────────────────────── */}
      {pulseConfig && pulseConfig.metrics.length > 0 && (
        <section>
          <SectionHeader title="Chỉ số Pulse" />
          <PulseSection metrics={pulseConfig.metrics} />
        </section>
      )}

      {/* ── Recent views ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Vừa xem gần đây"
          {...(recentViews.length > 0 ? { actionHref: `/t/${tenantSlug}/dashboards` } : {})}
        />
        {recentViews.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-sf-neutral-3 bg-sf-neutral-2/60 px-5 py-5 text-body-sm text-sf-neutral-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sf-neutral-5 shadow-elev-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </span>
            Bạn chưa xem report nào — hãy mở một dashboard để bắt đầu.
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
                  {new Date(v.viewedAt).toLocaleDateString("vi-VN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Popular / Featured ─────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title={popular.length > 0 ? "Dashboard xem nhiều nhất" : "Dashboard nổi bật"}
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

function SectionHeader({ title, actionHref }: { title: string; actionHref?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-h3 font-semibold text-sf-neutral-9">{title}</h2>
      {actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 text-body-sm font-medium text-brand transition-colors hover:text-sf-blue-80"
        >
          Xem tất cả
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
  href,
  icon,
}: {
  label: string;
  value: number;
  sub: string;
  tone: keyof typeof TONE_STYLES;
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
            Xem
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>
      <p className="mt-3 text-h2 font-bold leading-none text-sf-neutral-9 tabular-nums">{value.toLocaleString("vi-VN")}</p>
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
