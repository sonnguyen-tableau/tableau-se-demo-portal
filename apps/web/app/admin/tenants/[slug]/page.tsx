import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenant } from "@/lib/tenants";
import { getTenantTheme } from "@/lib/tenant-theme";
import { getImpressionStatus } from "@/lib/billing";
import { TenantAdminForm } from "@/components/admin/TenantAdminForm";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantAdminDetail({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const { slug } = await params;
  const tenant = await getTenant(slug);
  if (!tenant) notFound();
  const theme = await getTenantTheme(slug);
  const impressions = await getImpressionStatus(slug);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <Link href="/admin/tenants" className="text-xs underline">
          ← Back to tenants
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{tenant.name}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          <span className="font-mono">{tenant.slug}</span> · {tenant.industry} · created{" "}
          {new Date(tenant.createdAt).toLocaleString()}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Status" value={tenant.status} />
        <Stat label="Impressions today" value={`${impressions.used} / ${impressions.cap}`} />
        <Stat
          label="Brand"
          value={`${theme.primaryColor} · ${theme.fontFamily}`}
          mono
        />
      </section>

      <TenantAdminForm tenant={tenant} />
    </main>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
      <div className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={`mt-1 ${mono ? "font-mono" : "font-medium"}`}>{value}</div>
    </div>
  );
}
