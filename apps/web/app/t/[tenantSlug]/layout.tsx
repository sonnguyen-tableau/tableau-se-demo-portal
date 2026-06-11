import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { canAccessTenant, tenantFromSession } from "@/lib/tenant";
import { getTenantTheme, themeToCssVariables } from "@/lib/tenant-theme";
import { getLiveCatalog } from "@/lib/tableau-rest";
import { getTenant } from "@/lib/tenants";
import { SalesforceBankIcon } from "@/components/SalesforceBankLogo";
import { ProjectTree } from "@/components/nav/ProjectTree";
import { SidebarProvider, SidebarWrapper, SidebarToggle } from "@/components/layout/SidebarShell";
import { ChatPanelProvider } from "@/components/layout/ChatPanelToggle";
import { NavLabel, NavLink } from "@/components/layout/SidebarNav";
import { SearchTrigger } from "@/components/layout/SearchTrigger";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { UserMenu } from "@/components/layout/UserMenu";

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
        <h1 className="text-h2 font-semibold">Không có quyền truy cập</h1>
        <p className="mt-2 text-body-sm text-sf-neutral-6">
          Bạn không có quyền truy cập vào <code className="font-mono">{tenantSlug}</code>.
        </p>
      </main>
    );
  }

  const tenantRecord = await getTenant(tenantSlug);
  const [rawTheme, catalog] = await Promise.all([
    getTenantTheme(ctx?.tenantId ?? tenantSlug),
    getLiveCatalog(ctx?.tenantId, tenantRecord?.allowedProjects),
  ]);
  const theme = {
    primary: rawTheme.primaryColor,
    logoUrl: rawTheme.logoUrl,
    companyName: rawTheme.companyName,
    cssText: themeToCssVariables(rawTheme),
  } as const;
  const tenantName = ctx?.tenantName ?? tenantSlug;
  const userEmail = session.user.email ?? "";

  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  };

  return (
    <SidebarProvider>
    <ChatPanelProvider>
    <div
      className="flex h-dvh overflow-hidden bg-sf-neutral-2"
      style={{ ...themeToInlineStyle(theme.cssText), fontFamily: "var(--font-sans)" }}
    >
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <SidebarWrapper>
        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 py-5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/8 ring-1 ring-white/10"
          >
            {theme.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt={`${theme.companyName} logo`} className="h-full w-full object-contain" />
            ) : (
              <SalesforceBankIcon size={22} />
            )}
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-body-sm font-bold text-white truncate">{theme.companyName}</span>
            <span className="text-meta font-medium uppercase tracking-[0.16em] text-sf-blue-40">Analytics Portal</span>
          </div>
        </div>

        {/* Tenant badge */}
        <div className="mx-4 mt-1 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm">
          <p className="text-meta font-semibold uppercase tracking-[0.14em] text-sf-blue-40">Workspace</p>
          <p className="mt-0.5 text-body-sm font-semibold text-white truncate">{tenantName}</p>
        </div>

        {/* Nav */}
        <nav className="mt-5 flex flex-col flex-1 min-h-0 px-3">
          <div className="space-y-1">
            <NavLabel>Phân tích</NavLabel>
            <NavLink href={`/t/${tenantSlug}`} exact icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            }>Trang chủ</NavLink>
            <NavLink href={`/t/${tenantSlug}/dashboards`} icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            }>Tất cả Dashboards</NavLink>
          </div>

          {/* Project tree — scrollable */}
          {catalog.projects.length > 0 && (
            <>
              <div className="my-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <NavLabel>Dự án</NavLabel>
              <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
                <ProjectTree
                  projects={catalog.projects}
                  dashboards={catalog.dashboards}
                  tenantSlug={tenantSlug}
                />
              </div>
            </>
          )}

          {/* AI section */}
          <div className="mt-3 pt-3 space-y-1 border-t border-white/[0.06]">
            <NavLabel>AI</NavLabel>
            <NavLink href={`/t/${tenantSlug}/agent`} badge="Beta" icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            }>AI Agent</NavLink>
          </div>

          {/* Admin — internal only */}
          {ctx?.isInternal && (
            <div className="mt-3 pt-3 space-y-1 border-t border-white/[0.06]">
              <NavLabel>Admin</NavLabel>
              <NavLink href={`/t/${tenantSlug}/admin/users`} icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              }>Quản lý người dùng</NavLink>
              <NavLink href={`/t/${tenantSlug}/admin`} exact icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              }>Cấu hình catalog</NavLink>
              <NavLink href={`/t/${tenantSlug}/admin/theme`} icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              }>Tuỳ chỉnh giao diện</NavLink>
              <NavLink href="/admin/tenants" icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
              }>Tenants &amp; Sites</NavLink>
            </div>
          )}
        </nav>

        {/* Footer signature */}
        <div className="px-5 py-4 border-t border-white/[0.06]">
          <p className="text-meta text-white/40 leading-relaxed">
            Powered by <span className="font-semibold text-white/70">Tableau</span> + <span className="font-semibold text-white/70">Claude</span>
          </p>
        </div>
      </SidebarWrapper>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center gap-4 border-b border-sf-neutral-3 bg-white/95 px-5 py-2.5 shrink-0 backdrop-blur-sm">
          <SidebarToggle />
          <div className="h-6 w-px bg-sf-neutral-3" />
          <Breadcrumb tenantSlug={tenantSlug} tenantName={tenantName} />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:block w-80">
              <SearchTrigger />
            </div>
            <UserMenu email={userEmail} signOut={handleSignOut} />
          </div>
        </header>

        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-sf-neutral-3 bg-white px-4 py-3 lg:hidden shrink-0">
          <div className="flex items-center gap-2">
            <SalesforceBankIcon size={26} />
            <span className="text-body-sm font-semibold text-sf-neutral-9">{tenantName}</span>
          </div>
          <UserMenu email={userEmail} signOut={handleSignOut} />
        </header>

        <main className="flex-1 overflow-auto min-h-0 flex flex-col bg-sf-neutral-2">
          <div className="mx-auto w-full max-w-[1600px] p-5 lg:p-7 flex flex-col" style={{ minHeight: "100%" }}>{children}</div>
        </main>
      </div>
    </div>
    </ChatPanelProvider>
    </SidebarProvider>
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
