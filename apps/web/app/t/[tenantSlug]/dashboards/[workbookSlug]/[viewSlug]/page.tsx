import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getUserCatalog } from "@/lib/user-catalog";
import { getTenant } from "@/lib/tenants";
import { getAgentSuggestions } from "@/lib/agent-suggestions";
import { env } from "@/lib/env";
import { isTableauConfigured } from "@/lib/tableau-config";
import { getSiteForTenant, resolvedSiteViewUrl } from "@/lib/tenant-site";
import { enforceImpressionBudget, ImpressionBudgetExceededError } from "@/lib/billing";
import { mintTableauJwt } from "@portal/tableau-jwt";
import { TableauVizShell } from "@/components/embed/TableauVizShell";
import { UnconfiguredState } from "@/components/embed/UnconfiguredState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { VizContextProvider } from "@/components/bridge/VizContextProvider";
import { ChatPanelWrapper, ChatPanelToggle } from "@/components/layout/ChatPanelToggle";
import { ViewHeader } from "@/components/report/ViewHeader";
import { ViewToolbar } from "@/components/report/ViewToolbar";
import { FilterChips } from "@/components/report/FilterChips";
import { getT } from "@/lib/i18n";

interface PageProps {
  params: Promise<{ tenantSlug: string; workbookSlug: string; viewSlug: string }>;
}

export default async function ViewEmbedPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) notFound();
  const ctx = tenantFromSession(session);
  if (!ctx) notFound();

  const { tenantSlug, workbookSlug, viewSlug } = await params;
  const { locale, t } = await getT();

  const tenantRecord = await getTenant(tenantSlug);
  const { dashboards } = await getUserCatalog(session, tenantSlug);
  const dashboard = dashboards.find(
    (d) => d.workbookSlug === workbookSlug && d.viewSlug === viewSlug,
  );
  if (!dashboard) notFound();

  const siblings = dashboards.filter((d) => d.workbookSlug === workbookSlug);

  // View counting happens client-side on the viz `firstinteractive` event
  // (TableauVizShell → POST /api/views/record), so it only counts views that
  // actually loaded. Recording again here on every server render would
  // double-count popular-views (HL-05).

  if (!isTableauConfigured()) {
    // No in-page breadcrumb — the global one (SH-03) already shows the path (FX-12).
    return <UnconfiguredState viewPath={dashboard.viewPath} locale={locale} />;
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
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 py-6">
            <EmptyState
              tone="warning"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              }
              title={t("view.quotaTitle")}
              body={t("view.quotaBody", { tenant: ctx.tenantName, used: e.status.used, cap: e.status.cap })}
              action={
                <div className="flex items-center gap-2">
                  <Link href={`/t/${tenantSlug}`} className="rounded-lg border border-sf-neutral-3 bg-white px-3 py-1.5 text-caption font-semibold text-sf-neutral-8 transition-colors hover:border-brand/40 hover:text-brand">
                    {t("th.pulseMetrics")}
                  </Link>
                  <Link href={`/t/${tenantSlug}/agent`} className="rounded-lg bg-brand px-3 py-1.5 text-caption font-semibold text-brand-on transition-all hover:brightness-110">
                    {t("view.askAi")}
                  </Link>
                </div>
              }
            />
          </div>
        </div>
      );
    }
    throw e;
  }

  const src = resolvedSiteViewUrl(site, dashboard.viewPath);

  return (
    // VizContextProvider wraps the whole view (not just the viz row) so the
    // "Hỏi AI" toggle in the top bar can read selectedMarks for its count badge.
    <VizContextProvider>
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* View header: name + freshness + in-place sheet tabs + chat toggle (RV-01).
          The path breadcrumb comes from the global one (SH-03). */}
      <ViewHeader
        tenantSlug={tenantSlug}
        workbookSlug={workbookSlug}
        workbookName={dashboard.workbookName}
        projectName={dashboard.projectName}
        viewName={dashboard.viewName}
        updatedAt={dashboard.updatedAt}
        tabs={siblings.map((s) => ({ viewSlug: s.viewSlug, viewName: s.viewName }))}
        locale={locale}
        rightSlot={
          <>
            <ViewToolbar locale={locale} />
            <ChatPanelToggle locale={locale} />
          </>
        }
      />

      {/* Active-filter chips (RV-03) — hidden when there are no filters */}
      <FilterChips locale={locale} />

      {/* Main content: viz + chat side by side, fills remaining space */}
      <div className="flex flex-1 min-h-0" style={{ minHeight: "500px" }}>
          {/* Tableau embed — fills remaining width */}
          <div className="flex-1 min-w-0 min-h-0">
            <TableauVizShell
              src={src}
              initialToken={token}
              height="100%"
              locale={locale}
              isInternal={ctx.isInternal}
              viewMeta={{
                workbookSlug,
                viewSlug,
                workbookName: dashboard.workbookName,
                viewName: dashboard.viewName,
                projectName: dashboard.projectName,
              }}
            />
          </div>
          {/* Chat panel — collapsible, resizable/overlay/bottom-sheet (RV-07) */}
          <ChatPanelWrapper locale={locale}>
            <ChatPanel
              locale={locale}
              isInternal={ctx.isInternal}
              tenantSlug={tenantSlug}
              suggestions={getAgentSuggestions({
                slug: tenantSlug,
                industry: tenantRecord?.industry,
                viewName: dashboard.viewName,
                locale,
              })}
            />
          </ChatPanelWrapper>
        </div>
    </div>
    </VizContextProvider>
  );
}
