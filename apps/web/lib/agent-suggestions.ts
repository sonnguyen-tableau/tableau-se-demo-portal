/**
 * Per-tenant starter prompts for the AI Analytics Agent.
 *
 * Resolution order (most → least specific):
 *   1. exact tenant slug   (e.g. "meygroup")
 *   2. industry family     (e.g. "retail-realestate")
 *   3. generic default
 *
 * Every set is **bilingual** (EN + VI) and keyed by `Locale`, so the starter
 * questions re-render in the active UI language when the LanguageToggle flips
 * the `NEXT_LOCALE` cookie and `router.refresh()` re-runs the Server Component
 * that calls `getAgentSuggestions({ locale })`. English is the authoritative
 * copy; Vietnamese mirrors it.
 *
 * Both the full-page agent (`AgentPage`, card layout) and the dashboard-side
 * `ChatPanel` (short-string layout) consume this list — ChatPanel just renders
 * the `title` of the first few. One source of truth, keyed by slug, so adding a
 * tenant only means adding one bilingual entry here (or leaning on the industry
 * fallback). Because the type is a full `Record<Locale, …>`, a set missing a
 * language is a compile error — same guarantee the message catalog gives.
 */

import {
  Bot,
  Plane,
  BatteryCharging,
  RadioTower,
  CreditCard,
  User,
  BookOpen,
  Compass,
  Download,
  Footprints,
  TrendingDown,
  Map,
  Rocket,
  Inbox,
  Factory,
  Microscope,
  Package,
  Medal,
  Banknote,
  Truck,
  Gift,
  BriefcaseBusiness,
  Sprout,
  Building,
  ChartColumn,
  Zap,
  Gem,
  Construction,
  Trophy,
  Handshake,
  Network,
  Plug,
  Bell,
  PenLine,
  FileText,
  ShoppingBag,
  Receipt,
  Search,
  Puzzle,
  Store,
  Signal,
  Target,
  PhoneCall,
  TrendingUp,
  TriangleAlert,
  Lightbulb,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n-shared";

/**
 * Lucide icon for each suggestion, keyed by a stable semantic name. The full-page
 * agent renders `SUGGESTION_ICONS[s.icon]`. Kept as a total object literal with
 * `satisfies` (not typed `Record<string, LucideIcon>`), so `keyof typeof` yields
 * the literal key union and the lookup is never `undefined` under
 * noUncheckedIndexedAccess. Icon components are not serializable across the RSC
 * boundary — that is why suggestions carry a string key, not the component.
 */
export const SUGGESTION_ICONS = {
  overview: ChartColumn,
  target: Target,
  warning: TriangleAlert,
  geo: Map,
  growth: Rocket,
  explain: BookOpen,
  ranking: Trophy,
  report: PenLine,
  credit: CreditCard,
  org: Building,
  explore: Compass,
  funnelDrop: TrendingDown,
  channel: RadioTower,
  trend: TrendingUp,
  stores: Store,
  airline: Plane,
  revenue: Receipt,
  segment: Puzzle,
  inspect: Microscope,
  search: Search,
  battery: BatteryCharging,
  winback: RefreshCw,
  subscribers: Signal,
  inventory: Package,
  inbox: Inbox,
  industry: Factory,
  export: Download,
  power: Zap,
  occupation: BriefcaseBusiness,
  relationship: Handshake,
  agentforce: Bot,
  retail: ShoppingBag,
  logistics: Truck,
  relationshipMap: Network,
  reorder: Bell,
  reliability: Plug,
  reportDetail: FileText,
  loan: Banknote,
  whitespace: Lightbulb,
  product: Gem,
  customer: User,
  footfall: Footprints,
  projects: Construction,
  leaderboard: Medal,
  loyalty: Gift,
  opportunity: Sprout,
  telesales: PhoneCall,
} satisfies Record<string, LucideIcon>;

export type SuggestionIconKey = keyof typeof SUGGESTION_ICONS;

export interface AgentSuggestion {
  /** The prompt actually sent to the agent when the card is clicked. */
  title: string;
  /** One-line hint shown under the title in the card layout. */
  subtitle: string;
  /** Lucide icon key (see SUGGESTION_ICONS) shown in the card layout. */
  icon: SuggestionIconKey;
}

/** A bilingual suggestion set. Both locales are required (compile-enforced). */
type LocalizedSuggestions = Record<Locale, AgentSuggestion[]>;

// ── Generic fallback (used when neither slug nor industry matches) ────────────
const GENERIC: LocalizedSuggestions = {
  en: [
    { title: "Summarise this month's key metrics", subtitle: "KPI overview and standout trends", icon: "overview" },
    { title: "Where is growth strongest?", subtitle: "Compare top categories by growth rate", icon: "growth" },
    { title: "Performance by region / unit", subtitle: "Rank and compare groups", icon: "org" },
    { title: "Any anomalies worth noting?", subtitle: "Detect swings and outliers", icon: "search" },
  ],
  vi: [
    { title: "Tóm tắt các chỉ số chính tháng này", subtitle: "Tổng quan KPI và xu hướng nổi bật", icon: "overview" },
    { title: "Đâu là điểm tăng trưởng mạnh nhất?", subtitle: "So sánh top hạng mục theo tốc độ tăng", icon: "growth" },
    { title: "Hiệu suất theo khu vực / đơn vị", subtitle: "Xếp hạng và so sánh nhóm", icon: "org" },
    { title: "Có bất thường nào đáng chú ý không?", subtitle: "Phát hiện biến động và ngoại lệ", icon: "search" },
  ],
};

// ── Industry-family fallbacks ─────────────────────────────────────────────────
const BY_INDUSTRY: Record<string, LocalizedSuggestions> = {
  "retail-banking": {
    en: [
      { title: "Summarise this month's business results", subtitle: "Deposits, lending and profit", icon: "overview" },
      { title: "6-month net interest income trend", subtitle: "Volatility and seasonality analysis", icon: "trend" },
      { title: "Credit quality: NPL, LDR, CASA", subtitle: "Risk alerts and funding structure", icon: "credit" },
      { title: "Branch performance", subtitle: "Ranked by region and product", icon: "org" },
    ],
    vi: [
      { title: "Tóm tắt kết quả kinh doanh tháng này", subtitle: "Huy động, cho vay và lợi nhuận", icon: "overview" },
      { title: "Xu hướng thu nhập lãi 6 tháng", subtitle: "Phân tích biến động và mùa vụ", icon: "trend" },
      { title: "Chất lượng tín dụng: NPL, LDR, CASA", subtitle: "Cảnh báo rủi ro và cơ cấu nguồn vốn", icon: "credit" },
      { title: "Hiệu suất các chi nhánh", subtitle: "Xếp hạng theo khu vực và sản phẩm", icon: "org" },
    ],
  },
  "retail-realestate": {
    en: [
      { title: "H1 2026 sales overview", subtitle: "Revenue, units sold and inventory", icon: "overview" },
      { title: "Progress of key projects", subtitle: "Compare % completion by project", icon: "projects" },
      { title: "Lead → Deal conversion funnel", subtitle: "Drop-off rate at each stage", icon: "target" },
      { title: "Agency / broker performance ranking", subtitle: "Top agencies by sales and conversion", icon: "ranking" },
    ],
    vi: [
      { title: "Tổng quan doanh số bán hàng H1 2026", subtitle: "Doanh thu, số căn bán và tồn kho", icon: "overview" },
      { title: "Tiến độ các dự án trọng điểm", subtitle: "So sánh % hoàn thành theo dự án", icon: "projects" },
      { title: "Phễu chuyển đổi Lead → Deal", subtitle: "Tỷ lệ rơi rụng qua từng giai đoạn", icon: "target" },
      { title: "Xếp hạng hiệu suất các sàn / đại lý", subtitle: "Top sàn theo doanh số và chuyển đổi", icon: "ranking" },
    ],
  },
  "retail-mall": {
    en: [
      { title: "Shopping-mall revenue overview", subtitle: "Revenue KPIs and visitor footfall", icon: "overview" },
      { title: "Mall performance", subtitle: "Ranked by revenue per m²", icon: "stores" },
      { title: "Occupancy and best-performing categories", subtitle: "Occupancy and revenue by tenant category", icon: "retail" },
      { title: "Footfall and conversion rate", subtitle: "Monthly footfall trend", icon: "footfall" },
    ],
    vi: [
      { title: "Tổng quan doanh thu trung tâm thương mại", subtitle: "KPI doanh thu và lưu lượng khách", icon: "overview" },
      { title: "Hiệu suất các TTTM", subtitle: "Xếp hạng theo doanh thu trên m²", icon: "stores" },
      { title: "Tỷ lệ lấp đầy và ngành hàng thuê tốt nhất", subtitle: "Occupancy và doanh thu theo ngành hàng", icon: "retail" },
      { title: "Lưu lượng khách và tỷ lệ chuyển đổi", subtitle: "Xu hướng footfall theo tháng", icon: "footfall" },
    ],
  },
  // Consumer-electronics / general retail
  "retail-mediamart": {
    en: [
      { title: "This month's revenue overview", subtitle: "Retail KPIs and key trends", icon: "overview" },
      { title: "Fastest-growing product category", subtitle: "Compare the top 5 by growth rate", icon: "growth" },
      { title: "Store performance by region", subtitle: "Ranked by revenue", icon: "stores" },
      { title: "Inventory and stock turnover", subtitle: "Slow-moving products to watch", icon: "inventory" },
    ],
    vi: [
      { title: "Tổng quan doanh thu tháng này", subtitle: "KPI bán lẻ và xu hướng chính", icon: "overview" },
      { title: "Ngành hàng tăng trưởng mạnh nhất", subtitle: "So sánh top 5 theo tốc độ tăng", icon: "growth" },
      { title: "Hiệu suất các cửa hàng theo khu vực", subtitle: "Xếp hạng theo doanh thu", icon: "stores" },
      { title: "Tồn kho và vòng quay hàng hóa", subtitle: "Sản phẩm bán chậm cần chú ý", icon: "inventory" },
    ],
  },
  // SME corporate banking (SHB) — portfolio + per-industry campaign advisory
  "sme-corporate-banking": {
    en: [
      { title: "SME portfolio overview by industry", subtitle: "Loans, NPL, CASA, cross-sell by industry", icon: "overview" },
      { title: "Which industries are high-risk?", subtitle: "NPL × loan-balance matrix, credit alerts", icon: "warning" },
      { title: "Propose a campaign for the seafood sector", subtitle: "Seasonal working-capital financing", icon: "target" },
      { title: "Which industries have cross-sell headroom?", subtitle: "White-space by product/customer and limits", icon: "growth" },
    ],
    vi: [
      { title: "Tổng quan danh mục SME theo ngành", subtitle: "Dư nợ, NPL, CASA, cross-sell theo ngành", icon: "overview" },
      { title: "Ngành nào rủi ro cao cần kiểm soát?", subtitle: "Ma trận NPL × dư nợ, cảnh báo tín dụng", icon: "warning" },
      { title: "Đề xuất chiến dịch cho ngành Thủy sản", subtitle: "Campaign tài trợ vốn lưu động mùa vụ", icon: "target" },
      { title: "Ngành nào còn dư địa bán chéo (cross-sell)?", subtitle: "White-space theo SP/KH và hạn mức", icon: "growth" },
    ],
  },
  // Telecom operator executive control tower (VNPT)
  telecom: {
    en: [
      { title: "This month's executive overview", subtitle: "Revenue, ARPU, subscribers, churn, 5G coverage", icon: "overview" },
      { title: "Net subscriber additions trend", subtitle: "Gross adds minus churn by month", icon: "subscribers" },
      { title: "Top churn drivers", subtitle: "Pareto of churn reasons and their impact", icon: "warning" },
      { title: "Revenue by service & province", subtitle: "Mobile, broadband, digital; top provinces", icon: "geo" },
    ],
    vi: [
      { title: "Tổng quan điều hành tháng này", subtitle: "Doanh thu, ARPU, thuê bao, churn, phủ 5G", icon: "overview" },
      { title: "Biến động thuê bao phát triển ròng", subtitle: "Thuê bao tăng mới trừ rời mạng theo tháng", icon: "subscribers" },
      { title: "Nguyên nhân rời mạng (churn) hàng đầu", subtitle: "Pareto lý do rời mạng và tỷ lệ ảnh hưởng", icon: "warning" },
      { title: "Doanh thu theo dịch vụ & tỉnh/thành", subtitle: "Di động, băng rộng, dịch vụ số; top tỉnh", icon: "geo" },
    ],
  },
  // Full-service passenger airline network & commercial control tower
  "airline-passenger": {
    en: [
      { title: "How is the network performing this year?", subtitle: "Revenue, load factor, yield, capacity vs last year", icon: "overview" },
      { title: "Which regions and routes are strongest?", subtitle: "Revenue, load factor and growth by region", icon: "geo" },
      { title: "Explain passenger load factor and yield", subtitle: "What the metrics mean and where they're heading", icon: "explain" },
      { title: "Where should we adjust capacity or push premium?", subtitle: "Commercial next-best-actions grounded in the data", icon: "target" },
    ],
    vi: [
      { title: "Mạng đường bay hoạt động ra sao năm nay?", subtitle: "Doanh thu, hệ số tải, yield, tải cung ứng so với năm trước", icon: "overview" },
      { title: "Khu vực và đường bay nào mạnh nhất?", subtitle: "Doanh thu, hệ số tải và tăng trưởng theo khu vực", icon: "geo" },
      { title: "Giải thích hệ số tải hành khách và yield", subtitle: "Ý nghĩa các chỉ số và xu hướng sắp tới", icon: "explain" },
      { title: "Nên điều chỉnh tải hay đẩy hạng cao cấp ở đâu?", subtitle: "Đề xuất hành động thương mại dựa trên dữ liệu", icon: "target" },
    ],
  },
  // Market intelligence for bank advisors / RMs (ACB)
  "market-intelligence": {
    en: [
      { title: "This month's market overview", subtitle: "VN-Index, foreign flows, macro highlights", icon: "overview" },
      { title: "Explain CPI and market P/E", subtitle: "Definitions, latest values and meaning", icon: "explain" },
      { title: "Draft talking points for Priority clients", subtitle: "Investment theses by theme and segment", icon: "target" },
      { title: "Write the monthly market report", subtitle: "Macro · capital markets · themes · recommendations", icon: "report" },
    ],
    vi: [
      { title: "Tổng quan thị trường tháng này", subtitle: "VN-Index, dòng vốn ngoại, vĩ mô nổi bật", icon: "overview" },
      { title: "Giải thích chỉ số CPI và P/E thị trường", subtitle: "Định nghĩa, giá trị mới nhất và ý nghĩa", icon: "explain" },
      { title: "Tạo talking points tư vấn khách hàng Ưu tiên", subtitle: "Luận điểm đầu tư theo chủ đề và phân khúc", icon: "target" },
      { title: "Soạn báo cáo thị trường tháng", subtitle: "Vĩ mô · thị trường vốn · chủ đề · khuyến nghị", icon: "report" },
    ],
  },
  // In-flight catering quality / complaint management (VACS)
  "airline-catering": {
    en: [
      { title: "This month's quality & complaints overview", subtitle: "Complaint rate (PPM), backlog, on-time responses", icon: "overview" },
      { title: "Pareto analysis of complaint types", subtitle: "80/20 by complaint group and sub-category", icon: "target" },
      { title: "Foreign-object trend in meals", subtitle: "Hair, insects, plastic, metal, glass…", icon: "inspect" },
      { title: "Quality scorecard by airline", subtitle: "Complaints, response SLA, contract penalties", icon: "airline" },
    ],
    vi: [
      { title: "Tổng quan chất lượng & khiếu nại tháng này", subtitle: "Chỉ số khiếu nại (PPM), tồn đọng, phản hồi đúng hạn", icon: "overview" },
      { title: "Phân tích Pareto các loại khiếu nại", subtitle: "80/20 theo nhóm và tiểu mục khiếu nại", icon: "target" },
      { title: "Xu hướng dị vật trong suất ăn", subtitle: "Tóc, côn trùng, nhựa, kim loại, thủy tinh…", icon: "inspect" },
      { title: "Bảng điểm chất lượng theo hãng bay", subtitle: "Khiếu nại, SLA phản hồi, phạt hợp đồng", icon: "airline" },
    ],
  },
};

// ── Exact per-tenant sets (override the industry fallback) ────────────────────
const BY_SLUG: Record<string, LocalizedSuggestions> = {
  "singapore-airlines": {
    en: [
      { title: "How is Singapore Airlines performing this year?", subtitle: "Revenue, load factor, yield, capacity vs FY2024", icon: "overview" },
      { title: "Which regions and destinations lead the network?", subtitle: "Revenue, load factor and YoY growth by region", icon: "geo" },
      { title: "Explain passenger load factor, yield and ASK", subtitle: "What the airline metrics mean, with the latest read", icon: "explain" },
      { title: "Where should we add capacity or push premium cabins?", subtitle: "Commercial next-best-actions grounded in the data", icon: "target" },
    ],
    vi: [
      { title: "Singapore Airlines hoạt động ra sao năm nay?", subtitle: "Doanh thu, hệ số tải, yield, tải cung ứng so với FY2024", icon: "overview" },
      { title: "Khu vực và điểm đến nào dẫn đầu mạng bay?", subtitle: "Doanh thu, hệ số tải và tăng trưởng YoY theo khu vực", icon: "geo" },
      { title: "Giải thích hệ số tải hành khách, yield và ASK", subtitle: "Ý nghĩa các chỉ số hàng không, kèm số liệu mới nhất", icon: "explain" },
      { title: "Nên tăng tải hay đẩy hạng khoang cao cấp ở đâu?", subtitle: "Đề xuất hành động thương mại dựa trên dữ liệu", icon: "target" },
    ],
  },
  acb: {
    en: [
      { title: "This month's market & VN-Index overview", subtitle: "Performance, liquidity, foreign flows, valuation", icon: "overview" },
      { title: "Which investment theme stands out most?", subtitle: "Theme scorecard: momentum, valuation, flows", icon: "explore" },
      { title: "Draft talking points for Priority clients", subtitle: "Opportunities, risks, catalysts by client segment", icon: "target" },
      { title: "Write the monthly market report for advisors", subtitle: "Macro · capital markets · themes · recommendations", icon: "report" },
    ],
    vi: [
      { title: "Tổng quan thị trường & VN-Index tháng này", subtitle: "Hiệu suất, thanh khoản, dòng vốn ngoại, định giá", icon: "overview" },
      { title: "Đâu là chủ đề đầu tư đáng chú ý nhất?", subtitle: "Bảng điểm chủ đề: momentum, định giá, dòng vốn", icon: "explore" },
      { title: "Tạo talking points tư vấn khách hàng Ưu tiên", subtitle: "Cơ hội, rủi ro, chất xúc tác theo phân khúc KH", icon: "target" },
      { title: "Soạn báo cáo thị trường tháng cho chuyên viên", subtitle: "Vĩ mô · thị trường vốn · chủ đề · khuyến nghị", icon: "report" },
    ],
  },
  meygroup: {
    en: [
      { title: "H1 2026 business overview", subtitle: "Revenue, units sold and targets", icon: "overview" },
      { title: "Lead → Deal customer conversion funnel", subtitle: "Drop-off rate at each stage", icon: "target" },
      { title: "Actions to lift Digital-channel conversion", subtitle: "Salesforce next-best-actions from funnel data", icon: "growth" },
      { title: "Deep-dive: Meypearl Ciel project", subtitle: "Pre-launch pipeline and acceleration opportunities", icon: "search" },
    ],
    vi: [
      { title: "Tổng quan tình hình kinh doanh H1 2026", subtitle: "Doanh thu, số căn bán và mục tiêu", icon: "overview" },
      { title: "Phễu chuyển đổi khách hàng Lead → Deal", subtitle: "Tỷ lệ rơi rụng qua từng giai đoạn", icon: "target" },
      { title: "Đề xuất hành động tăng chuyển đổi kênh Digital", subtitle: "Next-best-action trên Salesforce từ dữ liệu phễu", icon: "growth" },
      { title: "Deep-dive dự án Meypearl Ciel", subtitle: "Pipeline trước mở bán và cơ hội tăng tốc", icon: "search" },
    ],
  },
  mediamart: {
    en: [
      { title: "This month's revenue & margin overview", subtitle: "Retail KPIs, standout categories and channels", icon: "overview" },
      { title: "Which customer segments are at high churn risk?", subtitle: "Churn by card tier and revenue at stake", icon: "warning" },
      { title: "Propose retention & cross-sell campaigns", subtitle: "Win back high-churn groups, push NextBestOffer by tier", icon: "target" },
      { title: "Which stores/categories are out of stock (OOS)?", subtitle: "Inventory below campaign target, needs transfer", icon: "inventory" },
    ],
    vi: [
      { title: "Tổng quan doanh thu & biên lợi nhuận tháng này", subtitle: "KPI bán lẻ, ngành hàng và kênh nổi bật", icon: "overview" },
      { title: "Nhóm khách hàng nào có nguy cơ rời bỏ cao?", subtitle: "Churn theo hạng thẻ, giá trị doanh thu ảnh hưởng", icon: "warning" },
      { title: "Đề xuất chiến dịch giữ chân & bán chéo", subtitle: "Win-back nhóm churn cao, đẩy NextBestOffer theo hạng", icon: "target" },
      { title: "Cửa hàng/ngành hàng nào đang thiếu hàng (OOS)?", subtitle: "Tồn kho dưới mục tiêu campaign, cần điều chuyển", icon: "inventory" },
    ],
  },
  vincomretail: BY_INDUSTRY["retail-mall"]!,
  vnpt: {
    en: [
      { title: "2025 executive management overview", subtitle: "Revenue, ARPU, subscribers, churn, 5G coverage", icon: "overview" },
      { title: "Are net subscriber additions rising or falling?", subtitle: "Gross adds − churn by month, trend", icon: "subscribers" },
      { title: "Which regions have the highest churn rate?", subtitle: "Churn by province and main drivers", icon: "warning" },
      { title: "Revenue by service: mobile, broadband, digital", subtitle: "Revenue mix and top provinces", icon: "geo" },
    ],
    vi: [
      { title: "Tổng quan quản trị điều hành 2025", subtitle: "Doanh thu, ARPU, thuê bao, churn, phủ 5G", icon: "overview" },
      { title: "Thuê bao phát triển ròng đang tăng hay giảm?", subtitle: "Gross adds − churn theo tháng, xu hướng", icon: "subscribers" },
      { title: "Vùng/miền nào có tỷ lệ rời mạng cao nhất?", subtitle: "Churn theo tỉnh/thành và nguyên nhân chính", icon: "warning" },
      { title: "Doanh thu theo dịch vụ: di động, băng rộng, số", subtitle: "Cơ cấu doanh thu và top tỉnh dẫn đầu", icon: "geo" },
    ],
  },
  vacs: {
    en: [
      { title: "2026 quality & complaints overview", subtitle: "Complaint rate (PPM), YoY, on-time responses", icon: "overview" },
      { title: "Which complaint type is most pressing?", subtitle: "80/20 Pareto by complaint group & sub-category", icon: "target" },
      { title: "Foreign-object alerts: metal & glass", subtitle: "High-risk incidents to prioritise", icon: "inspect" },
      { title: "Which airlines rank best/worst on quality & SLA?", subtitle: "Scorecard of complaints, responses, contract penalties", icon: "airline" },
    ],
    vi: [
      { title: "Tổng quan chất lượng & khiếu nại 2026", subtitle: "Chỉ số khiếu nại (PPM), YoY, phản hồi đúng hạn", icon: "overview" },
      { title: "Đâu là loại khiếu nại nhức nhối nhất?", subtitle: "Pareto 80/20 nhóm & tiểu mục khiếu nại", icon: "target" },
      { title: "Cảnh báo dị vật: kim loại & thủy tinh", subtitle: "Sự cố nguy cơ cao cần ưu tiên xử lý", icon: "inspect" },
      { title: "Hãng nào có chất lượng & SLA tốt/kém nhất?", subtitle: "Bảng điểm khiếu nại, phản hồi, phạt hợp đồng", icon: "airline" },
    ],
  },
  shb: {
    en: [
      { title: "SME portfolio overview by industry", subtitle: "Loans, NPL, CASA, cross-sell by industry", icon: "overview" },
      { title: "Propose a campaign for seafood exporters", subtitle: "Seasonal working-capital + trade finance", icon: "target" },
      { title: "Propose cross-sell campaigns for IT & F&B", subtitle: "Cross-sell headroom, digital banking, overdraft", icon: "growth" },
      { title: "Which industries need tighter credit control?", subtitle: "NPL & limit utilisation by industry", icon: "warning" },
    ],
    vi: [
      { title: "Tổng quan danh mục SME theo ngành", subtitle: "Dư nợ, NPL, CASA, cross-sell theo ngành", icon: "overview" },
      { title: "Đề xuất chiến dịch cho ngành Thủy sản xuất khẩu", subtitle: "Tài trợ vốn lưu động mùa vụ + tài trợ thương mại", icon: "target" },
      { title: "Đề xuất chiến dịch cross-sell ngành CNTT & F&B", subtitle: "Dư địa bán chéo, ngân hàng số, thấu chi", icon: "growth" },
      { title: "Ngành nào rủi ro cao cần siết tín dụng?", subtitle: "NPL & sử dụng hạn mức theo ngành", icon: "warning" },
    ],
  },
  "nam-a-bank": {
    en: [
      { title: "Summarise 2025 business results", subtitle: "Deposits, lending and profit", icon: "overview" },
      { title: "Credit quality: NPL, LDR, CASA", subtitle: "NPL 2.26% · LDR 70.9% · CASA 14.27%", icon: "credit" },
      { title: "6-month net interest income trend", subtitle: "Volatility and seasonality analysis", icon: "trend" },
      { title: "Branch and product performance", subtitle: "Ranked by region", icon: "org" },
    ],
    vi: [
      { title: "Tóm tắt kết quả kinh doanh 2025", subtitle: "Huy động, cho vay và lợi nhuận", icon: "overview" },
      { title: "Chất lượng tín dụng: NPL, LDR, CASA", subtitle: "Nợ xấu 2.26% · LDR 70.9% · CASA 14.27%", icon: "credit" },
      { title: "Xu hướng thu nhập lãi 6 tháng", subtitle: "Phân tích biến động và mùa vụ", icon: "trend" },
      { title: "Hiệu suất các chi nhánh và sản phẩm", subtitle: "Xếp hạng theo khu vực", icon: "org" },
    ],
  },
  "salesforce-bank": BY_INDUSTRY["retail-banking"]!,
};

/**
 * Resolve the starter prompts for a tenant in the given UI locale. `slug` wins;
 * `industry` is the fallback; a generic set is the last resort. When `viewName`
 * is set, 3 prompts templated on the current view are prepended (AG-10, §5.3).
 * `locale` defaults to `DEFAULT_LOCALE`. Never returns an empty array.
 */
export function getAgentSuggestions(opts: {
  slug?: string | undefined;
  industry?: string | undefined;
  /** When set, 3 prompts templated on the current view are prepended (AG-10, §5.3). */
  viewName?: string | undefined;
  locale?: Locale | undefined;
}): AgentSuggestion[] {
  const { slug, industry, viewName, locale = DEFAULT_LOCALE } = opts;
  const set =
    (slug ? BY_SLUG[slug] : undefined) ??
    (industry ? BY_INDUSTRY[industry] : undefined) ??
    GENERIC;
  const base = set[locale];
  if (!viewName) return base;
  const t = translator(locale);
  const viewPrompts: AgentSuggestion[] = [
    { title: t("suggest.viewSummary", { view: viewName }), subtitle: viewName, icon: "overview" },
    { title: t("suggest.viewChange", { view: viewName }), subtitle: viewName, icon: "warning" },
    { title: t("suggest.viewAnomaly", { view: viewName }), subtitle: viewName, icon: "search" },
  ];
  return [...viewPrompts, ...base];
}
