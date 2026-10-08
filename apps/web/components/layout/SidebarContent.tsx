import type { LiveProject, LiveDashboard } from "@/lib/tableau-rest";
import type { MessageKey } from "@/lib/i18n";
import type { LogoLayout } from "@/lib/tenant-theme";
import { ProjectTree } from "@/components/nav/ProjectTree";
import { NavLabel, NavLink } from "@/components/layout/SidebarNav";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Up-to-2-letter uppercase initials for a company name (logo fallback, FX-08). */
function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "T"
  );
}

interface SidebarContentProps {
  tenantSlug: string;
  tenantName: string;
  theme: {
    logoUrl?: string | undefined;
    logoLayout: LogoLayout;
    companyName: string;
    tagline?: string | undefined;
  };
  catalog: { projects: LiveProject[]; dashboards: LiveDashboard[] };
  isInternal: boolean;
  t: T;
}

/**
 * The sidebar's inner content — brand header, workspace badge, nav, project
 * tree, AI/admin sections, footer. Rendered on the server (so it can take the
 * `t` translator and the catalog directly) and reused by both the desktop
 * SidebarWrapper (≥ lg) and the mobile MobileNavDrawer (< lg): one source of
 * truth, no duplicated markup (SH-01). Sidebar colors come from `--sidebar-text`
 * mixes / `--brand-neutral`; SH-02 finishes the token migration for the tree.
 */
export function SidebarContent({
  tenantSlug,
  tenantName,
  theme,
  catalog,
  isInternal,
  t,
}: SidebarContentProps) {
  return (
    <>
      {/* Brand header */}
      {theme.logoLayout === "wordmark-light" && theme.logoUrl ? (
        // Wide logo whose ink is white/light → render it directly on the dark
        // sidebar. A white plate would hide the white text.
        <div className="flex flex-col gap-2 px-4 py-5">
          <div className="flex items-center justify-center px-1 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={theme.logoUrl}
              alt={`${theme.companyName} logo`}
              className="h-9 w-auto max-h-9 object-contain"
            />
          </div>
          <span className="px-1 text-meta font-medium uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)" }}>
            {theme.tagline || t("common.analyticsPortal")}
          </span>
        </div>
      ) : theme.logoLayout === "wordmark" && theme.logoUrl ? (
        // Wide logo already contains the company name → render it full width on
        // a light plate (dark/colored ink would be unreadable on the dark rail).
        <div className="flex flex-col gap-2 px-4 py-5">
          <div className="flex items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-elev-1 ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={theme.logoUrl}
              alt={`${theme.companyName} logo`}
              className="h-9 w-auto max-h-9 object-contain"
            />
          </div>
          <span className="px-1 text-meta font-medium uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)" }}>
            {theme.tagline || t("common.analyticsPortal")}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)]">
            {theme.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt={`${theme.companyName} logo`} className="h-full w-full object-contain" />
            ) : (
              // Initials tile (FX-08) — a neutral brand mark instead of the
              // hard-coded SalesforceBank glyph when a tenant has no logo asset.
              <span className="text-caption font-bold" style={{ color: "var(--sidebar-text, #fff)" }}>
                {initialsOf(theme.companyName)}
              </span>
            )}
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-body-sm font-bold truncate" style={{ color: "var(--sidebar-text, #fff)" }}>{theme.companyName}</span>
            <span className="text-meta font-medium uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)" }}>
              {theme.tagline || t("common.analyticsPortal")}
            </span>
          </div>
        </div>
      )}

      {/* Tenant badge */}
      <div className="mx-4 mt-1 rounded-xl border border-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)] bg-[color-mix(in_srgb,var(--sidebar-text)_5%,transparent)] px-3 py-2.5 backdrop-blur-sm">
        <p className="text-meta font-semibold uppercase tracking-[0.14em]" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)" }}>{t("nav.workspace")}</p>
        <p className="mt-0.5 text-body-sm font-semibold truncate" style={{ color: "var(--sidebar-text, #fff)" }}>{tenantName}</p>
      </div>

      {/* Nav */}
      <nav className="mt-5 flex flex-col flex-1 min-h-0 px-3">
        <div className="space-y-1">
          <NavLabel>{t("nav.sectionAnalytics")}</NavLabel>
          <NavLink href={`/t/${tenantSlug}`} exact icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          }>{t("nav.home")}</NavLink>
          <NavLink href={`/t/${tenantSlug}/dashboards`} icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          }>{t("nav.allDashboards")}</NavLink>
        </div>

        {/* Project tree — scrollable */}
        {catalog.projects.length > 0 && (
          <>
            <div className="my-4 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--sidebar-text)_14%,transparent)] to-transparent" />
            <NavLabel>{t("nav.sectionProjects")}</NavLabel>
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
        <div className="mt-3 pt-3 space-y-1 border-t border-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)]">
          <NavLabel>{t("nav.sectionAi")}</NavLabel>
          <NavLink href={`/t/${tenantSlug}/agent`} badge="Beta" icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          }>{t("nav.aiAgent")}</NavLink>
        </div>

        {/* Admin — internal only */}
        {isInternal && (
          <div className="mt-3 pt-3 space-y-1 border-t border-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)]">
            <NavLabel>{t("nav.sectionAdmin")}</NavLabel>
            <NavLink href={`/t/${tenantSlug}/admin/users`} icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            }>{t("nav.manageUsers")}</NavLink>
            <NavLink href={`/t/${tenantSlug}/admin`} exact icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            }>{t("nav.catalogConfig")}</NavLink>
            <NavLink href={`/t/${tenantSlug}/admin/theme`} icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            }>{t("nav.themeConfig")}</NavLink>
            <NavLink href="/admin/tenants" icon={
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
            }>{t("nav.tenantsSites")}</NavLink>
          </div>
        )}
      </nav>

      {/* Footer signature */}
      <div className="px-5 py-4 border-t border-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)]">
        <p className="text-meta leading-relaxed" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)" }}>
          Powered by <span className="font-semibold" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 70%, transparent)" }}>Tableau</span> + <span className="font-semibold" style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 70%, transparent)" }}>Salesforce</span>
        </p>
      </div>
    </>
  );
}
