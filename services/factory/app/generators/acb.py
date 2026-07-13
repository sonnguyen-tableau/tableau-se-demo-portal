"""ACB (Ngân hàng TMCP Á Châu) — "Market Intelligence" synthetic data generator.

Powers the ACB Market Intelligence demo for Priority-Banking relationship
managers / advisors: a Vietnam macro + capital-market monitor that flows
    Data → Dashboard → Insight → Advisor Brief → Report Automation.

Three-page dashboard story (see docs/dashboards/acb-market-intelligence.md):
  1. Market Pulse         — headline KPI cards + VN-Index daily line
  2. Macro & Market Drivers — macro small-multiples (CPI, GDP, FDI, FX, credit…)
  3. Advisor Cockpit      — theme-score heatmap + narrative advisor briefs

Contract: emits an ``AcbDataset`` whose column names match
``packages/factory-schema/market-intelligence.schema.json``.

Six tables (the customer's requested model):
  - market_metrics_monthly : tidy long — one row per (month, metric); macro +
                             monthly-aggregated market metrics, 2024-01→2026-06.
  - market_daily           : granular daily VN-Index, turnover, foreign flow,
                             P/E, P/B (trading days 2024-01→2026-07).
  - theme_summary          : 6 investment themes, each scored on 4 dimensions +
                             overall favorability (-100..+100) for the heatmap.
  - advisor_brief          : curated opportunity/risk/catalyst briefs, each with
                             a signal, conviction, thesis + advisor talking point,
                             targeted at an ACB customer segment.
  - metric_dictionary      : one row per metric — definition, unit, source,
                             cadence, favorable direction (powers "explain metric").
  - market_events          : dated market/macro/policy events for annotating the
                             index chart and grounding the AI narrative.

DATA POLICY: 100% synthetic. Every metric carries ``Source``, ``SourceUrl``,
``DataDate`` and ``MockData=1``. Values are *calibrated* to real published
2024–2025 Vietnam figures (±jitter) so the demo is convincing; they are NOT
scraped. Real collectors that attempt live data (vnstock/TCBS for markets,
GSO/SBV/PMI for macro) with fall-back to this generator live in
``services/factory/scripts/acb/``.

Calibration anchors (grounded by web research 2026-07-13):
- CPI YoY ~3.0–4.5% · GDP growth ~5.9→8.2% (qtr YoY) · FDI reg ~$38bn/yr,
  disbursed ~$25bn/yr · exports ~$33–37bn/mo · PMI straddles 50 (tariff soft
  in 2025) · USD/VND ~24,600→26,450 · deposit 12M ~4.75→5.5% · credit +13→16.5%.
- VN-Index 2024 close ~1,266 → 2025 rally to ~1,500 (FTSE secondary-EM upgrade
  narrative, Sep-2025) → mid-2026 ~1,560 · turnover ~16–24k tỷ/day · foreign net
  flow heavy selling in 2024 (~-90k tỷ) turning to inflows post-FTSE · market
  P/E ~14–16.5x · P/B ~1.7–2.05x.

100% Vietnamese + English labels. Money in VND.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import pairwise

import numpy as np
import pandas as pd

# ─── Timeframe ───────────────────────────────────────────────────────────────
# Monthly series: 2024-01 → 2026-06 (30 complete months). Daily series: trading
# days 2024-01-02 → 2026-07-10. "As-of" mid-July 2026.
_START = datetime(2024, 1, 1)
_MONTHLY_END = datetime(2026, 6, 1)          # last complete month
_DAILY_END = datetime(2026, 7, 10)           # last trading day generated
_N_MONTHS = 30                                # inclusive count 2024-01..2026-06

# ─── Source registry (public, legal Vietnam data providers) ─────────────────
_SRC = {
    "GSO": ("Tổng cục Thống kê (GSO)", "https://www.gso.gov.vn/en/"),
    "SBV": ("Ngân hàng Nhà nước (SBV)", "https://www.sbv.gov.vn/"),
    "FIA": ("Cục Đầu tư nước ngoài (FIA/MPI)", "https://fia.mpi.gov.vn/"),
    "PMI": ("S&P Global — Vietnam Manufacturing PMI", "https://www.pmi.spglobal.com/"),
    "HOSE": ("Sở GDCK TP.HCM (HOSE)", "https://www.hsx.vn/"),
    "DERIVED": ("Tính toán từ dữ liệu HOSE", "https://www.hsx.vn/"),
}

# ─── Seasonality (share tilt — Tết + year-end trade higher) ─────────────────
_SEASON = {
    1: 1.03, 2: 0.94, 3: 1.01, 4: 0.99, 5: 1.00, 6: 1.01,
    7: 1.02, 8: 1.02, 9: 0.98, 10: 1.01, 11: 1.03, 12: 1.06,
}

# ─── Macro / monthly metric specifications ───────────────────────────────────
# Each: key, name_en, name_vi, category, unit, fav_dir (up|down|neutral),
# source_key, value_type, decimals, anchors [(month_idx, value)], vol_pct,
# seasonal (bool). month_idx 0 = 2024-01 … 29 = 2026-06.
# GDP + trade_balance are handled specially (quarterly / derived).
_MACRO_SPECS: tuple[dict, ...] = (
    dict(key="cpi_yoy", name_en="CPI inflation (YoY)", name_vi="Lạm phát CPI (YoY)",
         category="Macro", unit="%", fav_dir="down", src="GSO", vt="rate_pct", dp=2,
         anchors=[(0, 3.37), (11, 3.63), (23, 3.30), (29, 3.55)], vol=0.06, seasonal=True),
    dict(key="fdi_registered", name_en="FDI registered (monthly)", name_vi="FDI đăng ký (tháng)",
         category="Macro", unit="USD bn", fav_dir="up", src="FIA", vt="level", dp=2,
         anchors=[(0, 2.9), (11, 3.4), (23, 3.6), (29, 3.5)], vol=0.14, seasonal=True),
    dict(key="fdi_disbursed", name_en="FDI disbursed (monthly)", name_vi="FDI giải ngân (tháng)",
         category="Macro", unit="USD bn", fav_dir="up", src="FIA", vt="level", dp=2,
         anchors=[(0, 1.85), (11, 2.25), (23, 2.45), (29, 2.35)], vol=0.10, seasonal=True),
    dict(key="exports", name_en="Exports (monthly)", name_vi="Xuất khẩu (tháng)",
         category="Macro", unit="USD bn", fav_dir="up", src="GSO", vt="level", dp=2,
         anchors=[(0, 32.6), (11, 34.5), (23, 36.4), (29, 37.2)], vol=0.05, seasonal=True),
    dict(key="imports", name_en="Imports (monthly)", name_vi="Nhập khẩu (tháng)",
         category="Macro", unit="USD bn", fav_dir="neutral", src="GSO", vt="level", dp=2,
         anchors=[(0, 31.0), (11, 32.6), (23, 34.5), (29, 35.4)], vol=0.05, seasonal=True),
    dict(key="retail_sales_yoy", name_en="Retail sales (YoY)", name_vi="Bán lẻ HH&DV (YoY)",
         category="Macro", unit="%", fav_dir="up", src="GSO", vt="rate_pct", dp=1,
         anchors=[(0, 8.4), (11, 9.0), (23, 9.5), (29, 9.1)], vol=0.05, seasonal=False),
    dict(key="pmi", name_en="Manufacturing PMI", name_vi="PMI sản xuất",
         category="Macro", unit="index", fav_dir="up", src="PMI", vt="index", dp=1,
         anchors=[(0, 50.3), (8, 47.3), (11, 50.9), (18, 48.9), (23, 49.8), (29, 51.4)],
         vol=0.02, seasonal=False),
    dict(key="usdvnd", name_en="USD/VND exchange rate", name_vi="Tỷ giá USD/VND",
         category="Rates", unit="VND", fav_dir="down", src="SBV", vt="level", dp=0,
         anchors=[(0, 24_600), (11, 25_450), (23, 26_300), (29, 26_450)], vol=0.006,
         seasonal=False),
    dict(key="deposit_rate_12m", name_en="Deposit rate 12M (VND)", name_vi="Lãi suất tiền gửi 12T",
         category="Rates", unit="%", fav_dir="neutral", src="SBV", vt="rate_pct", dp=2,
         anchors=[(0, 4.75), (11, 5.00), (23, 5.35), (29, 5.55)], vol=0.03, seasonal=False),
    dict(key="credit_growth_yoy", name_en="Credit growth (YoY)", name_vi="Tăng trưởng tín dụng (YoY)",
         category="Macro", unit="%", fav_dir="up", src="SBV", vt="rate_pct", dp=1,
         anchors=[(0, 13.1), (11, 15.1), (23, 16.0), (29, 16.5)], vol=0.04, seasonal=False),
)

# GDP growth is quarterly — real published/target quarter YoY values.
_GDP_QUARTER = {
    (2024, 1): 5.87, (2024, 2): 7.09, (2024, 3): 7.40, (2024, 4): 7.55,
    (2025, 1): 6.93, (2025, 2): 7.52, (2025, 3): 8.12, (2025, 4): 8.24,
    (2026, 1): 7.12, (2026, 2): 7.38,
}

# ─── Market monthly metric specs (aggregated from daily where noted) ─────────
# VN-Index / turnover / foreign flow / P/E / P/B are derived from market_daily
# so the monthly and daily tables stay coherent. return_mtd/ytd derived too.

# ─── Investment themes (Advisor Cockpit heatmap) ────────────────────────────
# Overall + 4 sub-scores on a MARKET-FAVORABILITY axis (-100 unfavorable ..
# +100 favorable). Calibrated to the mid-2026 VN story: investment-led growth
# strong, inflation contained, VND under mild depreciation pressure, foreign
# flows turned positive post-FTSE, bank liquidity/earnings solid.
_THEMES: tuple[dict, ...] = (
    dict(key="investment_growth", name_en="Investment-led growth",
         name_vi="Tăng trưởng dẫn dắt bởi đầu tư", momentum=72, valuation=34,
         earnings=58, flow=52, trend=6.0,
         rationale_vi="Đầu tư công tăng tốc, FDI giải ngân kỷ lục và GDP hướng mục tiêu 8% củng cố chu kỳ tăng trưởng.",
         rationale_en="Accelerating public investment, record FDI disbursement and GDP tracking the 8% target reinforce the growth cycle."),
    dict(key="inflation_pressure", name_en="Inflation pressure (contained)",
         name_vi="Áp lực lạm phát (trong tầm kiểm soát)", momentum=18, valuation=22,
         earnings=26, flow=30, trend=-1.5,
         rationale_vi="CPI neo quanh 3.3–3.6%, dưới mục tiêu 4.5% — dư địa chính sách tiền tệ vẫn còn.",
         rationale_en="CPI anchored around 3.3–3.6%, below the 4.5% target — monetary policy headroom remains."),
    dict(key="fx_stability", name_en="FX stability",
         name_vi="Ổn định tỷ giá", momentum=-32, valuation=-12,
         earnings=-16, flow=-24, trend=-4.0,
         rationale_vi="USD/VND tiến sát 26.400, áp lực mất giá kéo dài gây rủi ro cho DN nhập khẩu và dòng vốn.",
         rationale_en="USD/VND near 26,400 with persistent depreciation pressure — a risk for importers and capital flows."),
    dict(key="foreign_flow", name_en="Foreign flow pressure",
         name_vi="Áp lực dòng vốn ngoại", momentum=26, valuation=12,
         earnings=4, flow=18, trend=9.0,
         rationale_vi="Sau giai đoạn bán ròng mạnh 2024, kỳ vọng nâng hạng FTSE đảo chiều dòng vốn ngoại sang mua ròng.",
         rationale_en="After heavy 2024 net selling, FTSE-upgrade expectations flipped foreign flows to net buying."),
    dict(key="banking_liquidity", name_en="Banking liquidity",
         name_vi="Thanh khoản hệ thống ngân hàng", momentum=46, valuation=36,
         earnings=40, flow=32, trend=2.5,
         rationale_vi="Tín dụng tăng ~16%, thanh khoản dồi dào; lãi suất huy động nhích nhẹ nhưng vẫn thấp.",
         rationale_en="Credit growth ~16% with ample liquidity; deposit rates edging up but still low."),
    dict(key="earnings_delivery", name_en="Earnings delivery",
         name_vi="Khả năng hiện thực hóa lợi nhuận", momentum=50, valuation=40,
         earnings=60, flow=36, trend=3.5,
         rationale_vi="Lợi nhuận ngân hàng vững (ROE 20%+), chất lượng tài sản cải thiện, NPL toàn ngành thấp.",
         rationale_en="Bank earnings resilient (ROE 20%+), improving asset quality, low system NPL."),
)


def _signal(score: float) -> tuple[str, str]:
    """(vi, en) favorability label from an overall score."""
    if score >= 30:
        return "Tích cực", "Favorable"
    if score <= -30:
        return "Tiêu cực", "Unfavorable"
    return "Trung lập", "Neutral"


# ─── Curated advisor briefs (Advisor Cockpit right rail + report seed) ───────
# Each brief is a concrete opportunity/risk/catalyst an ACB Priority-Banking RM
# would raise with a client, linked to a theme, with a signal + conviction +
# thesis + a ready-to-say talking point, targeted at an ACB customer segment.
_BRIEFS: tuple[dict, ...] = (
    dict(theme="banking_liquidity", cat="Opportunity", signal="Tăng tỷ trọng", conv=5,
         title_vi="Cổ phiếu ngân hàng dẫn dắt lợi nhuận — tái cơ cấu danh mục KH Ưu tiên",
         title_en="Bank stocks lead earnings — reweight Priority portfolios",
         segment="Ngân hàng Ưu tiên",
         thesis_vi="Nhóm ngân hàng duy trì ROE >20% và NPL thấp trong khi định giá P/B ~2.0x chưa phản ánh chu kỳ tín dụng 16%.",
         thesis_en="Banks sustain ROE >20% and low NPL while ~2.0x P/B has yet to price in the 16% credit cycle.",
         talk_vi="Với khách hàng Ưu tiên đang nắm tiền gửi lớn, đề xuất phân bổ một phần sang rổ cổ phiếu ngân hàng chất lượng để đón chu kỳ lợi nhuận.",
         talk_en="For Priority clients holding large deposits, propose rotating a slice into quality bank equities to capture the earnings cycle."),
    dict(theme="foreign_flow", cat="Catalyst", signal="Chuẩn bị", conv=4,
         title_vi="Kỳ vọng nâng hạng FTSE — chuẩn bị sản phẩm đầu tư đón dòng vốn ngoại",
         title_en="FTSE upgrade expectation — ready investment products for inflows",
         segment="Ngân hàng Ưu tiên",
         thesis_vi="Việc FTSE Russell xem xét nâng hạng thị trường mới nổi hạng 2 có thể kích hoạt dòng vốn thụ động quay lại HOSE.",
         thesis_en="FTSE Russell's secondary emerging-market reclassification review could trigger passive inflows back to HOSE.",
         talk_vi="Đây là thời điểm giới thiệu sản phẩm chứng chỉ quỹ/ETF qua ACBS cho khách hàng muốn đón đầu dòng vốn ngoại.",
         talk_en="A timely moment to introduce fund/ETF products via ACBS for clients positioning ahead of foreign inflows."),
    dict(theme="fx_stability", cat="Risk", signal="Phòng vệ", conv=4,
         title_vi="Áp lực tỷ giá USD/VND — khuyến nghị phòng vệ cho KH nhập khẩu",
         title_en="USD/VND pressure — hedging for importer clients",
         segment="Doanh nghiệp Lớn",
         thesis_vi="USD/VND tiến sát 26.400 (+~3.5% so cùng kỳ) gây áp lực chi phí cho doanh nghiệp nhập khẩu và vay ngoại tệ.",
         thesis_en="USD/VND near 26,400 (~+3.5% YoY) pressures import costs and FX-denominated borrowers.",
         talk_vi="Đề xuất KH doanh nghiệp nhập khẩu sử dụng hợp đồng kỳ hạn/quyền chọn ngoại tệ của ACB để cố định chi phí.",
         talk_en="Recommend importer clients use ACB FX forwards/options to lock in costs."),
    dict(theme="investment_growth", cat="Opportunity", signal="Tăng tỷ trọng", conv=4,
         title_vi="Chu kỳ đầu tư công + FDI — cơ hội nhóm hạ tầng, KCN, vật liệu",
         title_en="Public investment + FDI cycle — infrastructure, IP, materials",
         segment="Doanh nghiệp Vừa & Nhỏ",
         thesis_vi="Giải ngân đầu tư công tăng tốc và FDI kỷ lục nâng đỡ nhu cầu hạ tầng, khu công nghiệp và vật liệu xây dựng.",
         thesis_en="Accelerating public disbursement and record FDI support infrastructure, industrial-park and building-materials demand.",
         talk_vi="Giới thiệu gói tín dụng vốn lưu động ACB cho SME trong chuỗi cung ứng hạ tầng/KCN đang mở rộng công suất.",
         talk_en="Offer ACB working-capital facilities to SMEs in the infrastructure/IP supply chain scaling capacity."),
    dict(theme="inflation_pressure", cat="Opportunity", signal="Duy trì", conv=3,
         title_vi="Lạm phát trong tầm kiểm soát — môi trường thuận lợi cho tài sản rủi ro",
         title_en="Contained inflation — supportive for risk assets",
         segment="Ngân hàng Ưu tiên",
         thesis_vi="CPI dưới 3.6% giữ dư địa cho chính sách tiền tệ nới lỏng, hỗ trợ định giá cổ phiếu và trái phiếu.",
         thesis_en="Sub-3.6% CPI preserves easing headroom, supporting equity and bond valuations.",
         talk_vi="Truyền thông với khách hàng rằng bối cảnh lãi suất thực dương thấp ủng hộ chiến lược cân bằng cổ phiếu–trái phiếu.",
         talk_en="Communicate to clients that a low positive-real-rate backdrop favors a balanced equity–bond strategy."),
    dict(theme="earnings_delivery", cat="Catalyst", signal="Theo dõi", conv=3,
         title_vi="Mùa công bố KQKD quý — xác nhận chất lượng lợi nhuận ngân hàng",
         title_en="Quarterly earnings season — confirm bank earnings quality",
         segment="Doanh nghiệp Lớn",
         thesis_vi="Kết quả quý xác nhận NIM ổn định và thu ngoài lãi tăng sẽ củng cố luận điểm đầu tư nhóm ngân hàng.",
         thesis_en="Quarterly results confirming stable NIM and rising non-interest income would reinforce the bank investment case.",
         talk_vi="Chuẩn bị bản tin nhanh cho khách hàng ngay sau công bố KQKD của các ngân hàng niêm yết trọng điểm.",
         talk_en="Prepare a client flash note immediately after key listed banks report."),
    dict(theme="foreign_flow", cat="Risk", signal="Theo dõi", conv=3,
         title_vi="Biến động dòng vốn ngoại — quản trị kỳ vọng khi thị trường nhạy tin",
         title_en="Foreign-flow volatility — manage expectations in a headline-sensitive market",
         segment="Khách hàng Cá nhân",
         thesis_vi="Dù đã đảo chiều mua ròng, dòng vốn ngoại vẫn nhạy với tin tức thuế quan và lãi suất Mỹ.",
         thesis_en="Though flows turned to net buying, foreign capital stays sensitive to tariff and US-rate headlines.",
         talk_vi="Nhắc khách hàng cá nhân giữ kỷ luật phân bổ, tránh mua đuổi theo các phiên dòng vốn ngoại đột biến.",
         talk_en="Remind retail clients to keep allocation discipline and avoid chasing foreign-flow spikes."),
    dict(theme="banking_liquidity", cat="Catalyst", signal="Duy trì", conv=4,
         title_vi="Tín dụng tăng tốc nửa cuối năm — cơ hội huy động CASA & bán chéo",
         title_en="Credit acceleration into H2 — CASA and cross-sell opportunity",
         segment="Doanh nghiệp Vừa & Nhỏ",
         thesis_vi="Cầu tín dụng SME phục hồi cùng đầu tư mở rộng tạo cơ hội tăng CASA và bán chéo dịch vụ quản lý dòng tiền.",
         thesis_en="Recovering SME credit demand and capex expansion open room to grow CASA and cross-sell cash-management.",
         talk_vi="Đề xuất gói tài khoản thanh toán + ngân hàng số ACB ONE Biz để tăng CASA cho nhóm SME đang mở rộng.",
         talk_en="Propose the ACB ONE Biz payment + digital package to grow CASA among expanding SMEs."),
)

# ─── Market / macro events timeline ──────────────────────────────────────────
# (date, type, impact, impact_score, related_metric, title_vi, title_en, src)
_EVENTS: tuple[tuple, ...] = (
    ("2024-02-08", "Macro", "Neutral", 0, "cpi_yoy",
     "Tết Nguyên đán — mùa vụ tiêu dùng và thanh khoản",
     "Lunar New Year — seasonal consumption and liquidity", "GSO"),
    ("2024-09-07", "Macro", "Negative", -3, "pmi",
     "Bão Yagi gây gián đoạn sản xuất miền Bắc — PMI giảm dưới 50",
     "Typhoon Yagi disrupts northern manufacturing — PMI dips below 50", "PMI"),
    ("2024-12-31", "Market", "Positive", 2, "vnindex",
     "VN-Index đóng cửa 2024 quanh 1.266 điểm (+~12% cả năm)",
     "VN-Index closes 2024 near 1,266 (~+12% for the year)", "HOSE"),
    ("2025-03-15", "Policy", "Neutral", 0, "deposit_rate_12m",
     "SBV giữ định hướng lãi suất điều hành ổn định hỗ trợ tăng trưởng",
     "SBV holds policy-rate stance steady to support growth", "SBV"),
    ("2025-04-03", "Market", "Negative", -4, "foreign_net_flow",
     "Lo ngại thuế quan Mỹ kích hoạt bán ròng khối ngoại",
     "US tariff concerns trigger foreign net selling", "HOSE"),
    ("2025-07-01", "Macro", "Positive", 3, "gdp_growth",
     "GDP quý 2/2025 vượt 7.5% — tăng trưởng vượt kỳ vọng",
     "Q2-2025 GDP tops 7.5% — growth beats expectations", "GSO"),
    ("2025-09-19", "Market", "Positive", 5, "foreign_net_flow",
     "Kỳ vọng FTSE Russell nâng hạng thị trường mới nổi — dòng vốn ngoại đảo chiều",
     "FTSE Russell EM-upgrade expectation — foreign flows reverse to buying", "HOSE"),
    ("2025-11-20", "Market", "Positive", 4, "vnindex",
     "VN-Index vượt mốc 1.500 điểm lần đầu",
     "VN-Index breaks above 1,500 for the first time", "HOSE"),
    ("2026-01-31", "Corporate", "Positive", 3, "credit_growth_yoy",
     "Ngành ngân hàng công bố KQKD 2025 vững, NPL toàn ngành thấp",
     "Banking sector posts resilient FY2025 results, low system NPL", "HOSE"),
    ("2026-05-12", "Rates", "Negative", -2, "usdvnd",
     "USD/VND tiến sát 26.400 — áp lực tỷ giá gia tăng",
     "USD/VND approaches 26,400 — FX pressure builds", "SBV"),
)


@dataclass
class AcbParameters:
    tenant_id: str = "acb"
    seed: int = 42


@dataclass
class AcbDataset:
    market_metrics_monthly: pd.DataFrame
    market_daily: pd.DataFrame
    theme_summary: pd.DataFrame
    advisor_brief: pd.DataFrame
    metric_dictionary: pd.DataFrame
    market_events: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "market_metrics_monthly": self.market_metrics_monthly,
            "market_daily": self.market_daily,
            "theme_summary": self.theme_summary,
            "advisor_brief": self.advisor_brief,
            "metric_dictionary": self.metric_dictionary,
            "market_events": self.market_events,
        }


def generate_acb(params: AcbParameters) -> AcbDataset:
    rng = np.random.default_rng(params.seed)
    daily = _build_market_daily(params, rng)
    monthly = _build_market_metrics_monthly(params, rng, daily)
    return AcbDataset(
        market_metrics_monthly=monthly,
        market_daily=daily,
        theme_summary=_build_theme_summary(params),
        advisor_brief=_build_advisor_brief(params),
        metric_dictionary=_build_metric_dictionary(params),
        market_events=_build_market_events(params),
    )


# ─── helpers ────────────────────────────────────────────────────────────────
def _months() -> list[tuple[int, int, datetime]]:
    """(year, monthnum, first-of-month) for 2024-01 … 2026-06."""
    out = []
    y, m = _START.year, _START.month
    for _ in range(_N_MONTHS):
        out.append((y, m, datetime(y, m, 1)))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def _interp(anchors: list[tuple[int, float]], i: int) -> float:
    """Piecewise-linear interpolate value at month index i from sorted anchors."""
    if i <= anchors[0][0]:
        return anchors[0][1]
    if i >= anchors[-1][0]:
        return anchors[-1][1]
    for (x0, v0), (x1, v1) in pairwise(anchors):
        if x0 <= i <= x1:
            t = (i - x0) / (x1 - x0) if x1 != x0 else 0.0
            return v0 + (v1 - v0) * t
    return anchors[-1][1]


def _trading_days() -> list[datetime]:
    days = []
    d = datetime(2024, 1, 2)
    while d <= _DAILY_END:
        if d.weekday() < 5:  # Mon–Fri (holidays ignored — synthetic)
            days.append(d)
        d += timedelta(days=1)
    return days


# ─── market_daily ────────────────────────────────────────────────────────────
def _build_market_daily(params: AcbParameters, rng) -> pd.DataFrame:
    days = _trading_days()
    src_name, src_url = _SRC["HOSE"]
    der_name, der_url = _SRC["DERIVED"]

    # Monthly VN-Index close targets (anchors pinned to the real 2024/2025 story;
    # intermediate months get a smooth path + small wobble).
    idx_anchors = [(0, 1175.0), (11, 1266.0), (20, 1470.0), (23, 1500.0), (29, 1560.0)]
    fx_anchors = [(0, -6000.0), (11, -8200.0), (20, 5200.0), (23, 4200.0), (29, 2600.0)]  # foreign net, tỷ/mo
    to_anchors = [(0, 16_000.0), (11, 19_000.0), (23, 24_000.0), (29, 22_000.0)]           # turnover tỷ/day
    pe_anchors = [(0, 13.8), (11, 15.0), (23, 16.5), (29, 16.0)]
    pb_anchors = [(0, 1.68), (11, 1.80), (23, 2.05), (29, 2.00)]

    month_list = _months()
    month_target: dict[tuple[int, int], float] = {}
    for i, (y, m, _) in enumerate(month_list):
        base = _interp(idx_anchors, i)
        # pin the anchor months exactly, jitter the rest for a realistic wave
        pinned = i in (0, 11, 20, 23, 29)
        month_target[(y, m)] = base if pinned else base * (1 + rng.normal(0, 0.022))

    def midx(y: int, m: int) -> int:
        return (y - 2024) * 12 + (m - 1)

    # group trading days by (year, month)
    by_month: dict[tuple[int, int], list[datetime]] = {}
    for d in days:
        by_month.setdefault((d.year, d.month), []).append(d)

    rows = []
    did = 1
    prev_close = 1160.0                 # end-2023 level
    year_open_close: dict[int, float] = {}   # last close of prior Dec → YTD base
    prev_dec_close = 1160.0
    for (y, m), md in sorted(by_month.items()):
        target = month_target.get((y, m), prev_close)
        n = len(md)
        i = midx(y, m)
        fx_month = _interp(fx_anchors, i)
        to_month = _interp(to_anchors, i)
        pe_month = _interp(pe_anchors, i)
        pb_month = _interp(pb_anchors, i)
        start_close = prev_close
        for j, d in enumerate(md):
            frac = (j + 1) / n
            # glide from start toward target with daily noise; last day == target
            base = start_close + (target - start_close) * frac
            if j == n - 1:
                close = target
            else:
                close = base * (1 + rng.normal(0, 0.0065))
            change_pct = (close / prev_close - 1) * 100 if prev_close else 0.0

            # YTD base = last close of previous December (set below on year roll)
            ytd_base = year_open_close.get(y, prev_dec_close)
            # MTD base = start_close (prior month's realized close)
            ret_mtd = (close / start_close - 1) * 100 if start_close else 0.0
            ret_ytd = (close / ytd_base - 1) * 100 if ytd_base else 0.0

            turnover = to_month * (1 + rng.normal(0, 0.16)) * (2.4 if rng.random() < 0.03 else 1.0)
            turnover_vnd = int(max(turnover, 4000) * 1e9)
            fx_net = (fx_month / n) * (1 + rng.normal(0, 0.9))
            fx_net_vnd = int(fx_net * 1e9)
            gross = abs(turnover) * 0.12 * 1e9  # foreign gross ≈ 12% of turnover
            buy = int((gross + fx_net_vnd) / 2)
            sell = int((gross - fx_net_vnd) / 2)
            pe = round(pe_month * (1 + rng.normal(0, 0.01)), 2)
            pb = round(pb_month * (1 + rng.normal(0, 0.01)), 2)

            rows.append({
                "DailyId": did,
                "Date": d,
                "Year": y,
                "MonthNum": m,
                "VnIndex": round(close, 2),
                "ChangePct": round(change_pct, 2),
                "ReturnMtdPct": round(ret_mtd, 2),
                "ReturnYtdPct": round(ret_ytd, 2),
                "TurnoverVnd": turnover_vnd,
                "ForeignNetVnd": fx_net_vnd,
                "ForeignBuyVnd": buy,
                "ForeignSellVnd": sell,
                "MarketPe": pe,
                "MarketPb": pb,
                "Source": src_name,
                "SourceUrl": src_url,
                "DataDate": d,
                "MockData": 1,
                "TenantId": params.tenant_id,
            })
            did += 1
            prev_close = close
        # record December close for next-year YTD base
        if m == 12:
            year_open_close[y + 1] = prev_close
            prev_dec_close = prev_close
    # note: der_name/der_url reserved for derived-metric provenance in monthly table
    _ = (der_name, der_url)
    return pd.DataFrame(rows)


# ─── market_metrics_monthly (tidy long) ──────────────────────────────────────
def _build_market_metrics_monthly(params: AcbParameters, rng, daily: pd.DataFrame) -> pd.DataFrame:
    months = _months()
    rows: list[dict] = []
    mid = 1

    def emit(series: dict, meta: dict) -> None:
        """series: {(y,m): value}; meta carries names/unit/source/etc."""
        nonlocal mid
        ordered = [(y, m, dt) for (y, m, dt) in months]
        vals = {(y, m): series[(y, m)] for (y, m, _) in ordered}
        keys = [(y, m) for (y, m, _) in ordered]
        for idx, (y, m, dt) in enumerate(ordered):
            v = vals[(y, m)]
            pm = vals[keys[idx - 1]] if idx >= 1 else None
            py = vals[keys[idx - 12]] if idx >= 12 else None
            mom_pct = ((v / pm - 1) * 100) if (pm not in (None, 0)) else None
            yoy_pct = ((v / py - 1) * 100) if (py not in (None, 0)) else None
            rows.append({
                "MonthId": mid,
                "Month": dt,
                "Year": y,
                "MonthNum": m,
                "MetricKey": meta["key"],
                "MetricName": meta["name_en"],
                "MetricNameVi": meta["name_vi"],
                "Category": meta["category"],
                "Value": round(float(v), meta["dp"]),
                "Unit": meta["unit"],
                "ValueType": meta["vt"],
                "PriorMonthValue": (round(float(pm), meta["dp"]) if pm is not None else None),
                "MoMChangePct": (round(mom_pct, 2) if mom_pct is not None else None),
                "PriorYearValue": (round(float(py), meta["dp"]) if py is not None else None),
                "YoYChangePct": (round(yoy_pct, 2) if yoy_pct is not None else None),
                "FavorableDirection": meta["fav_dir"],
                "Source": _SRC[meta["src"]][0],
                "SourceUrl": _SRC[meta["src"]][1],
                "DataDate": dt,
                "MockData": 1,
                "TenantId": params.tenant_id,
            })
            mid += 1

    # 1) macro / rate metrics from anchor specs
    exports_series: dict = {}
    imports_series: dict = {}
    for spec in _MACRO_SPECS:
        series = {}
        for idx, (y, m, _) in enumerate(months):
            base = _interp(spec["anchors"], idx)
            if spec["seasonal"]:
                base *= _SEASON[m]
            noise = rng.normal(0, spec["vol"] * max(abs(base), 1.0))
            val = base + noise
            if spec["vt"] in ("rate_pct", "index"):
                val = max(val, 0.0)
            series[(y, m)] = val
        if spec["key"] == "exports":
            exports_series = series
        if spec["key"] == "imports":
            imports_series = series
        emit(series, spec)

    # 2) trade balance = exports − imports (coherent, derived)
    tb = {(y, m): exports_series[(y, m)] - imports_series[(y, m)] for (y, m, _) in months}
    emit(tb, dict(key="trade_balance", name_en="Trade balance (monthly)",
                  name_vi="Cán cân thương mại (tháng)", category="Macro", unit="USD bn",
                  fav_dir="up", src="GSO", vt="level", dp=2))

    # 3) GDP growth (quarterly value assigned to each month of the quarter)
    gdp = {}
    for (y, m, _) in months:
        q = (m - 1) // 3 + 1
        gdp[(y, m)] = _GDP_QUARTER.get((y, q), _GDP_QUARTER[(2026, 2)])
    emit(gdp, dict(key="gdp_growth", name_en="GDP growth (quarterly YoY)",
                   name_vi="Tăng trưởng GDP (quý, YoY)", category="Macro", unit="%",
                   fav_dir="up", src="GSO", vt="rate_pct", dp=2))

    # 4) market metrics aggregated from market_daily (coherent with the daily table)
    d = daily.copy()
    grp = d.groupby(["Year", "MonthNum"])
    close = grp["VnIndex"].last().to_dict()
    ret_mtd = grp["ReturnMtdPct"].last().to_dict()
    ret_ytd = grp["ReturnYtdPct"].last().to_dict()
    turnover = grp["TurnoverVnd"].mean().to_dict()
    fx_sum = grp["ForeignNetVnd"].sum().to_dict()
    pe = grp["MarketPe"].mean().to_dict()
    pb = grp["MarketPb"].mean().to_dict()

    def from_daily(dct, dp):
        return {(y, m): round(float(dct[(y, m)]), dp) for (y, m, _) in months}

    emit(from_daily(close, 2), dict(key="vnindex", name_en="VN-Index (month close)",
         name_vi="VN-Index (đóng cửa tháng)", category="Market", unit="index",
         fav_dir="up", src="HOSE", vt="index", dp=2))
    emit(from_daily(ret_mtd, 2), dict(key="return_mtd", name_en="VN-Index return (MTD)",
         name_vi="Hiệu suất VN-Index (MTD)", category="Market", unit="%",
         fav_dir="up", src="DERIVED", vt="rate_pct", dp=2))
    emit(from_daily(ret_ytd, 2), dict(key="return_ytd", name_en="VN-Index return (YTD)",
         name_vi="Hiệu suất VN-Index (YTD)", category="Market", unit="%",
         fav_dir="up", src="DERIVED", vt="rate_pct", dp=2))
    emit(from_daily(turnover, 0), dict(key="turnover", name_en="Avg daily turnover",
         name_vi="Thanh khoản bình quân/ngày", category="Market", unit="VND",
         fav_dir="up", src="HOSE", vt="level", dp=0))
    emit(from_daily(fx_sum, 0), dict(key="foreign_net_flow", name_en="Foreign net flow (monthly)",
         name_vi="Dòng vốn ngoại ròng (tháng)", category="Market", unit="VND",
         fav_dir="up", src="HOSE", vt="level", dp=0))
    emit(from_daily(pe, 2), dict(key="market_pe", name_en="Market P/E",
         name_vi="P/E thị trường", category="Market", unit="x",
         fav_dir="down", src="HOSE", vt="ratio", dp=2))
    emit(from_daily(pb, 2), dict(key="market_pb", name_en="Market P/B",
         name_vi="P/B thị trường", category="Market", unit="x",
         fav_dir="down", src="HOSE", vt="ratio", dp=2))

    return pd.DataFrame(rows)


# ─── theme_summary ────────────────────────────────────────────────────────────
def _build_theme_summary(params: AcbParameters) -> pd.DataFrame:
    src_name, src_url = _SRC["DERIVED"]
    as_of = _MONTHLY_END
    rows = []
    for i, t in enumerate(_THEMES, 1):
        overall = round((t["momentum"] + t["valuation"] + t["earnings"] + t["flow"]) / 4.0, 1)
        sig_vi, sig_en = _signal(overall)
        rows.append({
            "ThemeId": i,
            "ThemeKey": t["key"],
            "ThemeName": t["name_en"],
            "ThemeNameVi": t["name_vi"],
            "MomentumScore": t["momentum"],
            "ValuationScore": t["valuation"],
            "EarningsScore": t["earnings"],
            "FlowScore": t["flow"],
            "OverallScore": overall,
            "TrendPct": t["trend"],
            "Signal": sig_en,
            "SignalVi": sig_vi,
            "RationaleVi": t["rationale_vi"],
            "RationaleEn": t["rationale_en"],
            "AsOfDate": as_of,
            "Source": src_name,
            "SourceUrl": src_url,
            "MockData": 1,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── advisor_brief ────────────────────────────────────────────────────────────
def _build_advisor_brief(params: AcbParameters) -> pd.DataFrame:
    src_name, src_url = _SRC["DERIVED"]
    as_of = _MONTHLY_END
    conv_label = {5: "Rất cao", 4: "Cao", 3: "Trung bình", 2: "Thấp", 1: "Rất thấp"}
    rows = []
    for i, b in enumerate(_BRIEFS, 1):
        rows.append({
            "BriefId": i,
            "BriefDate": as_of,
            "ThemeKey": b["theme"],
            "Category": b["cat"],
            "TitleVi": b["title_vi"],
            "TitleEn": b["title_en"],
            "Signal": b["signal"],
            "Conviction": b["conv"],
            "ConvictionLabel": conv_label[b["conv"]],
            "TargetSegment": b["segment"],
            "ThesisVi": b["thesis_vi"],
            "ThesisEn": b["thesis_en"],
            "TalkingPointVi": b["talk_vi"],
            "TalkingPointEn": b["talk_en"],
            "Source": src_name,
            "SourceUrl": src_url,
            "MockData": 1,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── metric_dictionary ────────────────────────────────────────────────────────
def _build_metric_dictionary(params: AcbParameters) -> pd.DataFrame:
    # cadence + definition per metric key (mirrors the metrics emitted above)
    defs: tuple[tuple, ...] = (
        ("cpi_yoy", "Chỉ số giá tiêu dùng so cùng kỳ năm trước.",
         "Consumer Price Index, year-over-year change.", "Monthly"),
        ("gdp_growth", "Tăng trưởng GDP thực theo quý so cùng kỳ.",
         "Real GDP growth, quarterly year-over-year.", "Quarterly"),
        ("fdi_registered", "Vốn FDI đăng ký mới + tăng thêm trong tháng.",
         "Newly registered + adjusted FDI capital in the month.", "Monthly"),
        ("fdi_disbursed", "Vốn FDI thực hiện (giải ngân) trong tháng.",
         "FDI capital actually disbursed in the month.", "Monthly"),
        ("exports", "Kim ngạch xuất khẩu hàng hóa trong tháng.",
         "Merchandise export turnover in the month.", "Monthly"),
        ("imports", "Kim ngạch nhập khẩu hàng hóa trong tháng.",
         "Merchandise import turnover in the month.", "Monthly"),
        ("trade_balance", "Cán cân thương mại = xuất khẩu − nhập khẩu.",
         "Trade balance = exports − imports.", "Monthly"),
        ("retail_sales_yoy", "Tổng mức bán lẻ hàng hóa & doanh thu dịch vụ, so cùng kỳ.",
         "Total retail sales & services revenue, YoY.", "Monthly"),
        ("pmi", "Chỉ số nhà quản trị mua hàng ngành sản xuất (>50 = mở rộng).",
         "Manufacturing Purchasing Managers' Index (>50 = expansion).", "Monthly"),
        ("usdvnd", "Tỷ giá tham chiếu/thị trường USD/VND.",
         "USD/VND reference/market exchange rate.", "Daily"),
        ("deposit_rate_12m", "Lãi suất tiền gửi VND kỳ hạn 12 tháng (tham chiếu).",
         "12-month VND deposit interest rate (benchmark).", "Monthly"),
        ("credit_growth_yoy", "Tăng trưởng tín dụng toàn hệ thống so cùng kỳ.",
         "System-wide credit growth, YoY.", "Monthly"),
        ("vnindex", "Chỉ số VN-Index trên sàn HOSE.",
         "VN-Index level on the HOSE exchange.", "Daily"),
        ("return_mtd", "Hiệu suất VN-Index lũy kế từ đầu tháng.",
         "VN-Index return, month-to-date.", "Daily"),
        ("return_ytd", "Hiệu suất VN-Index lũy kế từ đầu năm.",
         "VN-Index return, year-to-date.", "Daily"),
        ("turnover", "Giá trị giao dịch khớp lệnh bình quân/ngày trên HOSE.",
         "Average daily matched trading value on HOSE.", "Daily"),
        ("foreign_net_flow", "Giá trị mua ròng (bán ròng) của khối ngoại.",
         "Foreign investors' net buy (sell) value.", "Daily"),
        ("market_pe", "Hệ số giá trên lợi nhuận toàn thị trường (HOSE).",
         "Market price-to-earnings ratio (HOSE).", "Daily"),
        ("market_pb", "Hệ số giá trên giá trị sổ sách toàn thị trường (HOSE).",
         "Market price-to-book ratio (HOSE).", "Daily"),
    )
    # index metric metadata (name/unit/category/fav/src) from the emit specs above
    meta_by_key: dict[str, dict] = {}
    for s in _MACRO_SPECS:
        meta_by_key[s["key"]] = dict(name_en=s["name_en"], name_vi=s["name_vi"],
                                     category=s["category"], unit=s["unit"],
                                     fav=s["fav_dir"], src=s["src"])
    _extra = {
        "gdp_growth": ("GDP growth (quarterly YoY)", "Tăng trưởng GDP (quý, YoY)", "Macro", "%", "up", "GSO"),
        "trade_balance": ("Trade balance (monthly)", "Cán cân thương mại (tháng)", "Macro", "USD bn", "up", "GSO"),
        "vnindex": ("VN-Index", "VN-Index", "Market", "index", "up", "HOSE"),
        "return_mtd": ("VN-Index return (MTD)", "Hiệu suất VN-Index (MTD)", "Market", "%", "up", "DERIVED"),
        "return_ytd": ("VN-Index return (YTD)", "Hiệu suất VN-Index (YTD)", "Market", "%", "up", "DERIVED"),
        "turnover": ("Avg daily turnover", "Thanh khoản bình quân/ngày", "Market", "VND", "up", "HOSE"),
        "foreign_net_flow": ("Foreign net flow", "Dòng vốn ngoại ròng", "Market", "VND", "up", "HOSE"),
        "market_pe": ("Market P/E", "P/E thị trường", "Market", "x", "down", "HOSE"),
        "market_pb": ("Market P/B", "P/B thị trường", "Market", "x", "down", "HOSE"),
    }
    for k, (ne, nv, cat, unit, fav, src) in _extra.items():
        meta_by_key.setdefault(k, dict(name_en=ne, name_vi=nv, category=cat,
                                       unit=unit, fav=fav, src=src))

    rows = []
    for i, (key, def_vi, def_en, cadence) in enumerate(defs, 1):
        mk = meta_by_key[key]
        rows.append({
            "DictId": i,
            "MetricKey": key,
            "MetricName": mk["name_en"],
            "MetricNameVi": mk["name_vi"],
            "Category": mk["category"],
            "Unit": mk["unit"],
            "DefinitionVi": def_vi,
            "DefinitionEn": def_en,
            "Cadence": cadence,
            "FavorableDirection": mk["fav"],
            "Source": _SRC[mk["src"]][0],
            "SourceUrl": _SRC[mk["src"]][1],
            "MockData": 1,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── market_events ────────────────────────────────────────────────────────────
def _build_market_events(params: AcbParameters) -> pd.DataFrame:
    rows = []
    for i, (d, typ, impact, score, related, title_vi, title_en, src) in enumerate(_EVENTS, 1):
        rows.append({
            "EventId": i,
            "EventDate": datetime.strptime(d, "%Y-%m-%d"),
            "EventType": typ,
            "Impact": impact,
            "ImpactScore": score,
            "RelatedMetric": related,
            "TitleVi": title_vi,
            "TitleEn": title_en,
            "Source": _SRC[src][0],
            "SourceUrl": _SRC[src][1],
            "MockData": 1,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)
