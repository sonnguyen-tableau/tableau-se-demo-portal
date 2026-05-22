import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getImpressionStatus } from "@/lib/billing";
import { getLiveCatalog } from "@/lib/tableau-rest";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

function projectIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("banking") || n.includes("ngân hàng") || n.includes("financial")) return "🏦";
  if (n.includes("retail") || n.includes("bán lẻ")) return "🛒";
  if (n.includes("sales") || n.includes("doanh thu")) return "📈";
  if (n.includes("risk") || n.includes("rủi ro")) return "⚠️";
  if (n.includes("operation") || n.includes("vận hành")) return "⚙️";
  if (n.includes("digital")) return "💻";
  if (n.includes("energy") || n.includes("evn")) return "⚡";
  if (n.includes("gaming") || n.includes("game")) return "🎮";
  if (n.includes("education") || n.includes("giáo dục")) return "🎓";
  if (n.includes("health") || n.includes("y tế")) return "🏥";
  if (n.includes("manufactur") || n.includes("sản xuất")) return "🏭";
  if (n.includes("ride") || n.includes("transport") || n.includes("vận chuyển")) return "🚗";
  if (n.includes("sample")) return "📋";
  if (n.includes("demo")) return "🔬";
  return "📁";
}

export default async function TenantHome({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const { tenantSlug } = await params;

  const [impressions, catalog] = await Promise.all([
    ctx ? getImpressionStatus(ctx.tenantId) : Promise.resolve(null),
    getLiveCatalog(),
  ]);

  // Group dashboards by project for the folder preview
  const projectDashboardCount = new Map<string, number>();
  for (const d of catalog.dashboards) {
    projectDashboardCount.set(d.projectId, (projectDashboardCount.get(d.projectId) ?? 0) + 1);
  }

  const projectList = catalog.projects
    .filter((p) => (projectDashboardCount.get(p.id) ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
    .slice(0, 4);

  // One entry per workbook for the featured section
  const featured = Array.from(
    new Map(catalog.dashboards.map((d) => [d.workbookSlug, d])).values()
  ).slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-xl bg-sf-blue-90 px-7 py-6 text-white shadow-sf-lg">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-sf-blue-80/50" />
        <div className="pointer-events-none absolute -bottom-6 right-24 h-24 w-24 rounded-full bg-sf-blue-70/30" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
            {ctx?.tenantName ?? tenantSlug}
          </p>
          <h2 className="mt-1 text-2xl font-bold">Chào mừng trở lại 👋</h2>
          <p className="mt-1.5 text-sm text-blue-200">
            Khám phá dashboards hoặc hỏi AI Agent để nhận phân tích tức thì.
          </p>

          {impressions && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {impressions.used} / {impressions.cap} lượt xem hôm nay
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <Link
              href={`/t/${tenantSlug}/dashboards`}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-sf-blue-80 shadow-sf-sm transition hover:bg-sf-blue-10"
            >
              Xem Dashboards
            </Link>
            <Link
              href={`/t/${tenantSlug}/agent`}
              className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Hỏi AI Agent
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Dự án",
            value: projectList.length || catalog.projects.length,
            sub: `${catalog.dashboards.length} dashboards`,
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm10-2h4a2 2 0 012 2v10a2 2 0 01-2 2h-4a2 2 0 01-2-2V7a2 2 0 012-2z" />
              </svg>
            ),
            color: "text-sf-blue-70 bg-sf-blue-10",
            href: `/t/${tenantSlug}/dashboards`,
          },
          {
            label: "Lượt xem đã dùng",
            value: impressions?.used ?? 0,
            sub: "hôm nay",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ),
            color: "text-emerald-700 bg-emerald-50",
            href: null,
          },
          {
            label: "Hạn mức ngày",
            value: impressions?.cap ?? 2000,
            sub: "reset lúc 00:00 UTC",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ),
            color: "text-slate-600 bg-slate-100",
            href: null,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-sf-sm">
            <div className="flex items-start justify-between">
              <div className={`rounded-lg p-2 ${stat.color}`}>{stat.icon}</div>
              {stat.href && (
                <Link href={stat.href} className="text-xs font-medium text-sf-blue-70 hover:underline">
                  Xem tất cả
                </Link>
              )}
            </div>
            <p className="mt-3 text-2xl font-bold text-sf-neutral-9">{stat.value}</p>
            <p className="text-sm font-medium text-sf-neutral-6">{stat.label}</p>
            <p className="text-xs text-sf-neutral-4">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Project folders preview */}
      {projectList.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-sf-neutral-9">Dự án của bạn</h3>
            <Link href={`/t/${tenantSlug}/dashboards`} className="text-sm font-medium text-sf-blue-70 hover:underline">
              Xem tất cả →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projectList.map((project) => (
              <Link
                key={project.id}
                href={`/t/${tenantSlug}/dashboards`}
                className="group flex items-center gap-4 rounded-xl border border-sf-neutral-3 bg-white p-4 shadow-sf-sm transition-all hover:border-sf-blue-70 hover:shadow-sf-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sf-blue-10 text-2xl">
                  {projectIcon(project.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sf-neutral-9 leading-tight">{project.name}</p>
                  <p className="text-xs text-sf-neutral-6 mt-0.5">
                    {projectDashboardCount.get(project.id) ?? 0} dashboards
                  </p>
                </div>
                <svg className="ml-auto h-4 w-4 shrink-0 text-sf-neutral-4 transition group-hover:text-sf-blue-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Featured dashboards */}
      {featured.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-sf-neutral-9">Dashboard nổi bật</h3>
            <Link href={`/t/${tenantSlug}/dashboards`} className="text-sm font-medium text-sf-blue-70 hover:underline">
              Xem tất cả →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((d) => (
              <Link
                key={d.workbookSlug}
                href={`/t/${tenantSlug}/dashboards/${d.workbookSlug}`}
                className="group rounded-xl border border-sf-neutral-3 bg-white p-5 shadow-sf-sm transition-all hover:border-sf-blue-70 hover:shadow-sf-md"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-sf-neutral-6">{d.projectName}</span>
                  <svg className="h-4 w-4 text-sf-neutral-4 transition group-hover:text-sf-blue-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h4 className="font-semibold text-sf-neutral-9">{d.name}</h4>
                <p className="mt-1 text-sm text-sf-neutral-6">{d.workbookName}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
