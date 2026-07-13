"""VNPT (Tập đoàn Bưu chính Viễn thông Việt Nam) telecom EXECUTIVE control-tower
synthetic data generator.

Powers the VNPT "Quản trị điều hành" (executive management / control tower) demo
for the group CEO / board — a single premium dashboard:
  KPI row (Doanh thu · ARPU · Thuê bao di động · Phát triển ròng · Churn · 5G) ·
  Biến động thuê bao (net-adds momentum) · Doanh thu & ARPU (dual trend) ·
  Nguyên nhân rời mạng (Pareto) · Bản đồ 63 tỉnh (bubble) · Cơ cấu doanh thu +
  Top tỉnh/thành.

Contract: emits a ``VnptDataset`` whose column names match
``packages/factory-schema/telecom.schema.json``.

Company facts (grounded by web research 2026-07-10, real published numbers):
- Total revenue (consolidated): 2025 ≈ 61,246 tỷ ₫ · 2024 58,540 · 2023 54,856.
- Pre-tax profit: 2025 ≈ 6,600 tỷ · 2024 6,086. Growth ~+4-5%/yr, profit faster.
- Mobile (VinaPhone) ≈ 30 triệu thuê bao, 22.8% thị phần (Viettel 56.6%, MobiFone 18.5%).
- Băng rộng/FTTH ≈ 8 triệu, ~40.7% #1. MyTV ≈ 5.3 triệu. VNPT Money ≈ 1.8 triệu.
- 5G launched 2024, phủ 63 tỉnh. ~30,000 nhân sự. 8 data center. Brand blue #1265b6.
- ARPU & revenue-by-segment split are NOT published → synthesized/modeled here.

Data model — pre-aggregated so every dashboard sheet is SINGLE-TABLE (the VACS
extract-workbook technique: one datasource per table, no cross-table relationship
needed at render time):
  Dimensions : Services · Provinces
  Facts      : MonthlyTotals (month grain) · MonthlyService (month×service) ·
               ProvinceSummary (province snapshot) · ChurnReasons (ranked)

Timeframe: full 2024 (last year) + full 2025 (current year) so YoY revenue,
ARPU and net-adds have clean 12-vs-12-month signal. "As-of" the 2025 close.

100% Vietnamese labels. Money in VND.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

# ─── Service lines (VNPT segments) ──────────────────────────────────────────
# (name_vn, revenue_share, base_subs_millions, arpu_vnd_month, yoy_growth_pct,
#  is_subscriber_line). Shares sum to 1.0; calibrated to the modeled split
# (Mobile ~46% / Broadband ~27% / Digital+IT ~14% / MyTV ~5% / DC+Cloud ~5% /
#  Fintech ~3%). Digital/IT & DataCenter are B2B revenue lines (no consumer subs
#  headline), Fintech (VNPT Money) is measured in users.
_SERVICES: tuple[tuple, ...] = (
    # name,                       share, subs_m, arpu,   yoy,  subscriber_line
    ("Di động VinaPhone",         0.46,  30.0,   78_000, 3.5,  True),
    ("Băng rộng cố định (FTTH)",  0.27,   8.0,  165_000, 9.0,  True),
    ("Dịch vụ số & CNTT",         0.14,   0.0,       0,  22.0, False),
    ("Truyền hình MyTV",          0.05,   5.3,   58_000, 6.0,  True),
    ("Trung tâm dữ liệu & Cloud", 0.05,   0.0,       0,  35.0, False),
    ("VNPT Money (Fintech)",      0.03,   1.8,       0,  48.0, False),
)
_SERVICE_KEYS = ("name", "share", "subs_m", "arpu", "yoy", "sub_line")

# ─── Provinces (63 pre-mid-2025) — weighted by VNPT market size ─────────────
# (province_vn, region_vn, lat, lon, weight). Weight = relative share of VNPT
# revenue/subscribers; Hà Nội & TP.HCM dominate. Region ∈ {Miền Bắc, Miền
# Trung, Miền Nam}. Lat/lon are real province-capital coordinates.
_PROVINCES: tuple[tuple, ...] = (
    ("Hà Nội",            "Miền Bắc",  21.0278, 105.8342, 14.0),
    ("TP. Hồ Chí Minh",   "Miền Nam",  10.8231, 106.6297, 15.5),
    ("Hải Phòng",         "Miền Bắc",  20.8449, 106.6881, 3.4),
    ("Đà Nẵng",           "Miền Trung",16.0544, 108.2022, 3.2),
    ("Cần Thơ",           "Miền Nam",  10.0452, 105.7469, 2.6),
    ("Bình Dương",        "Miền Nam",  11.3254, 106.4770, 3.6),
    ("Đồng Nai",          "Miền Nam",  10.9453, 106.8133, 3.3),
    ("Bắc Ninh",          "Miền Bắc",  21.1861, 106.0763, 2.4),
    ("Quảng Ninh",        "Miền Bắc",  21.0064, 107.2925, 2.3),
    ("Nghệ An",           "Miền Trung",18.6790, 105.6813, 2.6),
    ("Thanh Hóa",         "Miền Trung",19.8067, 105.7852, 2.7),
    ("Thái Nguyên",       "Miền Bắc",  21.5942, 105.8480, 1.7),
    ("Hải Dương",         "Miền Bắc",  20.9373, 106.3145, 1.8),
    ("Hưng Yên",          "Miền Bắc",  20.6464, 106.0511, 1.6),
    ("Nam Định",          "Miền Bắc",  20.4388, 106.1621, 1.5),
    ("Thái Bình",         "Miền Bắc",  20.4463, 106.3366, 1.5),
    ("Bắc Giang",         "Miền Bắc",  21.2731, 106.1946, 1.7),
    ("Phú Thọ",           "Miền Bắc",  21.3227, 105.4020, 1.5),
    ("Vĩnh Phúc",         "Miền Bắc",  21.3089, 105.6049, 1.6),
    ("Quảng Nam",         "Miền Trung",15.5394, 108.0191, 1.7),
    ("Quảng Ngãi",        "Miền Trung",15.1214, 108.8044, 1.4),
    ("Bình Định",         "Miền Trung",13.7829, 109.2196, 1.6),
    ("Khánh Hòa",         "Miền Trung",12.2388, 109.1967, 1.9),
    ("Thừa Thiên Huế",    "Miền Trung",16.4637, 107.5909, 1.5),
    ("Lâm Đồng",          "Miền Trung",11.9404, 108.4583, 1.6),
    ("Đắk Lắk",           "Miền Trung",12.6667, 108.0500, 1.7),
    ("Gia Lai",           "Miền Trung",13.9833, 108.0000, 1.4),
    ("Bà Rịa - Vũng Tàu", "Miền Nam",  10.4114, 107.1362, 2.0),
    ("Bình Phước",        "Miền Nam",  11.7512, 106.7235, 1.2),
    ("Long An",           "Miền Nam",  10.5350, 106.4137, 1.7),
    ("Tiền Giang",        "Miền Nam",  10.4493, 106.3421, 1.6),
    ("Bến Tre",           "Miền Nam",  10.2415, 106.3759, 1.3),
    ("An Giang",          "Miền Nam",  10.5216, 105.1259, 1.7),
    ("Kiên Giang",        "Miền Nam",  10.0125, 105.0809, 1.6),
    ("Đồng Tháp",         "Miền Nam",  10.4938, 105.6882, 1.4),
    ("Tây Ninh",          "Miền Nam",  11.3100, 106.0989, 1.4),
    ("Cà Mau",            "Miền Nam",   9.1769, 105.1524, 1.2),
    ("Sóc Trăng",         "Miền Nam",   9.6037, 105.9800, 1.2),
    ("Vĩnh Long",         "Miền Nam",  10.2537, 105.9722, 1.2),
    ("Trà Vinh",          "Miền Nam",   9.9347, 106.3453, 1.0),
    ("Hậu Giang",         "Miền Nam",   9.7579, 105.6413, 0.9),
    ("Bạc Liêu",          "Miền Nam",   9.2941, 105.7216, 0.9),
    ("Bình Thuận",        "Miền Trung",10.9289, 108.1000, 1.4),
    ("Ninh Thuận",        "Miền Trung",11.5675, 108.9877, 0.9),
    ("Phú Yên",           "Miền Trung",13.0882, 109.0929, 1.1),
    ("Quảng Bình",        "Miền Trung",17.4689, 106.6222, 1.1),
    ("Quảng Trị",         "Miền Trung",16.7943, 107.0451, 1.0),
    ("Hà Tĩnh",           "Miền Trung",18.3559, 105.8877, 1.3),
    ("Kon Tum",           "Miền Trung",14.3497, 108.0005, 0.8),
    ("Đắk Nông",          "Miền Trung",12.0045, 107.6870, 0.8),
    ("Lào Cai",           "Miền Bắc",  22.4809, 103.9755, 1.1),
    ("Yên Bái",           "Miền Bắc",  21.7229, 104.9113, 0.9),
    ("Tuyên Quang",       "Miền Bắc",  21.8236, 105.2181, 0.9),
    ("Lạng Sơn",          "Miền Bắc",  21.8531, 106.7610, 1.0),
    ("Cao Bằng",          "Miền Bắc",  22.6657, 106.2570, 0.7),
    ("Bắc Kạn",           "Miền Bắc",  22.1470, 105.8348, 0.6),
    ("Hà Giang",          "Miền Bắc",  22.8233, 104.9836, 0.8),
    ("Sơn La",            "Miền Bắc",  21.3271, 103.9188, 1.0),
    ("Điện Biên",         "Miền Bắc",  21.3860, 103.0230, 0.7),
    ("Lai Châu",          "Miền Bắc",  22.3862, 103.4703, 0.6),
    ("Hòa Bình",          "Miền Bắc",  20.8171, 105.3376, 0.9),
    ("Ninh Bình",         "Miền Bắc",  20.2506, 105.9745, 1.1),
    ("Hà Nam",            "Miền Bắc",  20.5835, 105.9230, 1.0),
)
_PROVINCE_KEYS = ("province", "region", "lat", "lon", "weight")

# ─── Churn reasons (Pareto — ranked share of rời mạng) ──────────────────────
_CHURN_REASONS: tuple[tuple[str, float], ...] = (
    ("Giá cước / khuyến mãi đối thủ", 0.29),
    ("Chất lượng sóng / tốc độ mạng", 0.22),
    ("Chăm sóc khách hàng",           0.15),
    ("Chuyển vùng / chuyển nhà",       0.12),
    ("Chuyển mạng giữ số (MNP)",       0.10),
    ("Ngừng sử dụng dịch vụ",          0.07),
    ("Khác",                            0.05),
)

# ─── Monthly seasonality (share of annual — Tết + hè cao) ───────────────────
_MONTH_VOL_WEIGHT = {
    1: 1.05, 2: 1.10, 3: 0.97, 4: 0.95, 5: 0.98, 6: 1.02,
    7: 1.04, 8: 1.03, 9: 0.97, 10: 0.98, 11: 0.96, 12: 0.95,
}

_LAST_YEAR = 2024
_CUR_YEAR = 2025

# Annual consolidated revenue anchors (tỷ ₫ → VND). Growth 58,540 → 61,246.
_REVENUE_LY_VND = 58_540e9
_REVENUE_CY_VND = 61_246e9
# Blended group ARPU trend (₫/tháng) — synthesized, mobile-weighted.
_ARPU_LY = 76_500
_ARPU_CY = 79_800
# Group churn (mobile-led) — improving slightly YoY (retention story).
_CHURN_LY_PCT = 1.62   # % of base / month
_CHURN_CY_PCT = 1.48
# 5G subscribers ramp (millions) across 2024→2025 (launched 2024).
_FIVEG_START_M = 1.2
_FIVEG_END_M = 8.6


@dataclass
class VnptParameters:
    tenant_id: str
    seed: int = 42


@dataclass
class VnptDataset:
    services: pd.DataFrame
    provinces: pd.DataFrame
    monthly_totals: pd.DataFrame
    monthly_service: pd.DataFrame
    province_summary: pd.DataFrame
    churn_reasons: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Services": self.services,
            "Provinces": self.provinces,
            "MonthlyTotals": self.monthly_totals,
            "MonthlyService": self.monthly_service,
            "ProvinceSummary": self.province_summary,
            "ChurnReasons": self.churn_reasons,
        }


def generate_vnpt(params: VnptParameters) -> VnptDataset:
    rng = np.random.default_rng(params.seed)
    services = _build_services(params)
    provinces = _build_provinces(params)
    monthly_totals = _build_monthly_totals(params, rng)
    monthly_service = _build_monthly_service(params, rng)
    province_summary = _build_province_summary(params, rng)
    churn_reasons = _build_churn_reasons(params, rng)
    return VnptDataset(
        services=services, provinces=provinces, monthly_totals=monthly_totals,
        monthly_service=monthly_service, province_summary=province_summary,
        churn_reasons=churn_reasons,
    )


# ─── helpers ────────────────────────────────────────────────────────────────
def _service_dicts() -> list[dict]:
    return [dict(zip(_SERVICE_KEYS, s)) for s in _SERVICES]


def _province_dicts() -> list[dict]:
    return [dict(zip(_PROVINCE_KEYS, p)) for p in _PROVINCES]


def _jit(rng, base: float, pct: float = 0.04) -> float:
    """±pct jitter around base (deterministic via rng)."""
    return base * (1.0 + rng.uniform(-pct, pct))


# ─── Dimensions ─────────────────────────────────────────────────────────────
def _build_services(params: VnptParameters) -> pd.DataFrame:
    rows = []
    for i, s in enumerate(_service_dicts(), 1):
        rows.append({
            "ServiceId": i,
            "ServiceName": s["name"],
            "IsSubscriberLine": int(s["sub_line"]),
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


def _build_provinces(params: VnptParameters) -> pd.DataFrame:
    rows = []
    for i, p in enumerate(_province_dicts(), 1):
        rows.append({
            "ProvinceId": i,
            "Province": p["province"],
            "Region": p["region"],
            "Lat": p["lat"],
            "Lon": p["lon"],
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── MonthlyTotals (headline KPIs, month grain, 2024+2025) ──────────────────
def _build_monthly_totals(params: VnptParameters, rng) -> pd.DataFrame:
    subs_lines = [s for s in _service_dicts() if s["sub_line"]]
    mobile_subs_base = 30.0e6  # end-2025 mobile base

    # Precompute per-year monthly revenue split by seasonality.
    def month_rev(year: int, mo: int) -> float:
        annual = _REVENUE_LY_VND if year == _LAST_YEAR else _REVENUE_CY_VND
        wsum = sum(_MONTH_VOL_WEIGHT.values())
        return annual * _MONTH_VOL_WEIGHT[mo] / wsum

    # Subscriber base grows month-over-month toward ~30M mobile at 2025 close;
    # broadband ~8M, MyTV ~5.3M. Track a single blended "total subscribers".
    tot_subs_end = sum(s["subs_m"] for s in subs_lines) * 1e6  # ≈ 43.3M
    # linear-ish ramp across 24 months with mild seasonality on net adds
    months: list[tuple[int, int]] = [(_LAST_YEAR, m) for m in range(1, 13)] + \
                                    [(_CUR_YEAR, m) for m in range(1, 13)]
    n = len(months)
    # base at start ≈ 92% of end (≈ +8% over 2 years / retention-led growth)
    start_subs = tot_subs_end * 0.915

    rows = []
    prev_total = None
    # keep a parallel history for YoY (index i vs i-12)
    hist_rev, hist_subs, hist_netadds, hist_arpu = [], [], [], []
    for i, (yr, mo) in enumerate(months):
        frac = i / (n - 1)
        # total subscriber base this month (smooth ramp + small seasonal wiggle)
        base_total = start_subs + (tot_subs_end - start_subs) * frac
        base_total *= (1.0 + 0.004 * (_MONTH_VOL_WEIGHT[mo] - 1.0) * 10)
        total_subs = int(_jit(rng, base_total, 0.006))

        # churn rate improving over time LY→CY
        churn_pct = (_CHURN_LY_PCT if yr == _LAST_YEAR else _CHURN_CY_PCT)
        churn_pct = _jit(rng, churn_pct, 0.06)
        churned = int(total_subs * churn_pct / 100.0)
        # gross adds = churned + net growth this month
        if prev_total is None:
            net_adds = int(total_subs * 0.004)
        else:
            net_adds = total_subs - prev_total
        # seasonal boost to gross adds during Tết & summer
        gross_adds = max(net_adds + churned, 0)
        gross_adds = int(_jit(rng, gross_adds * _MONTH_VOL_WEIGHT[mo], 0.05))
        churned = max(gross_adds - net_adds, 0)  # keep identity net = gross - churn
        prev_total = total_subs

        revenue = int(_jit(rng, month_rev(yr, mo), 0.03))
        # EBITDA margin ~ 32-34%
        ebitda = int(revenue * _jit(rng, 0.33, 0.03))
        # pre-tax profit margin ~ 10.5-11% (6.6k tỷ on 61.2k tỷ)
        profit = int(revenue * _jit(rng, 0.108, 0.04))

        arpu_base = _ARPU_LY if yr == _LAST_YEAR else _ARPU_CY
        arpu = int(_jit(rng, arpu_base, 0.015))

        fiveg = int((_FIVEG_START_M + (_FIVEG_END_M - _FIVEG_START_M) * frac)
                    * 1e6 * (1.0 + rng.uniform(-0.02, 0.02)))
        data_pb = round(_jit(rng, 210 + 130 * frac, 0.05), 1)  # petabytes/month

        rows.append({
            "TotalsId": i + 1,
            "Month": datetime(yr, mo, 1),
            "Year": yr,
            "MonthNum": mo,
            "RevenueVnd": revenue,
            "EbitdaVnd": ebitda,
            "PretaxProfitVnd": profit,
            "TotalSubscribers": total_subs,
            "GrossAdds": gross_adds,
            "Churned": churned,
            "NetAdds": net_adds,
            "ChurnRatePct": round(churn_pct, 2),
            "Arpu": arpu,
            "FiveGSubs": fiveg,
            "DataTrafficPb": data_pb,
            "TenantId": params.tenant_id,
        })
        hist_rev.append(revenue); hist_subs.append(total_subs)
        hist_netadds.append(net_adds); hist_arpu.append(arpu)

    # Attach same-month prior-year values for clean YoY (row i vs i-12).
    for i, r in enumerate(rows):
        if i >= 12:
            r["PriorYearRevenueVnd"] = hist_rev[i - 12]
            r["PriorYearSubscribers"] = hist_subs[i - 12]
            r["PriorYearNetAdds"] = hist_netadds[i - 12]
            r["PriorYearArpu"] = hist_arpu[i - 12]
        else:
            r["PriorYearRevenueVnd"] = 0
            r["PriorYearSubscribers"] = 0
            r["PriorYearNetAdds"] = 0
            r["PriorYearArpu"] = 0
    return pd.DataFrame(rows)


# ─── MonthlyService (month × service line) ──────────────────────────────────
def _build_monthly_service(params: VnptParameters, rng) -> pd.DataFrame:
    svcs = _service_dicts()
    months: list[tuple[int, int]] = [(_LAST_YEAR, m) for m in range(1, 13)] + \
                                    [(_CUR_YEAR, m) for m in range(1, 13)]
    wsum = sum(_MONTH_VOL_WEIGHT.values())
    rows = []
    sid = 1
    for yr, mo in months:
        annual = _REVENUE_LY_VND if yr == _LAST_YEAR else _REVENUE_CY_VND
        month_rev = annual * _MONTH_VOL_WEIGHT[mo] / wsum
        for s in svcs:
            # CY revenue for high-growth digital lines is larger share vs LY
            growth_tilt = 1.0
            if yr == _CUR_YEAR and s["yoy"] >= 20:
                growth_tilt = 1.06
            rev = int(_jit(rng, month_rev * s["share"] * growth_tilt, 0.035))
            subs = int(_jit(rng, s["subs_m"] * 1e6, 0.01)) if s["sub_line"] else 0
            rows.append({
                "ServiceMonthId": sid,
                "Month": datetime(yr, mo, 1),
                "Year": yr,
                "MonthNum": mo,
                "ServiceName": s["name"],
                "RevenueVnd": rev,
                "Subscribers": subs,
                "GrowthYoYPct": round(_jit(rng, s["yoy"], 0.10), 1),
                "TenantId": params.tenant_id,
            })
            sid += 1
    return pd.DataFrame(rows)


# ─── ProvinceSummary (63-province snapshot for the map + top-N) ─────────────
def _build_province_summary(params: VnptParameters, rng) -> pd.DataFrame:
    provs = _province_dicts()
    wsum = sum(p["weight"] for p in provs)
    total_rev = _REVENUE_CY_VND  # 2025 snapshot
    total_subs = sum(s["subs_m"] for s in _service_dicts() if s["sub_line"]) * 1e6
    rows = []
    for i, p in enumerate(provs, 1):
        share = p["weight"] / wsum
        rev = int(_jit(rng, total_rev * share, 0.05))
        subs = int(_jit(rng, total_subs * share, 0.05))
        # churn a touch higher in the far-flung / competitive provinces (low weight),
        # lower in the metro strongholds
        base_churn = 1.48 + (0.9 - min(p["weight"], 6.0) / 6.0) * 0.7
        churn = round(_jit(rng, base_churn, 0.08), 2)
        # 5G coverage higher in metros
        cov = min(99.0, _jit(rng, 55 + p["weight"] * 4.5, 0.06))
        # market share vs Viettel/MobiFone — VNPT ~22-24% nationally, metros higher
        share_pct = round(_jit(rng, 20.5 + p["weight"] * 0.55, 0.05), 1)
        growth = round(_jit(rng, 4.0 + (2.0 if p["region"] == "Miền Nam" else 0.0), 0.25), 1)
        rows.append({
            "ProvinceSummaryId": i,
            "Province": p["province"],
            "Region": p["region"],
            "Lat": p["lat"],
            "Lon": p["lon"],
            "RevenueVnd": rev,
            "Subscribers": subs,
            "ChurnRatePct": churn,
            "FiveGCoveragePct": round(cov, 1),
            "MarketSharePct": min(share_pct, 34.0),
            "GrowthYoYPct": growth,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── ChurnReasons (ranked Pareto) ───────────────────────────────────────────
def _build_churn_reasons(params: VnptParameters, rng) -> pd.DataFrame:
    # Total churned events across CY 2025 (approx monthly churn × base).
    total = int(30.0e6 * (_CHURN_CY_PCT / 100.0) * 12 * 0.5)  # mobile-led sample
    rows = []
    for i, (reason, share) in enumerate(_CHURN_REASONS, 1):
        cnt = int(_jit(rng, total * share, 0.03))
        rows.append({
            "ChurnReasonId": i,
            "Reason": reason,
            "ChurnedCount": cnt,
            "SharePct": round(share * 100, 1),
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)
