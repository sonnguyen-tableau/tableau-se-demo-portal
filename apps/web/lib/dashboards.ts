/**
 * Dashboard catalog structured to mirror the Tableau project folder hierarchy.
 * viewPath = "<WorkbookName>/<SheetName>" — matches Tableau's URL pattern.
 */
export type DashboardScope = "all" | "internal";

export interface DashboardEntry {
  id: string;
  name: string;
  description: string;
  industry: "retail" | "retail-mall" | "banking" | "manufacturing" | "healthcare" | "logistics" | "generic";
  viewPath: string;
  scope: DashboardScope;
  /** Tableau project folder path, e.g. "Banking" or "Samples/Superstore" */
  project: string;
}

export interface ProjectFolder {
  name: string;
  /** Human-readable label in Vietnamese */
  label: string;
  icon: string;
  dashboards: readonly DashboardEntry[];
}

export const DASHBOARD_CATALOG: readonly DashboardEntry[] = [
  // ── Samples project ─────────────────────────────────────────────────────
  {
    id: "superstore-overview",
    name: "Superstore — Tổng quan",
    description: "Doanh thu, lợi nhuận và xu hướng đơn hàng theo danh mục và khu vực.",
    industry: "retail",
    viewPath: "Superstore/Overview",
    scope: "all",
    project: "Samples",
  },
  {
    id: "superstore-performance",
    name: "Superstore — Hiệu suất",
    description: "Chỉ số KPI theo phân khúc và danh mục sản phẩm.",
    industry: "retail",
    viewPath: "Superstore/Performance",
    scope: "all",
    project: "Samples",
  },
  {
    id: "superstore-dashboard",
    name: "Superstore Dashboard",
    description: "Dashboard bán hàng tương tác với chi tiết sản phẩm và đơn hàng.",
    industry: "retail",
    viewPath: "SuperstoreDashboard/SuperstoreDashboard",
    scope: "all",
    project: "Samples",
  },
  {
    id: "world-indicators",
    name: "World Indicators",
    description: "Chỉ số kinh tế, y tế và công nghệ toàn cầu theo quốc gia.",
    industry: "generic",
    viewPath: "WorldIndicators/GlobalIndicators",
    scope: "all",
    project: "Samples",
  },
  // ── Banking project ──────────────────────────────────────────────────────
  {
    id: "banking-income-statement",
    name: "Báo cáo Thu nhập",
    description: "Báo cáo tài chính ngân hàng với phân tích KPI và chi nhánh.",
    industry: "banking",
    viewPath: "BANKING-BankIncomeStatement/ExecutiveSummary",
    scope: "all",
    project: "Banking",
  },
  {
    id: "banking-loans",
    name: "Danh mục Cho vay",
    description: "Tổng quan danh mục tín dụng, theo dõi nợ xấu và phân tích doanh thu.",
    industry: "banking",
    viewPath: "BANKING-Loans/ExecutiveSummary",
    scope: "all",
    project: "Banking",
  },
  // ── Operations project ───────────────────────────────────────────────────
  {
    id: "shipment-tracking",
    name: "Theo dõi Vận chuyển",
    description: "Dashboard theo dõi lô hàng và giao vận theo thời gian thực.",
    industry: "logistics",
    viewPath: "ShipmentTrackingDashboard/LandingPage",
    scope: "all",
    project: "Operations",
  },
  {
    id: "adventure-works",
    name: "AdventureWorks Analytics",
    description: "Phân tích bán hàng theo danh mục, đại lý và năm.",
    industry: "manufacturing",
    viewPath: "AdventureWork-Analytics/Dashboard1",
    scope: "all",
    project: "Operations",
  },
  // ── IT project ───────────────────────────────────────────────────────────
  {
    id: "servicenow-itsm",
    name: "ServiceNow ITSM",
    description: "Dashboard quản lý dịch vụ IT với theo dõi sự cố và vấn đề.",
    industry: "generic",
    viewPath: "ServiceNowITSM/ExecutiveDashboard",
    scope: "all",
    project: "IT",
  },
  // ── VinCommerce ───────────────────────────────────────────────────────────
  {
    id: "vincommerce-retail-revenue",
    name: "VinCommerce — Doanh Thu Bán Lẻ",
    description: "Doanh thu và biên lợi nhuận gộp của WinMart/WinMart+ theo tháng và cửa hàng.",
    industry: "retail-mall",
    viewPath: "VinCommerce-RetailMall/Doanh Thu Bán Lẻ",
    scope: "all",
    project: "VinCommerce",
  },
  {
    id: "vincommerce-gross-margin",
    name: "VinCommerce — Biên Lợi Nhuận",
    description: "Gross margin % theo từng cửa hàng WinMart/WinMart+, phân tích tác động chiết khấu.",
    industry: "retail-mall",
    viewPath: "VinCommerce-RetailMall/Biên Lợi Nhuận",
    scope: "all",
    project: "VinCommerce",
  },
  {
    id: "vincommerce-mall-revenue",
    name: "VinCommerce — Doanh Thu Cho Thuê",
    description: "Doanh thu cho thuê sàn TTTM Vincom theo tháng và trung tâm thương mại.",
    industry: "retail-mall",
    viewPath: "VinCommerce-RetailMall/Doanh Thu Cho Thuê",
    scope: "all",
    project: "VinCommerce",
  },
  {
    id: "vincommerce-arrears",
    name: "VinCommerce — Tỷ Lệ Nợ Thuê",
    description: "Theo dõi tỷ lệ nợ thuê (arrears) theo từng TTTM — cảnh báo sớm rủi ro dòng tiền.",
    industry: "retail-mall",
    viewPath: "VinCommerce-RetailMall/Tỷ Lệ Nợ Thuê",
    scope: "all",
    project: "VinCommerce",
  },
  // ── Internal ─────────────────────────────────────────────────────────────
  {
    id: "internal-admin-impressions",
    name: "Internal — Impression Usage",
    description: "Per-tenant impression consumption and budget headroom.",
    industry: "generic",
    viewPath: "AdminInsightsStarter/Overview",
    scope: "internal",
    project: "Internal",
  },
] as const;

/** Project folder definitions — order determines sidebar/page display order */
export const PROJECT_FOLDERS: readonly ProjectFolder[] = [
  {
    name: "Banking",
    label: "Ngân hàng",
    icon: "🏦",
    get dashboards() { return DASHBOARD_CATALOG.filter((d) => d.project === "Banking"); },
  },
  {
    name: "Samples",
    label: "Mẫu & Demo",
    icon: "📊",
    get dashboards() { return DASHBOARD_CATALOG.filter((d) => d.project === "Samples"); },
  },
  {
    name: "Operations",
    label: "Vận hành",
    icon: "⚙️",
    get dashboards() { return DASHBOARD_CATALOG.filter((d) => d.project === "Operations"); },
  },
  {
    name: "IT",
    label: "Công nghệ IT",
    icon: "💻",
    get dashboards() { return DASHBOARD_CATALOG.filter((d) => d.project === "IT"); },
  },
  {
    name: "VinCommerce",
    label: "VinCommerce",
    icon: "🛒",
    get dashboards() { return DASHBOARD_CATALOG.filter((d) => d.project === "VinCommerce"); },
  },
  {
    name: "Internal",
    label: "Nội bộ",
    icon: "🔒",
    get dashboards() { return DASHBOARD_CATALOG.filter((d) => d.project === "Internal"); },
  },
] as const;

export function listDashboardsForTenant(opts: {
  isInternal: boolean;
}): readonly DashboardEntry[] {
  return DASHBOARD_CATALOG.filter((d) => d.scope === "all" || (d.scope === "internal" && opts.isInternal));
}

export function listProjectsForTenant(opts: {
  isInternal: boolean;
}): ProjectFolder[] {
  return PROJECT_FOLDERS
    .map((p) => ({
      ...p,
      dashboards: p.dashboards.filter((d) => d.scope === "all" || (d.scope === "internal" && opts.isInternal)),
    }))
    .filter((p) => p.dashboards.length > 0);
}

export function getDashboard(id: string): DashboardEntry | undefined {
  return DASHBOARD_CATALOG.find((d) => d.id === id);
}
