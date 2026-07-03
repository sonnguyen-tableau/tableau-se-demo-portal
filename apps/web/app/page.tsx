import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { listTenants } from "@/lib/tenants";
import type { TenantRecord } from "@/lib/tenants";

export default async function Home() {
  const session = await auth();

  // Not logged in → sign-in
  if (!session?.user) {
    redirect("/sign-in");
  }

  const ctx = tenantFromSession(session);

  // Regular tenant user → straight to their portal
  if (!ctx?.isInternal) {
    redirect(`/t/${ctx?.tenantId ?? "salesforce-bank"}`);
  }

  // Internal admin → hub
  const tenants = (await listTenants()).filter((t) => t.status === "active");

  return <AdminHub tenants={tenants} email={session.user.email ?? ""} />;
}

// ── Industry icons ───────────────────────────────────────────────────────────

const INDUSTRY_ICON: Record<string, string> = {
  "retail-banking": "🏦",
  "retail-mall": "🏬",
  "retail-mediamart": "📺",
  "retail-realestate": "🏢",
  "retail-ecommerce": "🛒",
  "ecommerce": "🛒",
  "insurance": "🛡️",
  "healthcare": "🏥",
  "logistics": "🚚",
  "manufacturing": "🏭",
  "telco": "📡",
};

function industryIcon(industry: string | undefined) {
  return INDUSTRY_ICON[industry ?? ""] ?? "📊";
}

// ── Admin Hub ────────────────────────────────────────────────────────────────

function AdminHub({ tenants, email }: { tenants: TenantRecord[]; email: string }) {
  return (
    <div className="min-h-dvh bg-sf-neutral-1 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-sf-neutral-3 bg-white/95 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sf-blue-60 to-sf-blue-80 text-white font-bold text-sm shadow-elev-1">
            T
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-body-sm font-bold text-sf-neutral-10">Tableau AI Portal</span>
            <span className="text-meta text-sf-neutral-5">Admin Hub</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-caption text-sf-neutral-5 hidden sm:block">{email}</span>
          <Link
            href="/api/auth/signout"
            className="text-caption text-sf-neutral-5 hover:text-sf-neutral-9 transition-colors"
          >
            Đăng xuất
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10 space-y-12">

        {/* Portals section */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-h3 font-bold text-sf-neutral-10">Demo Portals</h2>
              <p className="text-body-sm text-sf-neutral-5 mt-0.5">
                {tenants.length} portal đang hoạt động
              </p>
            </div>
            <Link
              href="/admin/portals"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2 text-body-sm font-medium text-sf-neutral-7 hover:border-sf-neutral-4 hover:bg-sf-neutral-2 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Quản lý
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((t) => (
              <PortalCard key={t.slug} tenant={t} />
            ))}
            <NewPortalCard />
          </div>
        </section>

        {/* Admin tools */}
        <section>
          <h2 className="text-h3 font-bold text-sf-neutral-10 mb-5">Công cụ quản trị</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminToolCard
              href="/admin/portals"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />}
              label="Portal Catalog"
              desc="Gắn folder Tableau theo từng portal"
            />
            <AdminToolCard
              href="/admin/tenants"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />}
              label="Tenants & Sites"
              desc="Cấu hình site Tableau, Connected App"
            />
            <AdminToolCard
              href="/factory"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />}
              label="Demo Factory"
              desc="Tạo portal demo mới từ URL"
            />
            <AdminToolCard
              href="/api/health"
              icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />}
              label="System Health"
              desc="Kiểm tra trạng thái hệ thống"
              external
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-sf-neutral-3 py-4 text-center text-meta text-sf-neutral-4">
        Tableau AI Portal · Internal Admin · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

// ── Portal card ──────────────────────────────────────────────────────────────

function PortalCard({ tenant }: { tenant: TenantRecord }) {
  const icon = industryIcon(tenant.industry);
  const folders = tenant.allowedProjects ?? [];

  return (
    <Link
      href={`/t/${tenant.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-sf-neutral-3 bg-white p-5 transition-all duration-base ease-smooth hover:-translate-y-0.5 hover:border-sf-blue-70/40 hover:shadow-elev-2"
    >
      {/* top-edge shimmer on hover */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-transparent via-sf-blue-60 to-transparent transition-transform duration-base ease-smooth group-hover:scale-x-100"
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sf-neutral-2 text-2xl ring-1 ring-sf-neutral-3 group-hover:ring-sf-blue-70/30 transition-colors">
          {icon}
        </div>
        {tenant.isDefault && (
          <span className="shrink-0 rounded-full bg-sf-blue-10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sf-blue-80">
            Mặc định
          </span>
        )}
      </div>

      <p className="text-body-sm font-bold text-sf-neutral-10 truncate">{tenant.name}</p>
      <p className="text-caption text-sf-neutral-5 font-mono mt-0.5 mb-3">/t/{tenant.slug}</p>

      {folders.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {folders.slice(0, 2).map((f) => (
            <span key={f} className="rounded bg-sf-neutral-2 px-1.5 py-0.5 text-[10px] font-mono text-sf-neutral-6">
              {f.split("/").pop()}
            </span>
          ))}
          {folders.length > 2 && (
            <span className="rounded bg-sf-neutral-2 px-1.5 py-0.5 text-[10px] text-sf-neutral-5">
              +{folders.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto pt-3 flex items-center gap-1 text-caption font-semibold text-sf-blue-70 opacity-0 transition-opacity duration-base group-hover:opacity-100">
        Mở portal
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function NewPortalCard() {
  return (
    <Link
      href="/factory"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sf-neutral-3 p-5 text-sf-neutral-4 transition-all duration-base ease-smooth hover:border-sf-blue-70/40 hover:bg-sf-blue-10/40 hover:text-sf-blue-70 min-h-[160px]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/20 bg-current/5">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <span className="text-body-sm font-medium">Tạo portal mới</span>
    </Link>
  );
}

// ── Admin tool card ──────────────────────────────────────────────────────────

function AdminToolCard({
  href,
  icon,
  label,
  desc,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  external?: boolean;
}) {
  const inner = (
    <div className="group flex flex-col gap-3 rounded-xl border border-sf-neutral-3 bg-white p-4 transition-all duration-base ease-smooth hover:border-sf-blue-70/40 hover:shadow-elev-1 cursor-pointer">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sf-neutral-2 text-sf-neutral-6 group-hover:bg-sf-blue-10 group-hover:text-sf-blue-70 transition-colors">
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          {icon}
        </svg>
      </div>
      <div>
        <p className="text-body-sm font-semibold text-sf-neutral-9">{label}</p>
        <p className="text-caption text-sf-neutral-5 mt-0.5">{desc}</p>
      </div>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return <Link href={href}>{inner}</Link>;
}
