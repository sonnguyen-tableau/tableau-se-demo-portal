import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getLiveCatalog } from "@/lib/tableau-rest";
import { env } from "@/lib/env";
import { isTableauConfigured, tableauViewUrl } from "@/lib/tableau-config";
import { enforceImpressionBudget, ImpressionBudgetExceededError } from "@/lib/billing";
import { mintTableauJwt } from "@portal/tableau-jwt";
import { TableauVizShell } from "@/components/embed/TableauVizShell";
import { UnconfiguredState } from "@/components/embed/UnconfiguredState";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { VizContextProvider } from "@/components/bridge/VizContextProvider";

interface PageProps {
  params: Promise<{ tenantSlug: string; workbookSlug: string; viewSlug: string }>;
}

export default async function ViewEmbedPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) notFound();
  const ctx = tenantFromSession(session);
  if (!ctx) notFound();

  const { tenantSlug, workbookSlug, viewSlug } = await params;

  const catalog = await getLiveCatalog();
  const dashboard = catalog.dashboards.find(
    (d) => d.workbookSlug === workbookSlug && d.viewSlug === viewSlug,
  );
  if (!dashboard) notFound();

  // How many sibling views in this workbook?
  const siblings = catalog.dashboards.filter((d) => d.workbookSlug === workbookSlug);

  const breadcrumb = (
    <nav className="mb-4 flex items-center gap-1.5 text-sm text-sf-neutral-5">
      <Link href={`/t/${tenantSlug}/dashboards`} className="hover:text-sf-neutral-9 transition-colors">
        Dashboards
      </Link>
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      {siblings.length > 1 ? (
        <>
          <Link
            href={`/t/${tenantSlug}/dashboards/${workbookSlug}`}
            className="hover:text-sf-neutral-9 transition-colors"
          >
            {dashboard.workbookName}
          </Link>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-sf-neutral-9">{dashboard.viewName}</span>
        </>
      ) : (
        <span className="font-medium text-sf-neutral-9">{dashboard.workbookName}</span>
      )}
    </nav>
  );

  if (!isTableauConfigured()) {
    return (
      <div className="space-y-4">
        {breadcrumb}
        <h2 className="text-xl font-bold text-sf-neutral-9">{dashboard.workbookName}</h2>
        <UnconfiguredState viewPath={dashboard.viewPath} />
      </div>
    );
  }

  let token: string;
  try {
    await enforceImpressionBudget(ctx.tenantId);
    token = await mintTableauJwt(
      {
        clientId: env.TABLEAU_CONNECTED_APP_CLIENT_ID,
        secretId: env.TABLEAU_CONNECTED_APP_SECRET_ID,
        secretValue: env.TABLEAU_CONNECTED_APP_SECRET_VALUE,
      },
      {
        sub: session.user.email ?? "",
        scopes: ["tableau:views:embed"],
        tenantId: ctx.tenantId,
        ...(ctx.region ? { region: ctx.region } : {}),
        ...(ctx.groups.length > 0 ? { groups: ctx.groups } : {}),
      },
    );
  } catch (e) {
    if (e instanceof ImpressionBudgetExceededError) {
      return (
        <div className="space-y-4">
          {breadcrumb}
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

  const src = tableauViewUrl(dashboard.viewPath);

  return (
    <div className="space-y-4">
      {breadcrumb}

      {/* View switcher — show when workbook has multiple views */}
      {siblings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {siblings.map((s) => (
            <Link
              key={s.viewSlug}
              href={`/t/${tenantSlug}/dashboards/${workbookSlug}/${s.viewSlug}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                s.viewSlug === viewSlug
                  ? "bg-sf-blue-70 text-white"
                  : "border border-sf-neutral-3 bg-white text-sf-neutral-7 hover:border-sf-blue-70 hover:text-sf-blue-70"
              }`}
            >
              {s.viewName}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-sf-neutral-9">
            {siblings.length > 1 ? `${dashboard.workbookName} — ${dashboard.viewName}` : dashboard.workbookName}
          </h2>
          <p className="mt-0.5 text-sm text-sf-neutral-5">{dashboard.projectName}</p>
        </div>
      </div>

      <VizContextProvider>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)]">
          <TableauVizShell src={src} initialToken={token} height="700px" />
          <div className="min-h-[700px]">
            <ChatPanel />
          </div>
        </div>
      </VizContextProvider>
    </div>
  );
}
