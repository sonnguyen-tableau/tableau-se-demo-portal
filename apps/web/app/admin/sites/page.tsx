import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listSiteConfigs } from "@/lib/site-config";
import { listTenants } from "@/lib/tenants";

export default async function AdminSitesPage() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const [sites, allTenants] = await Promise.all([listSiteConfigs(), listTenants()]);

  const tenantsBySite = new Map<string, number>();
  for (const t of allTenants) {
    if (t.siteId) tenantsBySite.set(t.siteId, (tenantsBySite.get(t.siteId) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <nav className="flex gap-3 text-sm">
        <Link href="/admin/tenants" className="text-[hsl(var(--muted-foreground))] hover:underline">
          Tenants
        </Link>
        <span className="text-[hsl(var(--muted-foreground))]">·</span>
        <span className="font-semibold">Tableau Sites</span>
        <span className="text-[hsl(var(--muted-foreground))]">·</span>
        <Link href="/admin/impressions" className="text-[hsl(var(--muted-foreground))] hover:underline">
          Impressions
        </Link>
      </nav>
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Internal admin
          </p>
          <h1 className="text-2xl font-semibold">Tableau Sites</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Mỗi site tương ứng một Tableau Cloud site riêng biệt với Connected App và sidecar
            Railway của nó. Tenant được gán vào site tương ứng.
          </p>
        </div>
        <Link
          href="/admin/sites/new"
          className="rounded-md bg-[hsl(var(--brand,#1a56db))] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + New site
        </Link>
      </header>

      {sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          <p className="font-medium">Chưa có site nào được cấu hình.</p>
          <p className="mt-1">
            Tất cả tenant đang dùng env vars mặc định của deployment.{" "}
            <Link href="/admin/sites/new" className="underline">
              Tạo site đầu tiên
            </Link>{" "}
            để bắt đầu phân tách theo industry.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <div
              key={site.id}
              className="rounded-xl border border-[hsl(var(--border))] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-[hsl(var(--foreground))]">{site.label}</h2>
                  <p className="mt-0.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">{site.id}</p>
                </div>
                <Link
                  href={`/admin/sites/${site.id}`}
                  className="shrink-0 rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
                >
                  Edit
                </Link>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <Row label="Tableau site" value={site.tableauSiteName} mono />
                <Row label="Version" value={site.tableauSiteVersion} mono />
                <Row label="MCP" value={site.mcpUrl ? "configured" : "env fallback"} />
                <Row label="Factory" value={site.factoryUrl ? "configured" : "env fallback"} />
                <Row label="Tenants assigned" value={String(tenantsBySite.get(site.id) ?? 0)} />
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {site.industries.map((ind) => (
                  <span
                    key={ind}
                    className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--foreground))]"
                  >
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.4] p-4 text-sm">
        <h3 className="font-semibold">Tenant chưa gán site</h3>
        <p className="mt-1 text-[hsl(var(--muted-foreground))]">
          {allTenants.filter((t) => !t.siteId).length} tenant đang dùng env vars mặc định.{" "}
          <Link href="/admin/tenants" className="underline">
            Vào quản lý tenant
          </Link>{" "}
          để gán site cho từng tenant.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className={`truncate text-right ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
    </div>
  );
}
