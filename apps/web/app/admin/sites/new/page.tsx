import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { SiteConfigForm } from "@/components/admin/SiteConfigForm";

export default async function NewSitePage() {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <header>
        <nav className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          <Link href="/admin/sites" className="hover:underline">
            Tableau Sites
          </Link>
          <span>/</span>
          <span>New</span>
        </nav>
        <h1 className="mt-1 text-2xl font-semibold">New Tableau Site</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Tạo mới một Tableau Cloud site config. Secret value sẽ được mã hóa AES-256-GCM trước khi lưu.
        </p>
      </header>

      <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-6 shadow-sm">
        <SiteConfigForm mode="create" />
      </div>
    </main>
  );
}
