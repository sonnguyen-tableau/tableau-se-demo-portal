import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { canAccessTenant, tenantFromSession, workspaceDisplayName } from "@/lib/tenant";
import { getTenantTheme, themeToCssVariables } from "@/lib/tenant-theme";
import { getTenant } from "@/lib/tenants";
import { getUserCatalog } from "@/lib/user-catalog";
import { SidebarProvider, SidebarWrapper, SidebarToggle } from "@/components/layout/SidebarShell";
import { ChatPanelProvider } from "@/components/layout/ChatPanelToggle";
import { PinsProvider } from "@/components/pins/PinsProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { SidebarContent } from "@/components/layout/SidebarContent";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";
import { SearchTrigger } from "@/components/layout/SearchTrigger";
import { CommandPalette, type PaletteItem } from "@/components/layout/CommandPalette";
import { getRecentViews } from "@/lib/view-history";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { UserMenu } from "@/components/layout/UserMenu";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { getT } from "@/lib/i18n";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantLayout({ children, params }: LayoutProps) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { tenantSlug } = await params;
  const ctx = tenantFromSession(session);
  const { locale, t } = await getT();
  if (!canAccessTenant(ctx, tenantSlug)) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-h2 font-semibold">{t("nav.noAccessTitle")}</h1>
        <p className="mt-2 text-body-sm text-sf-neutral-6">
          {t("nav.noAccessBody", { slug: tenantSlug })}
        </p>
      </main>
    );
  }

  // Resolve theme + workspace name from the URL tenant (tenantSlug), not the
  // session tenant, so an internal user viewing another portal gets THAT
  // tenant's brand/name — not their own (FX-06; also a prerequisite for AU-04).
  const [rawTheme, catalog, tenantRecord] = await Promise.all([
    getTenantTheme(tenantSlug),
    getUserCatalog(session, tenantSlug),
    getTenant(tenantSlug),
  ]);
  const theme = {
    primary: rawTheme.primaryColor,
    logoUrl: rawTheme.logoUrl,
    logoLayout: rawTheme.logoLayout ?? "icon",
    companyName: rawTheme.companyName,
    cssText: themeToCssVariables(rawTheme),
  } as const;
  const tenantName = workspaceDisplayName(tenantSlug, tenantRecord?.name ?? ctx?.tenantName ?? tenantSlug);
  const userEmail = session.user.email ?? "";

  // Breadcrumb name map (SH-03): resolve workbook/view slugs to human names so
  // the global breadcrumb never shows a raw slug. Keyed by tenant-relative path.
  const crumbNames: Record<string, string> = {};
  for (const d of catalog.dashboards) {
    crumbNames[`dashboards/${d.workbookSlug}`] = d.workbookName;
    crumbNames[`dashboards/${d.workbookSlug}/${d.viewSlug}`] = d.viewName;
  }
  const crumbLabels: Record<string, string> = {
    dashboards: t("nav.allDashboards"),
    agent: t("nav.aiAgent"),
    admin: t("nav.sectionAdmin"),
    theme: t("nav.themeConfig"),
    users: t("nav.manageUsers"),
  };

  // Command palette (SH-04): dashboards (each view + each unique workbook) +
  // the user's recent views; passed to the single layout-mounted CommandPalette.
  const paletteItems: PaletteItem[] = [];
  const seenWorkbooks = new Set<string>();
  for (const d of catalog.dashboards) {
    paletteItems.push({
      kind: "view",
      href: `/t/${tenantSlug}/dashboards/${d.workbookSlug}/${d.viewSlug}`,
      title: d.viewName,
      subtitle: d.workbookName,
      projectName: d.projectName,
    });
    if (!seenWorkbooks.has(d.workbookId)) {
      seenWorkbooks.add(d.workbookId);
      paletteItems.push({
        kind: "workbook",
        href: `/t/${tenantSlug}/dashboards/${d.workbookSlug}`,
        title: d.workbookName,
        projectName: d.projectName,
      });
    }
  }
  // Recents are stored per user (not per tenant), so filter them against THIS
  // tenant's visible catalog — a view from another tenant (or a now-hidden
  // workbook) must not surface in the palette (FX-06).
  const catalogViewKeys = new Set(catalog.dashboards.map((d) => `${d.workbookSlug}/${d.viewSlug}`));
  const recentPaletteItems: PaletteItem[] = (await getRecentViews(userEmail))
    .filter((v) => catalogViewKeys.has(`${v.workbookSlug}/${v.viewSlug}`))
    .slice(0, 5)
    .map((v) => ({
      kind: "view",
      href: `/t/${tenantSlug}/dashboards/${v.workbookSlug}/${v.viewSlug}`,
      title: v.viewName,
      subtitle: v.workbookName,
      projectName: "",
    }));

  // Shared by the desktop SidebarWrapper and the mobile MobileNavDrawer so the
  // sidebar markup lives in exactly one place (SH-01).
  const sidebarProps = {
    tenantSlug,
    tenantName,
    theme: {
      logoUrl: theme.logoUrl,
      logoLayout: theme.logoLayout,
      companyName: theme.companyName,
      tagline: rawTheme.tagline,
    },
    catalog,
    isInternal: ctx?.isInternal ?? false,
    t,
  };
  // Fallback mark for the mobile top bar when a tenant has no logo asset.
  const initials =
    theme.companyName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "T";

  // Sidebar collapsed state persists in a cookie so SSR renders it without a
  // flash on reload (SH-02). Default: open (only "0" collapses it).
  const sidebarInitialOpen = (await cookies()).get("sidebar")?.value !== "0";

  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  };

  return (
    <SidebarProvider initialOpen={sidebarInitialOpen}>
    <ChatPanelProvider>
    <PinsProvider locale={locale}>
    <ToastProvider>
    <div
      className="flex h-dvh overflow-hidden bg-sf-neutral-2"
      style={{ ...themeToInlineStyle(theme.cssText), fontFamily: "var(--font-sans)" }}
    >
      {/* ⌘K command palette — one instance for the whole shell (SH-04) */}
      <CommandPalette locale={locale} tenantSlug={tenantSlug} items={paletteItems} recent={recentPaletteItems} />

      {/* ── Sidebar (desktop) ─────────────────────────────────────────────── */}
      <SidebarWrapper>
        <SidebarContent {...sidebarProps} />
      </SidebarWrapper>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 h-full">
        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center gap-4 border-b border-sf-neutral-3 bg-white/95 px-5 py-2.5 shrink-0 backdrop-blur-sm relative z-20">
          <SidebarToggle collapseLabel={t("nav.collapseSidebar")} expandLabel={t("nav.expandSidebar")} />
          <div className="h-6 w-px bg-sf-neutral-3" />
          <Breadcrumb tenantSlug={tenantSlug} tenantName={tenantName} names={crumbNames} labels={crumbLabels} />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:block w-80">
              <SearchTrigger locale={locale} />
            </div>
            <LanguageToggle locale={locale} variant="dark" />
            <UserMenu
              email={userEmail}
              signOut={handleSignOut}
              signedInAsLabel={t("common.signedInAs")}
              signOutLabel={t("common.signOut")}
            />
          </div>
        </header>

        {/* Mobile top bar: [≡] logo · name … [search] [avatar] */}
        <header className="flex items-center gap-2 border-b border-sf-neutral-3 bg-white px-3 py-3 lg:hidden shrink-0">
          <MobileNavDrawer openLabel={t("nav.openMenu")} closeLabel={t("nav.closeMenu")}>
            <SidebarContent {...sidebarProps} />
          </MobileNavDrawer>
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt={`${theme.companyName} logo`} className="h-7 w-7 shrink-0 rounded-md object-contain" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-caption font-bold text-brand-on">
              {initials}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-sf-neutral-9">{tenantName}</span>
          <div className="flex items-center gap-1">
            <SearchTrigger locale={locale} variant="icon" />
            <LanguageToggle locale={locale} variant="dark" />
            <UserMenu
              email={userEmail}
              signOut={handleSignOut}
              signedInAsLabel={t("common.signedInAs")}
              signOutLabel={t("common.signOut")}
            />
          </div>
        </header>

        <main className="flex-1 overflow-auto min-h-0 flex flex-col bg-sf-neutral-2">
          <div className="mx-auto w-full max-w-[1600px] p-5 lg:p-7 flex flex-col" style={{ minHeight: "100%" }}>{children}</div>
        </main>
      </div>
    </div>
    </ToastProvider>
    </PinsProvider>
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
