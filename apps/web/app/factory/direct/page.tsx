import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";
import { listSiteConfigs } from "@/lib/site-config";
import { DirectLaunchWizard } from "@/components/factory/DirectLaunchWizard";

export const metadata = { title: "Direct Launch — Demo Factory" };

export default async function DirectLaunchPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold">Internal-only</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          The Demo Factory is only available to internal users.
        </p>
      </main>
    );
  }

  const sites = await listSiteConfigs();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header>
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Demo Factory
          </p>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
            Direct Mode
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tạo Portal Trực Tiếp</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Nhập đầy đủ thông tin — không cần AI scrape. Chọn ngành, tuỳ chỉnh quy mô dữ liệu,
          đặt brand colors rồi publish. Pipeline sẽ bỏ qua bước phân tích website và
          tạo portal ngay lập tức.
        </p>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          Muốn AI tự phân tích từ website?{" "}
          <Link href="/factory/new" className="text-brand underline hover:no-underline">
            Dùng URL mode →
          </Link>
        </p>
      </header>

      <DirectLaunchWizard
        sites={sites}
        factoryConfigured={!!env.FACTORY_URL}
      />
    </main>
  );
}
