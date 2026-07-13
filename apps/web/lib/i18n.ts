/**
 * Lightweight, dependency-free i18n for the portal chrome.
 *
 * Scope (deliberately narrow — see the product decision): the SIGN-IN page,
 * the ADMIN HOME hub, and the TENANT SIDEBAR/top-bar. Everything else stays
 * Vietnamese for now; extending is just adding keys + wiring one more file.
 *
 * Design choices:
 * - **Cookie-based, no URL prefix.** The locale lives in a `NEXT_LOCALE`
 *   cookie, NOT in the path. This preserves the `/t/[tenantSlug]/...` URL
 *   contract and needs NO routing middleware (composes with the auth gate in
 *   `middleware.ts` without fighting it).
 * - **Default is Vietnamese** so nothing regresses for existing users; English
 *   is opt-in via the toggle.
 * - **Server-first.** All three target areas are Server Components; they read
 *   the locale with `getLocale()` and translate with `await getT()`. Client
 *   components (UserMenu) receive already-resolved strings as props, so there's
 *   no client-side i18n runtime.
 *
 * What is NOT translated by design: Tableau dashboard content (labels baked
 * into published workbooks) and AI agent replies (the agent already answers in
 * the language the user writes). Those are data/content, not UI chrome.
 */
import "server-only";
import { cookies } from "next/headers";

export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "vi" || v === "en";
}

/**
 * Flat message catalog. Keys are dot-namespaced by area (`nav.*`, `signIn.*`,
 * `home.*`, `common.*`). Both locales must define the same keys — the
 * `Messages` type below is derived from the `vi` catalog so a missing `en`
 * key is a compile error.
 */
const vi = {
  // shared chrome
  "common.signOut": "Đăng xuất",
  "common.signedInAs": "Đăng nhập với",
  "common.analyticsPortal": "Cổng phân tích",
  "common.language": "Ngôn ngữ",

  // sign-in page
  "signIn.badge": "Được cung cấp bởi Salesforce + Tableau",
  "signIn.heroLine1": "Dữ liệu sẵn sàng.",
  "signIn.heroLine2": "Quyết định nhanh hơn.",
  "signIn.heroSubtitle":
    "Nền tảng nhúng Tableau + AI Agent đa khách hàng — dashboard thời gian thực, phân tích ngôn ngữ tự nhiên, phân quyền theo tenant.",
  "signIn.welcomeBack": "Chào mừng trở lại",
  "signIn.subtitleDev": "Môi trường dev — dùng tài khoản đã cấu hình sẵn.",
  "signIn.subtitleProd": "Đăng nhập để truy cập không gian làm việc của bạn.",
  "signIn.errorInvalid": "Email hoặc mật khẩu không đúng. Vui lòng thử lại.",
  "signIn.emailLabel": "Email",
  "signIn.passwordLabel": "Mật khẩu",
  "signIn.submit": "Đăng nhập",
  "signIn.demoAccounts": "Tài khoản demo",
  "signIn.consent": "Bằng việc đăng nhập, bạn đồng ý với chính sách bảo mật nội bộ.",

  // admin home hub
  "home.adminHub": "Trung tâm quản trị",
  "home.demoPortals": "Cổng demo",
  "home.portalsActive": "{count} cổng đang hoạt động",
  "home.manage": "Quản lý",
  "home.adminTools": "Công cụ quản trị",
  "home.default": "Mặc định",
  "home.openPortal": "Mở portal",
  "home.newPortal": "Tạo portal mới",
  "home.tool.portalCatalog": "Danh mục Portal",
  "home.tool.portalCatalogDesc": "Gắn folder Tableau theo từng portal",
  "home.tool.tenantsSites": "Tenant & Site",
  "home.tool.tenantsSitesDesc": "Cấu hình site Tableau, Connected App",
  "home.tool.demoFactory": "Demo Factory",
  "home.tool.demoFactoryDesc": "Tạo portal demo mới từ URL",
  "home.tool.systemHealth": "Tình trạng hệ thống",
  "home.tool.systemHealthDesc": "Kiểm tra trạng thái hệ thống",
  "home.internalAdmin": "Quản trị nội bộ",

  // tenant sidebar / nav
  "nav.workspace": "Không gian làm việc",
  "nav.sectionAnalytics": "Phân tích",
  "nav.home": "Trang chủ",
  "nav.allDashboards": "Tất cả Dashboard",
  "nav.sectionProjects": "Dự án",
  "nav.sectionAi": "AI",
  "nav.aiAgent": "AI Agent",
  "nav.sectionAdmin": "Quản trị",
  "nav.manageUsers": "Quản lý người dùng",
  "nav.catalogConfig": "Cấu hình catalog",
  "nav.themeConfig": "Tuỳ chỉnh giao diện",
  "nav.tenantsSites": "Tenant & Site",
  "nav.noAccessTitle": "Không có quyền truy cập",
  "nav.noAccessBody": "Bạn không có quyền truy cập vào {slug}.",
} as const;

export type MessageKey = keyof typeof vi;
type Messages = Record<MessageKey, string>;

const en: Messages = {
  "common.signOut": "Sign out",
  "common.signedInAs": "Signed in as",
  "common.analyticsPortal": "Analytics Portal",
  "common.language": "Language",

  "signIn.badge": "Powered by Salesforce + Tableau",
  "signIn.heroLine1": "Data ready.",
  "signIn.heroLine2": "Decisions faster.",
  "signIn.heroSubtitle":
    "A multi-tenant embedded Tableau + AI Agent platform — real-time dashboards, natural-language analytics, and per-tenant access control.",
  "signIn.welcomeBack": "Welcome back",
  "signIn.subtitleDev": "Dev environment — use a preconfigured account.",
  "signIn.subtitleProd": "Sign in to access your workspace.",
  "signIn.errorInvalid": "Incorrect email or password. Please try again.",
  "signIn.emailLabel": "Email",
  "signIn.passwordLabel": "Password",
  "signIn.submit": "Sign in",
  "signIn.demoAccounts": "Demo accounts",
  "signIn.consent": "By signing in, you agree to the internal privacy policy.",

  "home.adminHub": "Admin Hub",
  "home.demoPortals": "Demo Portals",
  "home.portalsActive": "{count} active portals",
  "home.manage": "Manage",
  "home.adminTools": "Admin tools",
  "home.default": "Default",
  "home.openPortal": "Open portal",
  "home.newPortal": "New portal",
  "home.tool.portalCatalog": "Portal Catalog",
  "home.tool.portalCatalogDesc": "Map Tableau folders per portal",
  "home.tool.tenantsSites": "Tenants & Sites",
  "home.tool.tenantsSitesDesc": "Configure Tableau sites, Connected App",
  "home.tool.demoFactory": "Demo Factory",
  "home.tool.demoFactoryDesc": "Create a new demo portal from a URL",
  "home.tool.systemHealth": "System Health",
  "home.tool.systemHealthDesc": "Check system status",
  "home.internalAdmin": "Internal Admin",

  "nav.workspace": "Workspace",
  "nav.sectionAnalytics": "Analytics",
  "nav.home": "Home",
  "nav.allDashboards": "All Dashboards",
  "nav.sectionProjects": "Projects",
  "nav.sectionAi": "AI",
  "nav.aiAgent": "AI Agent",
  "nav.sectionAdmin": "Admin",
  "nav.manageUsers": "Manage users",
  "nav.catalogConfig": "Catalog settings",
  "nav.themeConfig": "Theme settings",
  "nav.tenantsSites": "Tenants & Sites",
  "nav.noAccessTitle": "No access",
  "nav.noAccessBody": "You do not have access to {slug}.",
};

const CATALOG: Record<Locale, Messages> = { vi, en };

/** Read the active locale from the `NEXT_LOCALE` cookie (defaults to VI). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** A translator bound to an explicit locale. `vars` fills `{name}` placeholders. */
export function translator(locale: Locale) {
  const dict = CATALOG[locale];
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    let out = dict[key] ?? key;
    if (vars) {
      for (const [k, val] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(val));
      }
    }
    return out;
  };
}

/** Convenience for Server Components: resolve the cookie locale + a translator. */
export async function getT(): Promise<{
  locale: Locale;
  t: ReturnType<typeof translator>;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
