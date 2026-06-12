import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listTenants } from "@/lib/tenants";
import { PortalCatalogManager } from "@/components/admin/PortalCatalogManager";

export const metadata = { title: "Portal Catalog — Admin" };
export const dynamic = "force-dynamic";

export default async function PortalsAdminPage() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const tenants = await listTenants();
  const active = tenants.filter((t) => t.status === "active");

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <nav className="flex gap-3 text-sm">
        <Link href="/admin/tenants" className="text-[hsl(var(--muted-foreground))] hover:underline">
          Tenants
        </Link>
        <span className="text-[hsl(var(--muted-foreground))]">·</span>
        <span className="font-semibold">Portals</span>
        <span className="text-[hsl(var(--muted-foreground))]">·</span>
        <Link href="/admin/sites" className="text-[hsl(var(--muted-foreground))] hover:underline">
          Tableau Sites
        </Link>
      </nav>

      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Internal admin
          </p>
          <h1 className="text-2xl font-semibold">Portal Catalog</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Quản lý từng portal demo — set portal mặc định và chọn Tableau folders hiển thị cho mỗi portal.
          </p>
        </div>
        <Link
          href="/factory/direct"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Tạo portal mới
        </Link>
      </header>

      <PortalCatalogManager tenants={active} />
    </main>
  );
}
