"""SHB (Ngân hàng TMCP Sài Gòn – Hà Nội) SME corporate-banking synthetic data.

Powers the SHB SME Corporate-Banking demo — ONE executive dashboard
("Bảng điều khiển Khối KHDN – Phân khúc SME") + an AI agent that recommends a
tailored marketing/product CAMPAIGN for a chosen SME industry.

Company facts (web research 2026-07-09):
- Ngân hàng TMCP Sài Gòn – Hà Nội (Saigon–Hanoi Commercial JSC Bank), est.
  13/11/1993, Top-5 private JSC bank, HQ 77 Trần Hưng Đạo Hà Nội. Tagline
  "Đối tác tin cậy – Giải pháp phù hợp". Strategic partner of the Hà Nội SME
  Association; 2022 ABF Best Trade Finance Bank.
- Brand: orange #F58220, indigo #2E3192.

Data model (two tables, both single-fact so the dashboard + agent are
single-table):
- IndustrySummary — one row per SME industry (16 rows): the pre-aggregated book
  the dashboard renders and the agent reasons over (dư nợ, NPL, CASA, growth,
  products/client, limit utilization, trade-finance, NTB, risk tier).
- SmeClients — ~1,600 sampled client rows (client-grade detail so the agent can
  drill: per-client outstanding, products held, limit utilization, region) —
  lets the agent target sub-segments (e.g. "KH sử dụng hạn mức > 80%").

Calibrated to a Top-5 private bank SME book: dư nợ ≈ 182,400 tỷ, ≈ 24,900 SME
clients. 100% Vietnamese. Currency VND shown as nghìn tỷ / tỷ.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from faker import Faker

# ─── Industry book (calibrated, from research §E) ───────────────────────────
# (industry_vn, group, du_no_ty, so_kh, npl_pct, casa_pct, growth_yoy_pct,
#  sp_per_kh, limit_util_pct, tf_volume_ty, risk_tier, trade_intensity)
# trade_intensity ∈ {"Cao","Trung bình","Thấp"} = import/export orientation.
_INDUSTRIES: tuple[tuple, ...] = (
    ("Xây dựng & hạ tầng",              "Xây dựng",     24600, 1850, 3.4, 11.2,  6.5, 2.9, 88,  8200, "Cao",         "Thấp"),
    ("Thương mại bán buôn & bán lẻ",    "Thương mại",   21800, 4600, 1.7, 19.5, 13.8, 3.1, 71, 12400, "Trung bình", "Trung bình"),
    ("Vật liệu xây dựng (thép, xi măng)","Xây dựng",     18200, 1420, 3.1, 12.0,  4.2, 2.6, 84,  6100, "Cao",         "Trung bình"),
    ("Dệt may & da giày (xuất khẩu)",   "Xuất khẩu",    16400, 1980, 1.9, 15.8,  9.4, 3.4, 79,  9800, "Trung bình", "Cao"),
    ("Thủy sản & nuôi trồng (xuất khẩu)","Xuất khẩu",    13900, 1540, 2.3, 13.2, 12.1, 3.0, 82,  7600, "Trung bình", "Cao"),
    ("Cà phê, nông sản & chế biến",     "Nông nghiệp",  12700, 2260, 2.6, 12.6,  8.0, 2.5, 80,  5400, "Trung bình", "Cao"),
    ("Logistics & vận tải",             "Dịch vụ",      11300, 1610, 2.0, 16.4, 15.2, 2.8, 74,  4200, "Trung bình", "Trung bình"),
    ("Thực phẩm & đồ uống (F&B)",       "Tiêu dùng",    10800, 2540, 1.6, 21.0, 14.6, 3.2, 68,  2600, "Thấp",        "Thấp"),
    ("Nhựa & bao bì",                   "Sản xuất",      8600,  980, 2.1, 14.1,  7.3, 2.7, 81,  3800, "Trung bình", "Trung bình"),
    ("Gỗ & nội thất (xuất khẩu)",       "Xuất khẩu",     8200, 1120, 2.8, 12.9,  5.1, 2.9, 83,  4600, "Cao",         "Cao"),
    ("Linh kiện điện tử & CN hỗ trợ",   "Sản xuất",      7900,  760, 1.4, 17.3, 18.4, 3.3, 76,  5200, "Thấp",        "Cao"),
    ("Dược phẩm & thiết bị y tế",       "Y tế",          6700,  690, 1.2, 18.6, 11.0, 3.5, 66,  2400, "Thấp",        "Trung bình"),
    ("Du lịch, khách sạn & nhà hàng",   "Dịch vụ",       6300, 1180, 3.6, 13.7, 19.8, 2.4, 72,   900, "Cao",         "Thấp"),
    ("Công nghệ thông tin & phần mềm",  "Công nghệ",     5400,  620, 0.9, 22.4, 24.5, 3.6, 58,   700, "Thấp",        "Trung bình"),
    ("Cao su & hóa chất",               "Sản xuất",      5100,  430, 2.4, 12.2,  3.8, 2.6, 85,  2800, "Trung bình", "Cao"),
    ("Điện, năng lượng & tiện ích",     "Năng lượng",    4500,  320, 1.1, 15.0, 10.7, 3.1, 70,  1500, "Thấp",        "Trung bình"),
)
_IND_KEYS = ("industry", "group", "du_no_ty", "so_kh", "npl_pct", "casa_pct",
             "growth_yoy_pct", "sp_per_kh", "limit_util_pct", "tf_volume_ty",
             "risk_tier", "trade_intensity")

# Regions where SHB SME clients concentrate (weighted).
_REGIONS: tuple[tuple[str, float], ...] = (
    ("Hà Nội", 0.26), ("TP. Hồ Chí Minh", 0.24), ("Đồng bằng sông Cửu Long", 0.14),
    ("Đông Nam Bộ", 0.12), ("Miền Trung", 0.11), ("Đồng bằng sông Hồng", 0.08),
    ("Miền núi phía Bắc", 0.05),
)

# The 8 SHB corporate products (from the real site menu) for products-per-client.
_PRODUCTS = (
    "Tiền gửi & quản lý tài khoản", "Tín dụng vốn lưu động", "Tín dụng trung dài hạn",
    "Tài trợ thương mại (L/C, factoring)", "Bảo lãnh (dự thầu/thực hiện)",
    "Ngoại hối & phòng ngừa rủi ro", "Ngân hàng số SHB SAHA/Corporate", "Thẻ tín dụng doanh nghiệp",
)

_RISK_TIERS = ("Thấp", "Trung bình", "Cao")


@dataclass
class ShbParameters:
    tenant_id: str
    seed: int = 42
    # target number of sampled client rows across all industries
    client_sample: int = 1600


@dataclass
class ShbDataset:
    industry_summary: pd.DataFrame
    sme_clients: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "IndustrySummary": self.industry_summary,
            "SmeClients": self.sme_clients,
        }


def generate_shb(params: ShbParameters) -> ShbDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker("vi_VN")
    Faker.seed(params.seed)

    industry_summary = _build_industry_summary(params)
    sme_clients = _build_sme_clients(params, rng, fake)
    return ShbDataset(industry_summary=industry_summary, sme_clients=sme_clients)


def _ind_dicts() -> list[dict]:
    return [dict(zip(_IND_KEYS, r)) for r in _INDUSTRIES]


def _build_industry_summary(params: ShbParameters) -> pd.DataFrame:
    rows = []
    for i, d in enumerate(_ind_dicts(), 1):
        du_no_vnd = int(d["du_no_ty"] * 1e9)
        # deposits implied from CASA + a plausible loan-to-deposit relationship:
        # SME deposits ≈ dư nợ / LDR(≈0.9) so the book roughly balances.
        deposits_vnd = int(du_no_vnd / 0.9)
        casa_vnd = int(deposits_vnd * d["casa_pct"] / 100)
        npl_vnd = int(du_no_vnd * d["npl_pct"] / 100)
        # NII ≈ dư nợ × net spread (~3.2%); fee income ≈ trade-finance × ~0.9%
        nii_vnd = int(du_no_vnd * 0.032)
        fee_vnd = int(d["tf_volume_ty"] * 1e9 * 0.009 + d["so_kh"] * 4e6)
        limit_granted_vnd = int(du_no_vnd / (d["limit_util_pct"] / 100))
        # new-to-bank scales with growth
        ntb = int(d["so_kh"] * d["growth_yoy_pct"] / 100 * 0.6)
        rev_per_kh_vnd = int((nii_vnd + fee_vnd) / d["so_kh"])
        rows.append({
            "IndustryId": i,
            "Industry": d["industry"],
            "IndustryGroup": d["group"],
            "RiskTier": d["risk_tier"],
            "TradeIntensity": d["trade_intensity"],
            "ClientCount": d["so_kh"],
            "OutstandingVnd": du_no_vnd,
            "DepositsVnd": deposits_vnd,
            "CasaVnd": casa_vnd,
            "NplVnd": npl_vnd,
            "NplPct": round(d["npl_pct"] / 100, 4),
            "CasaPct": round(d["casa_pct"] / 100, 4),
            "GrowthYoYPct": round(d["growth_yoy_pct"] / 100, 4),
            "ProductsPerClient": d["sp_per_kh"],
            "LimitGrantedVnd": limit_granted_vnd,
            "LimitUtilPct": round(d["limit_util_pct"] / 100, 4),
            "TradeFinanceVnd": int(d["tf_volume_ty"] * 1e9),
            "NiiVnd": nii_vnd,
            "FeeIncomeVnd": fee_vnd,
            "RevenuePerClientVnd": rev_per_kh_vnd,
            "NewToBank": ntb,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


def _build_sme_clients(params: ShbParameters, rng, fake) -> pd.DataFrame:
    """Sampled client-grade rows so the agent can target sub-segments. Each
    client's metrics are drawn around its industry's summary values, so
    per-industry aggregates of this table track IndustrySummary."""
    inds = _ind_dicts()
    total_kh = sum(d["so_kh"] for d in inds)
    # allocate the sample proportionally to client counts
    alloc = {d["industry"]: max(20, round(params.client_sample * d["so_kh"] / total_kh)) for d in inds}

    reg_names = [r[0] for r in _REGIONS]
    reg_w = np.array([r[1] for r in _REGIONS], float); reg_w /= reg_w.sum()
    seg_names = ("Doanh nghiệp siêu nhỏ", "Doanh nghiệp nhỏ", "Doanh nghiệp vừa")
    seg_w = np.array([0.42, 0.40, 0.18])

    biz_suffix = ("Thương mại", "Sản xuất", "Xuất nhập khẩu", "Dịch vụ", "Đầu tư",
                  "Phát triển", "Công nghiệp", "Chế biến")
    biz_form = ("Công ty TNHH", "Công ty CP", "Doanh nghiệp tư nhân", "Công ty TNHH MTV")

    rows = []
    cid = 1
    for d in inds:
        n = alloc[d["industry"]]
        avg_out = d["du_no_ty"] * 1e9 / d["so_kh"]  # avg outstanding per client
        util0 = d["limit_util_pct"] / 100
        casa0 = d["casa_pct"] / 100
        npl0 = d["npl_pct"] / 100
        for _ in range(n):
            # lognormal-ish outstanding spread around the industry average
            out = max(2e8, avg_out * float(rng.lognormal(mean=-0.15, sigma=0.6)))
            util = float(np.clip(rng.normal(util0, 0.12), 0.15, 1.05))
            limit = out / max(0.2, util)
            n_products = int(np.clip(round(rng.normal(d["sp_per_kh"], 1.0)), 1, len(_PRODUCTS)))
            products = ", ".join(sorted(rng.choice(_PRODUCTS, size=n_products, replace=False)))
            # per-client risk group: mostly performing; a tail delinquent scaled by industry NPL
            r = rng.random()
            if r < npl0 * 0.6:
                grp = "Nợ xấu (nhóm 3-5)"
            elif r < npl0 * 0.6 + 0.12:
                grp = "Nợ cần chú ý (nhóm 2)"
            else:
                grp = "Đủ tiêu chuẩn (nhóm 1)"
            casa_client = float(np.clip(rng.normal(casa0, 0.06), 0.02, 0.6))
            deposits = out / 0.9 * float(rng.uniform(0.6, 1.4))
            tf = out * float(rng.uniform(0.0, 1.2)) if d["trade_intensity"] != "Thấp" else out * float(rng.uniform(0.0, 0.3))
            seg = str(rng.choice(seg_names, p=seg_w))
            is_ntb = 1 if rng.random() < (d["growth_yoy_pct"] / 100 * 0.5) else 0
            name = f"{rng.choice(biz_form)} {fake.last_name()} {rng.choice(biz_suffix)}"
            rows.append({
                "ClientId": f"SME{cid:05d}",
                "ClientName": name,
                "Industry": d["industry"],
                "IndustryGroup": d["group"],
                "Region": str(rng.choice(reg_names, p=reg_w)),
                "Segment": seg,
                "OutstandingVnd": int(out),
                "LimitGrantedVnd": int(limit),
                "LimitUtilPct": round(min(util, 1.05), 4),
                "DepositsVnd": int(deposits),
                "CasaPct": round(casa_client, 4),
                "ProductCount": n_products,
                "Products": products,
                "TradeFinanceVnd": int(tf),
                "DebtGroup": grp,
                "RiskTier": d["risk_tier"],
                "NewToBank": is_ntb,
                "RelationshipYears": int(rng.integers(1, 16)),
                "TenantId": params.tenant_id,
            })
            cid += 1
    return pd.DataFrame(rows)
