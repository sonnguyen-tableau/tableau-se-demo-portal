/**
 * Per-tenant starter prompts for the AI Analytics Agent.
 *
 * Resolution order (most → least specific):
 *   1. exact tenant slug   (e.g. "meygroup")
 *   2. industry family     (e.g. "retail-realestate")
 *   3. generic default
 *
 * Both the full-page agent (`AgentPage`, card layout) and the dashboard-side
 * `ChatPanel` (short-string layout) consume this list — ChatPanel just renders
 * the `title` of the first few. One source of truth, keyed by slug, so adding a
 * tenant only means adding one entry here (or leaning on the industry fallback).
 */

export interface AgentSuggestion {
  /** The prompt actually sent to the agent when the card is clicked. */
  title: string;
  /** One-line hint shown under the title in the card layout. */
  subtitle: string;
  emoji: string;
}

// ── Generic fallback (used when neither slug nor industry matches) ────────────
const GENERIC: AgentSuggestion[] = [
  { title: "Tóm tắt các chỉ số chính tháng này", subtitle: "Tổng quan KPI và xu hướng nổi bật", emoji: "📊" },
  { title: "Đâu là điểm tăng trưởng mạnh nhất?", subtitle: "So sánh top hạng mục theo tốc độ tăng", emoji: "🚀" },
  { title: "Hiệu suất theo khu vực / đơn vị", subtitle: "Xếp hạng và so sánh nhóm", emoji: "🏢" },
  { title: "Có bất thường nào đáng chú ý không?", subtitle: "Phát hiện biến động và ngoại lệ", emoji: "🔎" },
];

// ── Industry-family fallbacks ─────────────────────────────────────────────────
const BY_INDUSTRY: Record<string, AgentSuggestion[]> = {
  "retail-banking": [
    { title: "Tóm tắt kết quả kinh doanh tháng này", subtitle: "Huy động, cho vay và lợi nhuận", emoji: "📊" },
    { title: "Xu hướng thu nhập lãi 6 tháng", subtitle: "Phân tích biến động và mùa vụ", emoji: "📈" },
    { title: "Chất lượng tín dụng: NPL, LDR, CASA", subtitle: "Cảnh báo rủi ro và cơ cấu nguồn vốn", emoji: "💳" },
    { title: "Hiệu suất các chi nhánh", subtitle: "Xếp hạng theo khu vực và sản phẩm", emoji: "🏢" },
  ],
  "retail-realestate": [
    { title: "Tổng quan doanh số bán hàng H1 2026", subtitle: "Doanh thu, số căn bán và tồn kho", emoji: "📊" },
    { title: "Tiến độ các dự án trọng điểm", subtitle: "So sánh % hoàn thành theo dự án", emoji: "🏗️" },
    { title: "Phễu chuyển đổi Lead → Deal", subtitle: "Tỷ lệ rơi rụng qua từng giai đoạn", emoji: "🎯" },
    { title: "Xếp hạng hiệu suất các sàn / đại lý", subtitle: "Top sàn theo doanh số và chuyển đổi", emoji: "🏆" },
  ],
  "retail-mall": [
    { title: "Tổng quan doanh thu trung tâm thương mại", subtitle: "KPI doanh thu và lưu lượng khách", emoji: "📊" },
    { title: "Hiệu suất các TTTM", subtitle: "Xếp hạng theo doanh thu trên m²", emoji: "🏬" },
    { title: "Tỷ lệ lấp đầy và ngành hàng thuê tốt nhất", subtitle: "Occupancy và doanh thu theo ngành hàng", emoji: "🛍️" },
    { title: "Lưu lượng khách và tỷ lệ chuyển đổi", subtitle: "Xu hướng footfall theo tháng", emoji: "👣" },
  ],
  // Consumer-electronics / general retail
  "retail-mediamart": [
    { title: "Tổng quan doanh thu tháng này", subtitle: "KPI bán lẻ và xu hướng chính", emoji: "📊" },
    { title: "Ngành hàng tăng trưởng mạnh nhất", subtitle: "So sánh top 5 theo tốc độ tăng", emoji: "🚀" },
    { title: "Hiệu suất các cửa hàng theo khu vực", subtitle: "Xếp hạng theo doanh thu", emoji: "🏬" },
    { title: "Tồn kho và vòng quay hàng hóa", subtitle: "Sản phẩm bán chậm cần chú ý", emoji: "📦" },
  ],
  // SME corporate banking (SHB) — portfolio + per-industry campaign advisory
  "sme-corporate-banking": [
    { title: "Tổng quan danh mục SME theo ngành", subtitle: "Dư nợ, NPL, CASA, cross-sell theo ngành", emoji: "📊" },
    { title: "Ngành nào rủi ro cao cần kiểm soát?", subtitle: "Ma trận NPL × dư nợ, cảnh báo tín dụng", emoji: "⚠️" },
    { title: "Đề xuất chiến dịch cho ngành Thủy sản", subtitle: "Campaign tài trợ vốn lưu động mùa vụ", emoji: "🎯" },
    { title: "Ngành nào còn dư địa bán chéo (cross-sell)?", subtitle: "White-space theo SP/KH và hạn mức", emoji: "🚀" },
  ],
  // In-flight catering quality / complaint management (VACS)
  "airline-catering": [
    { title: "Tổng quan chất lượng & khiếu nại tháng này", subtitle: "Chỉ số khiếu nại (PPM), tồn đọng, phản hồi đúng hạn", emoji: "📊" },
    { title: "Phân tích Pareto các loại khiếu nại", subtitle: "80/20 theo nhóm và tiểu mục khiếu nại", emoji: "🎯" },
    { title: "Xu hướng dị vật trong suất ăn", subtitle: "Tóc, côn trùng, nhựa, kim loại, thủy tinh...", emoji: "🔬" },
    { title: "Bảng điểm chất lượng theo hãng bay", subtitle: "Khiếu nại, SLA phản hồi, phạt hợp đồng", emoji: "✈️" },
  ],
};

// ── Exact per-tenant sets (override the industry fallback) ────────────────────
const BY_SLUG: Record<string, AgentSuggestion[]> = {
  meygroup: [
    { title: "Tổng quan tình hình kinh doanh H1 2026", subtitle: "Doanh thu, số căn bán và mục tiêu", emoji: "📊" },
    { title: "Phễu chuyển đổi khách hàng Lead → Deal", subtitle: "Tỷ lệ rơi rụng qua từng giai đoạn", emoji: "🎯" },
    { title: "Đề xuất hành động tăng chuyển đổi kênh Digital", subtitle: "Next-best-action trên Salesforce từ dữ liệu phễu", emoji: "🚀" },
    { title: "Deep-dive dự án Meypearl Ciel", subtitle: "Pipeline trước mở bán và cơ hội tăng tốc", emoji: "🔍" },
  ],
  mediamart: BY_INDUSTRY["retail-mediamart"]!,
  vincomretail: BY_INDUSTRY["retail-mall"]!,
  vacs: [
    { title: "Tổng quan chất lượng & khiếu nại 2026", subtitle: "Chỉ số khiếu nại (PPM), YoY, phản hồi đúng hạn", emoji: "📊" },
    { title: "Đâu là loại khiếu nại nhức nhối nhất?", subtitle: "Pareto 80/20 nhóm & tiểu mục khiếu nại", emoji: "🎯" },
    { title: "Cảnh báo dị vật: kim loại & thủy tinh", subtitle: "Sự cố nguy cơ cao cần ưu tiên xử lý", emoji: "🔬" },
    { title: "Hãng nào có chất lượng & SLA tốt/kém nhất?", subtitle: "Bảng điểm khiếu nại, phản hồi, phạt hợp đồng", emoji: "✈️" },
  ],
  shb: [
    { title: "Tổng quan danh mục SME theo ngành", subtitle: "Dư nợ, NPL, CASA, cross-sell theo ngành", emoji: "📊" },
    { title: "Đề xuất chiến dịch cho ngành Thủy sản xuất khẩu", subtitle: "Tài trợ vốn lưu động mùa vụ + tài trợ thương mại", emoji: "🎯" },
    { title: "Đề xuất chiến dịch cross-sell ngành CNTT & F&B", subtitle: "Dư địa bán chéo, ngân hàng số, thấu chi", emoji: "🚀" },
    { title: "Ngành nào rủi ro cao cần siết tín dụng?", subtitle: "NPL & sử dụng hạn mức theo ngành", emoji: "⚠️" },
  ],
  "nam-a-bank": [
    { title: "Tóm tắt kết quả kinh doanh 2025", subtitle: "Huy động, cho vay và lợi nhuận", emoji: "📊" },
    { title: "Chất lượng tín dụng: NPL, LDR, CASA", subtitle: "Nợ xấu 2.26% · LDR 70.9% · CASA 14.27%", emoji: "💳" },
    { title: "Xu hướng thu nhập lãi 6 tháng", subtitle: "Phân tích biến động và mùa vụ", emoji: "📈" },
    { title: "Hiệu suất các chi nhánh và sản phẩm", subtitle: "Xếp hạng theo khu vực", emoji: "🏢" },
  ],
  "salesforce-bank": BY_INDUSTRY["retail-banking"]!,
};

/**
 * Resolve the starter prompts for a tenant. `slug` wins; `industry` is the
 * fallback; a generic set is the last resort. Never returns an empty array.
 */
export function getAgentSuggestions(opts: {
  slug?: string | undefined;
  industry?: string | undefined;
}): AgentSuggestion[] {
  const { slug, industry } = opts;
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  if (industry && BY_INDUSTRY[industry]) return BY_INDUSTRY[industry];
  return GENERIC;
}
