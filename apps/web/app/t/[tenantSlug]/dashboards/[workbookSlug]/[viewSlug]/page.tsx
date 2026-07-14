import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getLiveCatalog } from "@/lib/tableau-rest";
import { getTenant } from "@/lib/tenants";
import { getAgentSuggestions } from "@/lib/agent-suggestions";
import { env } from "@/lib/env";
import { isTableauConfigured } from "@/lib/tableau-config";
import { getSiteForTenant, resolvedSiteViewUrl } from "@/lib/tenant-site";
import { enforceImpressionBudget, ImpressionBudgetExceededError } from "@/lib/billing";
import { mintTableauJwt } from "@portal/tableau-jwt";
import { TableauVizShell } from "@/components/embed/TableauVizShell";
import { UnconfiguredState } from "@/components/embed/UnconfiguredState";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { VizContextProvider } from "@/components/bridge/VizContextProvider";
import { recordView } from "@/lib/view-history";
import { ChatPanelWrapper, ChatPanelToggle } from "@/components/layout/ChatPanelToggle";
import { getLocale } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ tenantSlug: string; workbookSlug: string; viewSlug: string }>;
}

export default async function ViewEmbedPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) notFound();
  const ctx = tenantFromSession(session);
  if (!ctx) notFound();

  const { tenantSlug, workbookSlug, viewSlug } = await params;
  const locale = await getLocale();

  const tenantRecord = await getTenant(tenantSlug);
  const catalog = await getLiveCatalog(ctx?.tenantId, tenantRecord?.allowedProjects);
  const dashboard = catalog.dashboards.find(
    (d) => d.workbookSlug === workbookSlug && d.viewSlug === viewSlug,
  );
  if (!dashboard) notFound();

  const siblings = catalog.dashboards.filter((d) => d.workbookSlug === workbookSlug);

  // Record view server-side on every page load (fire-and-forget, never blocks render)
  void recordView(session.user.email ?? "", {
    workbookSlug,
    viewSlug,
    workbookName: dashboard.workbookName,
    viewName: dashboard.viewName,
    projectName: dashboard.projectName,
  });

  if (!isTableauConfigured()) {
    return (
      <div className="space-y-3">
        <Breadcrumb tenantSlug={tenantSlug} workbookSlug={workbookSlug} dashboard={dashboard} siblings={siblings} viewSlug={viewSlug} />
        <UnconfiguredState viewPath={dashboard.viewPath} />
      </div>
    );
  }

  const site = await getSiteForTenant(ctx.tenantId);
  let token: string;
  try {
    await enforceImpressionBudget(ctx.tenantId);
    const embedSub = env.TABLEAU_EMBED_USER ?? session.user.email ?? "";
    token = await mintTableauJwt(
      {
        clientId: site.connectedAppClientId,
        secretId: site.connectedAppSecretId,
        secretValue: site.connectedAppSecretValue,
      },
      {
        sub: embedSub,
        scopes: ["tableau:views:embed"],
        tenantId: ctx.tenantId,
        ...(ctx.region ? { region: ctx.region } : {}),
        ...(ctx.groups.length > 0 ? { groups: ctx.groups } : {}),
        ...(env.TABLEAU_ODA ? { onDemandAccess: true } : {}),
      },
    );
  } catch (e) {
    if (e instanceof ImpressionBudgetExceededError) {
      return (
        <div className="space-y-3">
          <Breadcrumb tenantSlug={tenantSlug} workbookSlug={workbookSlug} dashboard={dashboard} siblings={siblings} viewSlug={viewSlug} />
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h3 className="font-semibold">Đã đạt hạn mức lượt xem trong ngày</h3>
            <p className="mt-1 text-sm">
              {ctx.tenantName} đã dùng {e.status.used} / {e.status.cap} lượt xem hôm nay. Hạn mức được làm mới lúc 00:00 UTC.
            </p>
          </div>
        </div>
      );
    }
    throw e;
  }

  const src = resolvedSiteViewUrl(site, dashboard.viewPath);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Top bar: breadcrumb + view tabs + chat toggle */}
      <div className="flex items-center gap-x-3 gap-y-2 shrink-0 min-w-0 flex-wrap">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-caption text-sf-neutral-5 min-w-0 flex-1">
          <Link href={`/t/${tenantSlug}/dashboards`} className="shrink-0 transition-colors hover:text-sf-neutral-9">
            Dashboards
          </Link>
          <ChevronIcon />
          {siblings.length > 1 ? (
            <>
              <Link
                href={`/t/${tenantSlug}/dashboards/${workbookSlug}`}
                className="truncate max-w-[180px] transition-colors hover:text-sf-neutral-9"
              >
                {dashboard.workbookName}
              </Link>
              <ChevronIcon />
              <span className="truncate max-w-[220px] font-semibold text-sf-neutral-9">{dashboard.viewName}</span>
            </>
          ) : (
            <span className="truncate max-w-[320px] font-semibold text-sf-neutral-9">{dashboard.workbookName}</span>
          )}
        </nav>

        {/* View tabs — segmented control */}
        {siblings.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-sf-neutral-3 bg-white p-1 shadow-elev-0">
            {siblings.map((s) => (
              <Link
                key={s.viewSlug}
                href={`/t/${tenantSlug}/dashboards/${workbookSlug}/${s.viewSlug}`}
                className={`rounded-md px-2.5 py-1 text-caption font-medium transition-all duration-base ease-smooth ${
                  s.viewSlug === viewSlug
                    ? "bg-brand text-white shadow-elev-1"
                    : "text-sf-neutral-7 hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
                }`}
              >
                {s.viewName}
              </Link>
            ))}
          </div>
        )}

        {/* AI panel toggle */}
        <ChatPanelToggle />
      </div>

      {/* Main content: viz + chat side by side, fills remaining space */}
      <VizContextProvider>
        <div className="flex flex-1 min-h-0" style={{ minHeight: "500px" }}>
          {/* Tableau embed — fills remaining width */}
          <div className="flex-1 min-w-0 min-h-0">
            <TableauVizShell
              src={src}
              initialToken={token}
              height="100%"
              locale={locale}
              viewMeta={{
                workbookSlug,
                viewSlug,
                workbookName: dashboard.workbookName,
                viewName: dashboard.viewName,
                projectName: dashboard.projectName,
              }}
            />
          </div>
          {/* Chat panel — collapsible */}
          <ChatPanelWrapper>
            <ChatPanel
              locale={locale}
              suggestions={getAgentSuggestions({
                slug: tenantSlug,
                industry: tenantRecord?.industry,
              }).map((s) => s.title)}
            />
          </ChatPanelWrapper>
        </div>
      </VizContextProvider>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Typed to avoid repeating prop drilling inline
interface BreadcrumbProps {
  tenantSlug: string;
  workbookSlug: string;
  dashboard: { workbookName: string; viewName: string };
  siblings: { viewSlug: string }[];
  viewSlug: string;
}

function Breadcrumb({ tenantSlug, workbookSlug, dashboard, siblings }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-xs text-sf-neutral-5">
      <Link href={`/t/${tenantSlug}/dashboards`} className="hover:text-sf-neutral-9 transition-colors">
        Dashboards
      </Link>
      <ChevronIcon />
      {siblings.length > 1 ? (
        <>
          <Link href={`/t/${tenantSlug}/dashboards/${workbookSlug}`} className="hover:text-sf-neutral-9 transition-colors">
            {dashboard.workbookName}
          </Link>
          <ChevronIcon />
          <span className="font-medium text-sf-neutral-9">{dashboard.viewName}</span>
        </>
      ) : (
        <span className="font-medium text-sf-neutral-9">{dashboard.workbookName}</span>
      )}
    </nav>
  );
}
