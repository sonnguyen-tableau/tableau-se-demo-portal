import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getSiteConfig } from "@/lib/site-config";
import type { SiteConfigPublic } from "@/lib/site-config";
import { SiteConfigForm } from "@/components/admin/SiteConfigForm";
import { DeleteSiteButton } from "@/components/admin/DeleteSiteButton";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function EditSitePage({ params }: Props) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const { siteId } = await params;
  const site = await getSiteConfig(siteId);
  if (!site) notFound();

  // Strip secret before passing to client form
  const { connectedAppSecretValue: _secret, ...publicSite }: typeof site = site;
  const initial: SiteConfigPublic = publicSite;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <header className="flex items-end justify-between">
        <div>
          <nav className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            <Link href="/admin/sites" className="hover:underline">
              Tableau Sites
            </Link>
            <span>/</span>
            <span className="font-mono">{siteId}</span>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">{site.label}</h1>
          <p className="mt-1 font-mono text-xs text-[hsl(var(--muted-foreground))]">
            {site.tableauSiteName} · v{site.tableauSiteVersion}
          </p>
        </div>
        <DeleteSiteButton siteId={siteId} label={site.label} />
      </header>

      <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-6 shadow-sm">
        <SiteConfigForm mode="edit" initial={initial} />
      </div>
    </main>
  );
}
