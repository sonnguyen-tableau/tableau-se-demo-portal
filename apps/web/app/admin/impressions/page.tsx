import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getImpressionStatus } from "@/lib/billing";

// Known tenants the dev environment seeds. In Phase 9+ this list comes from
// the database (factory-generated tenants).
const KNOWN_TENANTS = [
  { tenantId: "tenant-acme", tenantName: "Acme Bikes" },
  { tenantId: "tenant-globex", tenantName: "Globex Logistics" },
  { tenantId: "internal", tenantName: "Internal Employees" },
];

export default async function ImpressionsAdminPage() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const rows = await Promise.all(
    KNOWN_TENANTS.map(async (t) => ({
      ...t,
      status: await getImpressionStatus(t.tenantId),
    })),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-6 py-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Internal admin
        </p>
        <h1 className="text-2xl font-semibold">Impression usage</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          In-memory counter. Resets per-process and at UTC midnight. Phase 11 wires this to a
          durable store for cross-instance accuracy.
        </p>
      </header>

      <table className="w-full overflow-hidden rounded-lg border border-[hsl(var(--border))] text-sm">
        <thead className="bg-[hsl(var(--muted))]">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Tenant</th>
            <th className="px-4 py-2 text-left font-medium">ID</th>
            <th className="px-4 py-2 text-right font-medium">Used</th>
            <th className="px-4 py-2 text-right font-medium">Cap</th>
            <th className="px-4 py-2 text-right font-medium">% used</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = r.status.cap > 0 ? Math.round((r.status.used / r.status.cap) * 100) : 0;
            return (
              <tr key={r.tenantId} className="border-t border-[hsl(var(--border))]">
                <td className="px-4 py-2">{r.tenantName}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.tenantId}</td>
                <td className="px-4 py-2 text-right font-mono">{r.status.used}</td>
                <td className="px-4 py-2 text-right font-mono">{r.status.cap}</td>
                <td className="px-4 py-2 text-right font-mono">{pct}%</td>
                <td className="px-4 py-2">
                  {r.status.blocked ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">blocked</span>
                  ) : pct >= 80 ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">warn</span>
                  ) : (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">ok</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
