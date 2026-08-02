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

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

export interface AgentSuggestion {
  /** The prompt actually sent to the agent when the card is clicked. */
  title: string;
  /** One-line hint shown under the title in the card layout. */
  subtitle: string;
  emoji: string;
}

/** A bilingual suggestion set. Both locales are required (compile-enforced). */
type LocalizedSuggestions = Record<Locale, AgentSuggestion[]>;

// ── Generic fallback (used when neither slug nor industry matches) ────────────
const GENERIC: LocalizedSuggestions = {
  en: [
    { title: "Summarise this month's key metrics", subtitle: "KPI overview and standout trends", emoji: "📊" },
    { title: "Where is growth strongest?", subtitle: "Compare top categories by growth rate", emoji: "🚀" },
    { title: "Performance by region / unit", subtitle: "Rank and compare groups", emoji: "🏢" },
    { title: "Any anomalies worth noting?", subtitle: "Detect swings and outliers", emoji: "🔎" },
  ],
  vi: [
    { title: "Tóm tắt các chỉ số chính tháng này", subtitle: "Tổng quan KPI và xu hướng nổi bật", emoji: "📊" },
    { title: "Đâu là điểm tăng trưởng mạnh nhất?", subtitle: "So sánh top hạng mục theo tốc độ tăng", emoji: "🚀" },
    { title: "Hiệu suất theo khu vực / đơn vị", subtitle: "Xếp hạng và so sánh nhóm", emoji: "🏢" },
    { title: "Có bất thường nào đáng chú ý không?", subtitle: "Phát hiện biến động và ngoại lệ", emoji: "🔎" },
  ],
};

// ── Industry-family fallbacks ─────────────────────────────────────────────────
const BY_INDUSTRY: Record<string, LocalizedSuggestions> = {
  "retail-banking": {
    en: [
      { title: "Summarise this month's business results", subtitle: "Deposits, lending and profit", emoji: "📊" },
      { title: "6-month net interest income trend", subtitle: "Volatility and seasonality analysis", emoji: "📈" },
      { title: "Credit quality: NPL, LDR, CASA", subtitle: "Risk alerts and funding structure", emoji: "💳" },
      { title: "Branch performance", subtitle: "Ranked by region and product", emoji: "🏢" },
    ],
    vi: [
      { title: "Tóm tắt kết quả kinh doanh tháng này", subtitle: "Huy động, cho vay và lợi nhuận", emoji: "📊" },
      { title: "Xu hướng thu nhập lãi 6 tháng", subtitle: "Phân tích biến động và mùa vụ", emoji: "📈" },
      { title: "Chất lượng tín dụng: NPL, LDR, CASA", subtitle: "Cảnh báo rủi ro và cơ cấu nguồn vốn", emoji: "💳" },
      { title: "Hiệu suất các chi nhánh", subtitle: "Xếp hạng theo khu vực và sản phẩm", emoji: "🏢" },
    ],
  },
  "retail-realestate": {
    en: [
      { title: "H1 2026 sales overview", subtitle: "Revenue, units sold and inventory", emoji: "📊" },
      { title: "Progress of key projects", subtitle: "Compare % completion by project", emoji: "🏗️" },
      { title: "Lead → Deal conversion funnel", subtitle: "Drop-off rate at each stage", emoji: "🎯" },
      { title: "Agency / broker performance ranking", subtitle: "Top agencies by sales and conversion", emoji: "🏆" },
    ],
    vi: [
      { title: "Tổng quan doanh số bán hàng H1 2026", subtitle: "Doanh thu, số căn bán và tồn kho", emoji: "📊" },
      { title: "Tiến độ các dự án trọng điểm", subtitle: "So sánh % hoàn thành theo dự án", emoji: "🏗️" },
      { title: "Phễu chuyển đổi Lead → Deal", subtitle: "Tỷ lệ rơi rụng qua từng giai đoạn", emoji: "🎯" },
      { title: "Xếp hạng hiệu suất các sàn / đại lý", subtitle: "Top sàn theo doanh số và chuyển đổi", emoji: "🏆" },
    ],
  },
  "retail-mall": {
    en: [
      { title: "Shopping-mall revenue overview", subtitle: "Revenue KPIs and visitor footfall", emoji: "📊" },
      { title: "Mall performance", subtitle: "Ranked by revenue per m²", emoji: "🏬" },
      { title: "Occupancy and best-performing categories", subtitle: "Occupancy and revenue by tenant category", emoji: "🛍️" },
      { title: "Footfall and conversion rate", subtitle: "Monthly footfall trend", emoji: "👣" },
    ],
    vi: [
      { title: "Tổng quan doanh thu trung tâm thương mại", subtitle: "KPI doanh thu và lưu lượng khách", emoji: "📊" },
      { title: "Hiệu suất các TTTM", subtitle: "Xếp hạng theo doanh thu trên m²", emoji: "🏬" },
      { title: "Tỷ lệ lấp đầy và ngành hàng thuê tốt nhất", subtitle: "Occupancy và doanh thu theo ngành hàng", emoji: "🛍️" },
      { title: "Lưu lượng khách và tỷ lệ chuyển đổi", subtitle: "Xu hướng footfall theo tháng", emoji: "👣" },
    ],
  },
  // Consumer-electronics / general retail
  "retail-mediamart": {
    en: [
      { title: "This month's revenue overview", subtitle: "Retail KPIs and key trends", emoji: "📊" },
      { title: "Fastest-growing product category", subtitle: "Compare the top 5 by growth rate", emoji: "🚀" },
      { title: "Store performance by region", subtitle: "Ranked by revenue", emoji: "🏬" },
      { title: "Inventory and stock turnover", subtitle: "Slow-moving products to watch", emoji: "📦" },
    ],
    vi: [
      { title: "Tổng quan doanh thu tháng này", subtitle: "KPI bán lẻ và xu hướng chính", emoji: "📊" },
      { title: "Ngành hàng tăng trưởng mạnh nhất", subtitle: "So sánh top 5 theo tốc độ tăng", emoji: "🚀" },
      { title: "Hiệu suất các cửa hàng theo khu vực", subtitle: "Xếp hạng theo doanh thu", emoji: "🏬" },
      { title: "Tồn kho và vòng quay hàng hóa", subtitle: "Sản phẩm bán chậm cần chú ý", emoji: "📦" },
    ],
  },
  // SME corporate banking (SHB) — portfolio + per-industry campaign advisory
  "sme-corporate-banking": {
    en: [
      { title: "SME portfolio overview by industry", subtitle: "Loans, NPL, CASA, cross-sell by industry", emoji: "📊" },
      { title: "Which industries are high-risk?", subtitle: "NPL × loan-balance matrix, credit alerts", emoji: "⚠️" },
      { title: "Propose a campaign for the seafood sector", subtitle: "Seasonal working-capital financing", emoji: "🎯" },
      { title: "Which industries have cross-sell headroom?", subtitle: "White-space by product/customer and limits", emoji: "🚀" },
    ],
    vi: [
      { title: "Tổng quan danh mục SME theo ngành", subtitle: "Dư nợ, NPL, CASA, cross-sell theo ngành", emoji: "📊" },
      { title: "Ngành nào rủi ro cao cần kiểm soát?", subtitle: "Ma trận NPL × dư nợ, cảnh báo tín dụng", emoji: "⚠️" },
      { title: "Đề xuất chiến dịch cho ngành Thủy sản", subtitle: "Campaign tài trợ vốn lưu động mùa vụ", emoji: "🎯" },
      { title: "Ngành nào còn dư địa bán chéo (cross-sell)?", subtitle: "White-space theo SP/KH và hạn mức", emoji: "🚀" },
    ],
  },
  // Telecom operator executive control tower (VNPT)
  telecom: {
    en: [
      { title: "This month's executive overview", subtitle: "Revenue, ARPU, subscribers, churn, 5G coverage", emoji: "📊" },
      { title: "Net subscriber additions trend", subtitle: "Gross adds minus churn by month", emoji: "📶" },
      { title: "Top churn drivers", subtitle: "Pareto of churn reasons and their impact", emoji: "⚠️" },
      { title: "Revenue by service & province", subtitle: "Mobile, broadband, digital; top provinces", emoji: "🗺️" },
    ],
    vi: [
      { title: "Tổng quan điều hành tháng này", subtitle: "Doanh thu, ARPU, thuê bao, churn, phủ 5G", emoji: "📊" },
      { title: "Biến động thuê bao phát triển ròng", subtitle: "Thuê bao tăng mới trừ rời mạng theo tháng", emoji: "📶" },
      { title: "Nguyên nhân rời mạng (churn) hàng đầu", subtitle: "Pareto lý do rời mạng và tỷ lệ ảnh hưởng", emoji: "⚠️" },
      { title: "Doanh thu theo dịch vụ & tỉnh/thành", subtitle: "Di động, băng rộng, dịch vụ số; top tỉnh", emoji: "🗺️" },
    ],
  },
  // Full-service passenger airline network & commercial control tower
  "airline-passenger": {
    en: [
      { title: "How is the network performing this year?", subtitle: "Revenue, load factor, yield, capacity vs last year", emoji: "📊" },
      { title: "Which regions and routes are strongest?", subtitle: "Revenue, load factor and growth by region", emoji: "🗺️" },
      { title: "Explain passenger load factor and yield", subtitle: "What the metrics mean and where they're heading", emoji: "📖" },
      { title: "Where should we adjust capacity or push premium?", subtitle: "Commercial next-best-actions grounded in the data", emoji: "🎯" },
    ],
    vi: [
      { title: "Mạng đường bay hoạt động ra sao năm nay?", subtitle: "Doanh thu, hệ số tải, yield, tải cung ứng so với năm trước", emoji: "📊" },
      { title: "Khu vực và đường bay nào mạnh nhất?", subtitle: "Doanh thu, hệ số tải và tăng trưởng theo khu vực", emoji: "🗺️" },
      { title: "Giải thích hệ số tải hành khách và yield", subtitle: "Ý nghĩa các chỉ số và xu hướng sắp tới", emoji: "📖" },
      { title: "Nên điều chỉnh tải hay đẩy hạng cao cấp ở đâu?", subtitle: "Đề xuất hành động thương mại dựa trên dữ liệu", emoji: "🎯" },
    ],
  },
  // Market intelligence for bank advisors / RMs (ACB)
  "market-intelligence": {
    en: [
      { title: "This month's market overview", subtitle: "VN-Index, foreign flows, macro highlights", emoji: "📊" },
      { title: "Explain CPI and market P/E", subtitle: "Definitions, latest values and meaning", emoji: "📖" },
      { title: "Draft talking points for Priority clients", subtitle: "Investment theses by theme and segment", emoji: "🎯" },
      { title: "Write the monthly market report", subtitle: "Macro · capital markets · themes · recommendations", emoji: "📝" },
    ],
    vi: [
      { title: "Tổng quan thị trường tháng này", subtitle: "VN-Index, dòng vốn ngoại, vĩ mô nổi bật", emoji: "📊" },
      { title: "Giải thích chỉ số CPI và P/E thị trường", subtitle: "Định nghĩa, giá trị mới nhất và ý nghĩa", emoji: "📖" },
      { title: "Tạo talking points tư vấn khách hàng Ưu tiên", subtitle: "Luận điểm đầu tư theo chủ đề và phân khúc", emoji: "🎯" },
      { title: "Soạn báo cáo thị trường tháng", subtitle: "Vĩ mô · thị trường vốn · chủ đề · khuyến nghị", emoji: "📝" },
    ],
  },
  // In-flight catering quality / complaint management (VACS)
  "airline-catering": {
    en: [
      { title: "This month's quality & complaints overview", subtitle: "Complaint rate (PPM), backlog, on-time responses", emoji: "📊" },
      { title: "Pareto analysis of complaint types", subtitle: "80/20 by complaint group and sub-category", emoji: "🎯" },
      { title: "Foreign-object trend in meals", subtitle: "Hair, insects, plastic, metal, glass…", emoji: "🔬" },
      { title: "Quality scorecard by airline", subtitle: "Complaints, response SLA, contract penalties", emoji: "✈️" },
    ],
    vi: [
      { title: "Tổng quan chất lượng & khiếu nại tháng này", subtitle: "Chỉ số khiếu nại (PPM), tồn đọng, phản hồi đúng hạn", emoji: "📊" },
      { title: "Phân tích Pareto các loại khiếu nại", subtitle: "80/20 theo nhóm và tiểu mục khiếu nại", emoji: "🎯" },
      { title: "Xu hướng dị vật trong suất ăn", subtitle: "Tóc, côn trùng, nhựa, kim loại, thủy tinh…", emoji: "🔬" },
      { title: "Bảng điểm chất lượng theo hãng bay", subtitle: "Khiếu nại, SLA phản hồi, phạt hợp đồng", emoji: "✈️" },
    ],
  },
};

// ── Exact per-tenant sets (override the industry fallback) ────────────────────
const BY_SLUG: Record<string, LocalizedSuggestions> = {
  "singapore-airlines": {
    en: [
      { title: "How is Singapore Airlines performing this year?", subtitle: "Revenue, load factor, yield, capacity vs FY2024", emoji: "📊" },
      { title: "Which regions and destinations lead the network?", subtitle: "Revenue, load factor and YoY growth by region", emoji: "🗺️" },
      { title: "Explain passenger load factor, yield and ASK", subtitle: "What the airline metrics mean, with the latest read", emoji: "📖" },
      { title: "Where should we add capacity or push premium cabins?", subtitle: "Commercial next-best-actions grounded in the data", emoji: "🎯" },
    ],
    vi: [
      { title: "Singapore Airlines hoạt động ra sao năm nay?", subtitle: "Doanh thu, hệ số tải, yield, tải cung ứng so với FY2024", emoji: "📊" },
      { title: "Khu vực và điểm đến nào dẫn đầu mạng bay?", subtitle: "Doanh thu, hệ số tải và tăng trưởng YoY theo khu vực", emoji: "🗺️" },
      { title: "Giải thích hệ số tải hành khách, yield và ASK", subtitle: "Ý nghĩa các chỉ số hàng không, kèm số liệu mới nhất", emoji: "📖" },
      { title: "Nên tăng tải hay đẩy hạng khoang cao cấp ở đâu?", subtitle: "Đề xuất hành động thương mại dựa trên dữ liệu", emoji: "🎯" },
    ],
  },
  acb: {
    en: [
      { title: "This month's market & VN-Index overview", subtitle: "Performance, liquidity, foreign flows, valuation", emoji: "📊" },
      { title: "Which investment theme stands out most?", subtitle: "Theme scorecard: momentum, valuation, flows", emoji: "🧭" },
      { title: "Draft talking points for Priority clients", subtitle: "Opportunities, risks, catalysts by client segment", emoji: "🎯" },
      { title: "Write the monthly market report for advisors", subtitle: "Macro · capital markets · themes · recommendations", emoji: "📝" },
    ],
    vi: [
      { title: "Tổng quan thị trường & VN-Index tháng này", subtitle: "Hiệu suất, thanh khoản, dòng vốn ngoại, định giá", emoji: "📊" },
      { title: "Đâu là chủ đề đầu tư đáng chú ý nhất?", subtitle: "Bảng điểm chủ đề: momentum, định giá, dòng vốn", emoji: "🧭" },
      { title: "Tạo talking points tư vấn khách hàng Ưu tiên", subtitle: "Cơ hội, rủi ro, chất xúc tác theo phân khúc KH", emoji: "🎯" },
      { title: "Soạn báo cáo thị trường tháng cho chuyên viên", subtitle: "Vĩ mô · thị trường vốn · chủ đề · khuyến nghị", emoji: "📝" },
    ],
  },
  meygroup: {
    en: [
      { title: "H1 2026 business overview", subtitle: "Revenue, units sold and targets", emoji: "📊" },
      { title: "Lead → Deal customer conversion funnel", subtitle: "Drop-off rate at each stage", emoji: "🎯" },
      { title: "Actions to lift Digital-channel conversion", subtitle: "Salesforce next-best-actions from funnel data", emoji: "🚀" },
      { title: "Deep-dive: Meypearl Ciel project", subtitle: "Pre-launch pipeline and acceleration opportunities", emoji: "🔍" },
    ],
    vi: [
      { title: "Tổng quan tình hình kinh doanh H1 2026", subtitle: "Doanh thu, số căn bán và mục tiêu", emoji: "📊" },
      { title: "Phễu chuyển đổi khách hàng Lead → Deal", subtitle: "Tỷ lệ rơi rụng qua từng giai đoạn", emoji: "🎯" },
      { title: "Đề xuất hành động tăng chuyển đổi kênh Digital", subtitle: "Next-best-action trên Salesforce từ dữ liệu phễu", emoji: "🚀" },
      { title: "Deep-dive dự án Meypearl Ciel", subtitle: "Pipeline trước mở bán và cơ hội tăng tốc", emoji: "🔍" },
    ],
  },
  mediamart: {
    en: [
      { title: "This month's revenue & margin overview", subtitle: "Retail KPIs, standout categories and channels", emoji: "📊" },
      { title: "Which customer segments are at high churn risk?", subtitle: "Churn by card tier and revenue at stake", emoji: "⚠️" },
      { title: "Propose retention & cross-sell campaigns", subtitle: "Win back high-churn groups, push NextBestOffer by tier", emoji: "🎯" },
      { title: "Which stores/categories are out of stock (OOS)?", subtitle: "Inventory below campaign target, needs transfer", emoji: "📦" },
    ],
    vi: [
      { title: "Tổng quan doanh thu & biên lợi nhuận tháng này", subtitle: "KPI bán lẻ, ngành hàng và kênh nổi bật", emoji: "📊" },
      { title: "Nhóm khách hàng nào có nguy cơ rời bỏ cao?", subtitle: "Churn theo hạng thẻ, giá trị doanh thu ảnh hưởng", emoji: "⚠️" },
      { title: "Đề xuất chiến dịch giữ chân & bán chéo", subtitle: "Win-back nhóm churn cao, đẩy NextBestOffer theo hạng", emoji: "🎯" },
      { title: "Cửa hàng/ngành hàng nào đang thiếu hàng (OOS)?", subtitle: "Tồn kho dưới mục tiêu campaign, cần điều chuyển", emoji: "📦" },
    ],
  },
  vincomretail: BY_INDUSTRY["retail-mall"]!,
  vnpt: {
    en: [
      { title: "2025 executive management overview", subtitle: "Revenue, ARPU, subscribers, churn, 5G coverage", emoji: "📊" },
      { title: "Are net subscriber additions rising or falling?", subtitle: "Gross adds − churn by month, trend", emoji: "📶" },
      { title: "Which regions have the highest churn rate?", subtitle: "Churn by province and main drivers", emoji: "⚠️" },
      { title: "Revenue by service: mobile, broadband, digital", subtitle: "Revenue mix and top provinces", emoji: "🗺️" },
    ],
    vi: [
      { title: "Tổng quan quản trị điều hành 2025", subtitle: "Doanh thu, ARPU, thuê bao, churn, phủ 5G", emoji: "📊" },
      { title: "Thuê bao phát triển ròng đang tăng hay giảm?", subtitle: "Gross adds − churn theo tháng, xu hướng", emoji: "📶" },
      { title: "Vùng/miền nào có tỷ lệ rời mạng cao nhất?", subtitle: "Churn theo tỉnh/thành và nguyên nhân chính", emoji: "⚠️" },
      { title: "Doanh thu theo dịch vụ: di động, băng rộng, số", subtitle: "Cơ cấu doanh thu và top tỉnh dẫn đầu", emoji: "🗺️" },
    ],
  },
  vacs: {
    en: [
      { title: "2026 quality & complaints overview", subtitle: "Complaint rate (PPM), YoY, on-time responses", emoji: "📊" },
      { title: "Which complaint type is most pressing?", subtitle: "80/20 Pareto by complaint group & sub-category", emoji: "🎯" },
      { title: "Foreign-object alerts: metal & glass", subtitle: "High-risk incidents to prioritise", emoji: "🔬" },
      { title: "Which airlines rank best/worst on quality & SLA?", subtitle: "Scorecard of complaints, responses, contract penalties", emoji: "✈️" },
    ],
    vi: [
      { title: "Tổng quan chất lượng & khiếu nại 2026", subtitle: "Chỉ số khiếu nại (PPM), YoY, phản hồi đúng hạn", emoji: "📊" },
      { title: "Đâu là loại khiếu nại nhức nhối nhất?", subtitle: "Pareto 80/20 nhóm & tiểu mục khiếu nại", emoji: "🎯" },
      { title: "Cảnh báo dị vật: kim loại & thủy tinh", subtitle: "Sự cố nguy cơ cao cần ưu tiên xử lý", emoji: "🔬" },
      { title: "Hãng nào có chất lượng & SLA tốt/kém nhất?", subtitle: "Bảng điểm khiếu nại, phản hồi, phạt hợp đồng", emoji: "✈️" },
    ],
  },
  shb: {
    en: [
      { title: "SME portfolio overview by industry", subtitle: "Loans, NPL, CASA, cross-sell by industry", emoji: "📊" },
      { title: "Propose a campaign for seafood exporters", subtitle: "Seasonal working-capital + trade finance", emoji: "🎯" },
      { title: "Propose cross-sell campaigns for IT & F&B", subtitle: "Cross-sell headroom, digital banking, overdraft", emoji: "🚀" },
      { title: "Which industries need tighter credit control?", subtitle: "NPL & limit utilisation by industry", emoji: "⚠️" },
    ],
    vi: [
      { title: "Tổng quan danh mục SME theo ngành", subtitle: "Dư nợ, NPL, CASA, cross-sell theo ngành", emoji: "📊" },
      { title: "Đề xuất chiến dịch cho ngành Thủy sản xuất khẩu", subtitle: "Tài trợ vốn lưu động mùa vụ + tài trợ thương mại", emoji: "🎯" },
      { title: "Đề xuất chiến dịch cross-sell ngành CNTT & F&B", subtitle: "Dư địa bán chéo, ngân hàng số, thấu chi", emoji: "🚀" },
      { title: "Ngành nào rủi ro cao cần siết tín dụng?", subtitle: "NPL & sử dụng hạn mức theo ngành", emoji: "⚠️" },
    ],
  },
  "nam-a-bank": {
    en: [
      { title: "Summarise 2025 business results", subtitle: "Deposits, lending and profit", emoji: "📊" },
      { title: "Credit quality: NPL, LDR, CASA", subtitle: "NPL 2.26% · LDR 70.9% · CASA 14.27%", emoji: "💳" },
      { title: "6-month net interest income trend", subtitle: "Volatility and seasonality analysis", emoji: "📈" },
      { title: "Branch and product performance", subtitle: "Ranked by region", emoji: "🏢" },
    ],
    vi: [
      { title: "Tóm tắt kết quả kinh doanh 2025", subtitle: "Huy động, cho vay và lợi nhuận", emoji: "📊" },
      { title: "Chất lượng tín dụng: NPL, LDR, CASA", subtitle: "Nợ xấu 2.26% · LDR 70.9% · CASA 14.27%", emoji: "💳" },
      { title: "Xu hướng thu nhập lãi 6 tháng", subtitle: "Phân tích biến động và mùa vụ", emoji: "📈" },
      { title: "Hiệu suất các chi nhánh và sản phẩm", subtitle: "Xếp hạng theo khu vực", emoji: "🏢" },
    ],
  },
  "salesforce-bank": BY_INDUSTRY["retail-banking"]!,
};

/**
 * Resolve the starter prompts for a tenant in the given UI locale. `slug` wins;
 * `industry` is the fallback; a generic set is the last resort. `locale`
 * defaults to `DEFAULT_LOCALE`. Never returns an empty array.
 */
export function getAgentSuggestions(opts: {
  slug?: string | undefined;
  industry?: string | undefined;
  locale?: Locale | undefined;
}): AgentSuggestion[] {
  const { slug, industry, locale = DEFAULT_LOCALE } = opts;
  const set =
    (slug ? BY_SLUG[slug] : undefined) ??
    (industry ? BY_INDUSTRY[industry] : undefined) ??
    GENERIC;
  return set[locale];
}
