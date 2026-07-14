/**
 * Client-safe i18n core — pure message catalog + a synchronous translator.
 *
 * This module has NO `server-only` marker and NO `next/headers` import, so it
 * can be imported by BOTH Server Components (via `lib/i18n.ts`, which re-exports
 * everything here and adds the cookie readers) AND Client Components (e.g.
 * ChatPanel, SearchTrigger) which receive the resolved `locale` as a prop and
 * call `translator(locale)` directly.
 *
 * Scope: portal chrome only — sign-in, admin home, tenant sidebar/top-bar,
 * tenant home, the AI chat panel, and the ⌘K search. NOT translated by design:
 * Tableau dashboard content (baked into published workbooks) and AI agent
 * replies (the agent answers in the language the user writes).
 */

export const LOCALES = ["vi", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "vi" || v === "en";
}

/**
 * Flat message catalog. Keys are dot-namespaced by area (`common.*`, `signIn.*`,
 * `home.*`, `th.*`, `nav.*`, `chat.*`, `search.*`). Both locales must define the
 * same keys — the `Messages` type is derived from the `vi` catalog so a missing
 * `en` key is a compile error.
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

  // tenant home page
  "th.welcome": "Chào mừng trở lại",
  "th.subtitle": "Khám phá dashboards hoặc hỏi AI Agent để nhận phân tích tức thì.",
  "th.viewDashboards": "Xem Dashboards",
  "th.askAgent": "Hỏi AI Agent",
  "th.viewsToday": "Lượt xem hôm nay",
  "th.totalWorkbooks": "Tổng workbooks",
  "th.viewsWord": "views",
  "th.viewsUsed": "Lượt xem đã dùng",
  "th.today": "hôm nay",
  "th.dailyQuota": "Hạn mức ngày",
  "th.quotaReset": "reset lúc 00:00 UTC",
  "th.pulseMetrics": "Chỉ số Pulse",
  "th.recentlyViewed": "Vừa xem gần đây",
  "th.noRecentViews": "Bạn chưa xem report nào — hãy mở một dashboard để bắt đầu.",
  "th.mostViewed": "Dashboard xem nhiều nhất",
  "th.featured": "Dashboard nổi bật",
  "th.viewAll": "Xem tất cả",
  "th.view": "Xem",

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

  // AI chat panel
  "chat.title": "AI Analytics",
  "chat.connecting": "Đang kết nối…",
  "chat.generalMode": "Chế độ chung — không có công cụ Tableau MCP",
  "chat.toolsReady": "{count} công cụ Tableau sẵn sàng",
  "chat.askAboutDashboard": "Đặt câu hỏi về dashboard của bạn:",
  "chat.processing": "Đang xử lý…",
  "chat.inputPlaceholder": "Hỏi AI agent…",
  "chat.send": "Gửi",
  "chat.loadingPulse": "Đang tải Pulse card cho",
  "chat.suggest1": "Những hạng mục nổi bật nhất kỳ vừa rồi?",
  "chat.suggest2": "Có biến động nào bất thường không?",
  "chat.suggest3": "Tóm tắt view này trong 3 ý chính.",

  // ⌘K search
  "search.trigger": "Tìm dashboards, dự án, AI prompt…",
  "search.ariaLabel": "Tìm kiếm",
  "search.dialogLabel": "Tìm kiếm nhanh",
  "search.inputPlaceholder": "Gõ để tìm dashboards, dự án, hoặc đặt câu hỏi cho AI…",
  "search.comingSoon": "Tìm kiếm nhanh sắp ra mắt — tạm thời dùng menu bên trái.",

  // embed shell
  "embed.loading": "Đang tải dashboard…",
  "embed.errorTitle": "Lỗi tải dashboard",
  "embed.retry": "Thử lại",
  "embed.authHint":
    "Nếu là lỗi xác thực, kiểm tra localhost:3000 đã được thêm vào danh sách domain của Connected App trên Tableau Cloud chưa.",
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

  "th.welcome": "Welcome back",
  "th.subtitle": "Explore dashboards or ask the AI Agent for instant analysis.",
  "th.viewDashboards": "View Dashboards",
  "th.askAgent": "Ask AI Agent",
  "th.viewsToday": "Views today",
  "th.totalWorkbooks": "Total workbooks",
  "th.viewsWord": "views",
  "th.viewsUsed": "Views used",
  "th.today": "today",
  "th.dailyQuota": "Daily quota",
  "th.quotaReset": "resets at 00:00 UTC",
  "th.pulseMetrics": "Pulse metrics",
  "th.recentlyViewed": "Recently viewed",
  "th.noRecentViews": "You haven't viewed any reports yet — open a dashboard to get started.",
  "th.mostViewed": "Most viewed dashboards",
  "th.featured": "Featured dashboards",
  "th.viewAll": "View all",
  "th.view": "View",

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

  "chat.title": "AI Analytics",
  "chat.connecting": "Connecting…",
  "chat.generalMode": "General mode — no Tableau MCP tools",
  "chat.toolsReady": "{count} Tableau tools ready",
  "chat.askAboutDashboard": "Ask a question about your dashboard:",
  "chat.processing": "Working…",
  "chat.inputPlaceholder": "Ask the AI agent…",
  "chat.send": "Send",
  "chat.loadingPulse": "Loading Pulse card for",
  "chat.suggest1": "What stood out most in the latest period?",
  "chat.suggest2": "Are there any unusual movements?",
  "chat.suggest3": "Summarise this view in 3 key points.",

  "search.trigger": "Search dashboards, projects, AI prompts…",
  "search.ariaLabel": "Search",
  "search.dialogLabel": "Quick search",
  "search.inputPlaceholder": "Type to search dashboards, projects, or ask the AI…",
  "search.comingSoon": "Quick search is coming soon — use the left menu for now.",

  "embed.loading": "Loading dashboard…",
  "embed.errorTitle": "Failed to load dashboard",
  "embed.retry": "Retry",
  "embed.authHint":
    "If this is an auth error, check that localhost:3000 is in the Connected App's domain allow-list on Tableau Cloud.",
};

const CATALOG: Record<Locale, Messages> = { vi, en };

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

/** Synchronous one-off translate helper for client components with a locale. */
export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  return translator(locale)(key, vars);
}
