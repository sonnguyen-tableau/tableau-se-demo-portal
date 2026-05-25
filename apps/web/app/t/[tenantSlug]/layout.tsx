import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { canAccessTenant, tenantFromSession } from "@/lib/tenant";
import { getTenantTheme, themeToCssVariables } from "@/lib/tenant-theme";
import { getLiveCatalog } from "@/lib/tableau-rest";
import { SalesforceBankIcon } from "@/components/SalesforceBankLogo";
import { ProjectTree } from "@/components/nav/ProjectTree";
import { SidebarProvider, SidebarWrapper, SidebarToggle } from "@/components/layout/SidebarShell";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantLayout({ children, params }: LayoutProps) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { tenantSlug } = await params;
  const ctx = tenantFromSession(session);
  if (!canAccessTenant(ctx, tenantSlug)) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm text-sf-neutral-6">
          Bạn không có quyền truy cập vào <code>{tenantSlug}</code>.
        </p>
      </main>
    );
  }

  const [rawTheme, catalog] = await Promise.all([
    getTenantTheme(ctx?.tenantId ?? tenantSlug),
    getLiveCatalog(),
  ]);
  const theme = {
    primary: rawTheme.primaryColor,
    logoUrl: rawTheme.logoUrl,
    companyName: rawTheme.companyName,
    cssText: themeToCssVariables(rawTheme),
  } as const;

  return (
    <SidebarProvider>
    <div
      className="flex h-dvh overflow-hidden bg-sf-neutral-2"
      style={{ ...(themeToInlineStyle(theme.cssText)) }}
    >
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <SidebarWrapper>
        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt="logo" className="h-8 w-8 rounded object-contain shrink-0" />
          ) : (
            <SalesforceBankIcon size={32} />
          )}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold text-white truncate">{theme.companyName}</span>
            <span className="text-[10px] font-medium text-blue-300 uppercase tracking-widest">Analytics Portal</span>
          </div>
        </div>

        {/* Tenant badge */}
        <div className="mx-4 mt-4 rounded-md bg-white/8 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">Workspace</p>
          <p className="mt-0.5 text-sm font-medium text-white truncate">{ctx?.tenantName ?? tenantSlug}</p>
        </div>

        {/* Nav */}
        <nav className="mt-4 flex flex-col flex-1 min-h-0 px-3">
          {/* Top links */}
          <div className="space-y-0.5">
            <NavLabel>Phân tích</NavLabel>
            <NavLink href={`/t/${tenantSlug}`} icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            }>Trang chủ</NavLink>
            <NavLink href={`/t/${tenantSlug}/dashboards`} icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            }>Tất cả Dashboards</NavLink>
          </div>

          {/* Project tree — scrollable */}
          {catalog.projects.length > 0 && (
            <>
              <div className="my-3 border-t border-white/10" />
              <NavLabel>Dự án</NavLabel>
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-white/10">
                <ProjectTree
                  projects={catalog.projects}
                  dashboards={catalog.dashboards}
                  tenantSlug={tenantSlug}
                />
              </div>
            </>
          )}

          {/* AI section */}
          <div className="mt-2 border-t border-white/10 pt-3 space-y-0.5">
            <NavLabel>AI</NavLabel>
            <NavLink href={`/t/${tenantSlug}/agent`} badge="New" icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            }>AI Agent</NavLink>
          </div>

          {/* Admin — internal only */}
          {ctx?.isInternal && (
            <div className="mt-2 border-t border-white/10 pt-3 space-y-0.5">
              <NavLabel>Admin</NavLabel>
              <NavLink href={`/t/${tenantSlug}/admin/users`} icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              }>Quản lý người dùng</NavLink>
              <NavLink href={`/t/${tenantSlug}/admin`} icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              }>Cấu hình catalog</NavLink>
              <NavLink href={`/t/${tenantSlug}/admin/theme`} icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              }>Tuỳ chỉnh giao diện</NavLink>
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-white/10 px-3 py-4 space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sf-blue-60 text-xs font-bold text-white">
              {session.user.email?.slice(0, 1).toUpperCase()}
            </div>
            <p className="truncate text-xs text-blue-200">{session.user.email}</p>
          </div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/sign-in" }); }}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-blue-300 transition-colors hover:bg-white/8 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Đăng xuất
            </button>
          </form>
        </div>
      </SidebarWrapper>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Desktop top bar — always visible, has sidebar toggle */}
        <header className="hidden lg:flex items-center gap-2 border-b border-sf-neutral-3 bg-white px-4 py-2 shrink-0">
          <SidebarToggle />
          <span className="text-xs text-sf-neutral-5 truncate">{ctx?.tenantName ?? tenantSlug}</span>
        </header>

        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-sf-neutral-3 bg-white px-5 py-3 lg:hidden shrink-0">
          <div className="flex items-center gap-2">
            <SalesforceBankIcon size={26} />
            <span className="text-sm font-semibold text-sf-neutral-9">{ctx?.tenantName ?? tenantSlug}</span>
          </div>
          <span className="text-xs text-sf-neutral-6">{session.user.email}</span>
        </header>

        <main className="flex-1 overflow-auto min-h-0 flex flex-col">
          <div className="mx-auto w-full max-w-[1600px] p-4 flex flex-col" style={{ minHeight: "100%" }}>{children}</div>
        </main>
      </div>
    </div>
    </SidebarProvider>
  );
}

function NavLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-blue-300/70">
      {children}
    </p>
  );
}

function NavLink({
  href,
  icon,
  badge,
  children,
}: {
  href: string;
  icon: ReactNode;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {icon}
      </svg>
      <span className="flex-1">{children}</span>
      {badge && (
        <span className="rounded-full bg-sf-blue-60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

function themeToInlineStyle(cssText: string): Record<string, string> {
  return Object.fromEntries(
    cssText.split(";").map((d) => d.trim()).filter(Boolean)
      .map((d) => {
        const [k, ...rest] = d.split(":");
        return [(k ?? "").trim(), rest.join(":").trim()] as const;
      })
      .filter(([k]) => k.startsWith("--")),
  );
}
