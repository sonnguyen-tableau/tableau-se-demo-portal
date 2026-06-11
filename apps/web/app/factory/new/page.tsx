import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";
import { listSiteConfigs } from "@/lib/site-config";
import { LaunchWizard } from "@/components/factory/LaunchWizard";

export default async function FactoryNewPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold">Internal-only</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          The Demo Factory is only available to internal users while it&apos;s in early access.
        </p>
      </main>
    );
  }

  const sites = await listSiteConfigs();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header>
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Demo Factory
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Launch Portal</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Nhập URL website khách hàng. Pipeline sẽ tự động scrape, phân tích với Claude,
          sinh 2 năm dữ liệu tổng hợp, publish lên Tableau Cloud, tạo Pulse metrics và
          provisioning portal tenant hoàn chỉnh — trong khoảng 5–7 phút.
        </p>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          Muốn nhập trực tiếp tất cả tham số?{" "}
          <Link href="/factory/direct" className="text-brand underline hover:no-underline">
            Dùng Direct mode →
          </Link>
        </p>
      </header>

      <LaunchWizard
        sites={sites}
        factoryConfigured={!!env.FACTORY_URL}
      />
    </main>
  );
}
