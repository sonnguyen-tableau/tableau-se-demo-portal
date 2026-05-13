import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getDashboard } from "@/lib/dashboards";
import { env } from "@/lib/env";
import { isTableauConfigured, tableauViewUrl } from "@/lib/tableau-config";
import { enforceImpressionBudget, ImpressionBudgetExceededError } from "@/lib/billing";
import { mintTableauJwt } from "@portal/tableau-jwt";
import { TableauVizShell } from "@/components/embed/TableauVizShell";
import { UnconfiguredState } from "@/components/embed/UnconfiguredState";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { VizContextProvider } from "@/components/bridge/VizContextProvider";

interface PageProps {
  params: Promise<{ tenantSlug: string; dashboardId: string }>;
}

export default async function DashboardEmbedPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) notFound();
  const ctx = tenantFromSession(session);
  if (!ctx) notFound();

  const { tenantSlug, dashboardId } = await params;
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) notFound();
  if (dashboard.scope === "internal" && !ctx.isInternal) notFound();

  const breadcrumb = (
    <div className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
      <Link href={`/t/${tenantSlug}`} className="underline-offset-2 hover:underline">
        {ctx.tenantName}
      </Link>{" "}
      /{" "}
      <Link href={`/t/${tenantSlug}/dashboards`} className="underline-offset-2 hover:underline">
        Dashboards
      </Link>{" "}
      / <span>{dashboard.name}</span>
    </div>
  );

  if (!isTableauConfigured()) {
    return (
      <section className="space-y-4">
        {breadcrumb}
        <h2 className="text-lg font-semibold">{dashboard.name}</h2>
        <UnconfiguredState viewPath={dashboard.viewPath} />
      </section>
    );
  }

  // Server-side JWT mint. The embed receives the same token; the client
  // refreshes on auth error via /api/tableau/token.
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
        <section className="space-y-4">
          {breadcrumb}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h3 className="font-semibold">Daily impression cap reached</h3>
            <p className="mt-1 text-sm">
              {ctx.tenantName} has used {e.status.used} of {e.status.cap} dashboard impressions
              today. The counter resets at UTC midnight.
            </p>
          </div>
        </section>
      );
    }
    throw e;
  }

  const src = tableauViewUrl(dashboard.viewPath);

  return (
    <section className="space-y-4">
      {breadcrumb}
      <header>
        <h2 className="text-lg font-semibold">{dashboard.name}</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{dashboard.description}</p>
      </header>
      <VizContextProvider>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TableauVizShell src={src} initialToken={token} />
          <div className="min-h-[640px]">
            <ChatPanel />
          </div>
        </div>
      </VizContextProvider>
    </section>
  );
}
