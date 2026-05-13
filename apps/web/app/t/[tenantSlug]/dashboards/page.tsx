import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listDashboardsForTenant } from "@/lib/dashboards";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function DashboardsIndex({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  const { tenantSlug } = await params;
  const dashboards = listDashboardsForTenant({ isInternal: ctx?.isInternal ?? false });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Dashboards</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Pick a dashboard to embed. Phase 2: read-only embed. Phase 3+ adds the AI chat
          side-panel.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {dashboards.map((d) => (
          <li key={d.id}>
            <Link
              href={`/t/${tenantSlug}/dashboards/${d.id}`}
              className="block rounded-lg border border-[hsl(var(--border))] p-4 transition hover:border-brand hover:shadow-sm"
            >
              <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {d.industry}
              </span>
              <h3 className="mt-1 font-medium">{d.name}</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{d.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
