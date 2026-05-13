import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getImpressionStatus } from "@/lib/billing";
import { env } from "@/lib/env";
import { isTableauConfigured } from "@/lib/tableau-config";
import { getPulseConfig, pulseSrc } from "@/lib/pulse";
import { mintTableauJwt } from "@portal/tableau-jwt";
import { TableauPulseCard } from "@/components/embed/TableauPulseCard";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantHome({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const { tenantSlug } = await params;
  const impressions = ctx ? await getImpressionStatus(ctx.tenantId) : null;
  const pulse = ctx ? getPulseConfig(ctx.tenantId) : null;
  const showPulse = pulse && pulse.metrics.length > 0 && isTableauConfigured() && ctx;
  const pulseToken = showPulse
    ? await mintTableauJwt(
        {
          clientId: env.TABLEAU_CONNECTED_APP_CLIENT_ID,
          secretId: env.TABLEAU_CONNECTED_APP_SECRET_ID,
          secretValue: env.TABLEAU_CONNECTED_APP_SECRET_VALUE,
        },
        {
          sub: session!.user!.email ?? "",
          scopes: ["tableau:insights:embed", "tableau:views:embed"],
          tenantId: ctx!.tenantId,
          ...(ctx!.region ? { region: ctx!.region } : {}),
          ...(ctx!.groups.length > 0 ? { groups: ctx!.groups } : {}),
        },
      ).catch(() => null)
    : null;

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold">Welcome, {ctx?.tenantName}</h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Phase 2 scaffold ready: embedded Tableau dashboards with multi-tenant JWT and impression
          budget enforcement. AI agent layer arrives in Phase 3.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[hsl(var(--muted-foreground))]">Tenant ID</dt>
            <dd className="font-mono">{tenantSlug}</dd>
          </div>
          <div>
            <dt className="text-[hsl(var(--muted-foreground))]">Region</dt>
            <dd className="font-mono">{ctx?.region ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[hsl(var(--muted-foreground))]">Internal</dt>
            <dd className="font-mono">{ctx?.isInternal ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="text-[hsl(var(--muted-foreground))]">Impressions today</dt>
            <dd className="font-mono">
              {impressions ? `${impressions.used} / ${impressions.cap}` : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <Link
        href={`/t/${tenantSlug}/dashboards`}
        className="block rounded-lg border border-[hsl(var(--border))] p-6 transition hover:border-brand hover:shadow-sm"
      >
        <h3 className="font-medium">Browse dashboards →</h3>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Embedded TableauViz with row-level security applied via JWT user attributes.
        </p>
      </Link>

      {showPulse && pulseToken && pulse ? (
        <div>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Key metrics
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pulse.metrics.map((m) => (
              <TableauPulseCard
                key={m.id}
                name={m.name}
                src={pulseSrc(m)}
                token={pulseToken}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
