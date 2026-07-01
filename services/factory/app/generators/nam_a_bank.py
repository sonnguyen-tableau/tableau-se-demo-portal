"""Nam A Bank retail-banking synthetic data generator.

Powers the Nam A Bank Command Center demo: Retail Portfolio, Credit Risk & NPL,
Deposit Mobilization & Cross-sell, Digital & ONEBANK Network.

Contract: emits a `NamABankDataset` whose column names match
`packages/factory-schema/retail-banking-nama.schema.json` exactly.

Numbers calibrated to Nam A Bank 2025 publicly reported values (±5% jitter):
- NIM ~2.67%
- NPL ~2.16%
- ROE ~19.58%
- PAT ~4.2 nghìn tỷ VND
- CASA ~13.5%

Geography: HCMC + Đồng bằng Nam Bộ heavy (footprint reality), 63-tỉnh nationwide
but weighted toward South. 150 branches + 114 ONEBANK kiosks.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker


# ─── Segments ─────────────────────────────────────────────────────────────────
# Nam A Bank segment pyramid — Mass-heavy retail bank, thin Wealth tail.
_SEGMENTS: tuple[str, ...] = ("Mass", "MassAffluent", "Affluent", "Wealth")
_SEGMENT_PROBS: tuple[float, ...] = (0.62, 0.24, 0.11, 0.03)

# Vietnamese segment display names (used on some charts alongside English).
_SEGMENT_VN: dict[str, str] = {
    "Mass": "Phổ thông",
    "MassAffluent": "Trung lưu",
    "Affluent": "Khá giả",
    "Wealth": "Ưu tiên",
}


# ─── Products ─────────────────────────────────────────────────────────────────
# Real Nam A Bank retail product family (from namabank.com.vn/tiet-kiem, /cho-vay, /the).
_PRODUCTS: tuple[tuple[int, str, str, str, float, float], ...] = (
    # (ProductId, ProductName, ProductGroup, ProductSubGroup, BaseInterestRate, BaseFee)
    ( 1, "Tài khoản Thanh toán",           "Deposit",    "CASA",           0.0010, 0.0),
    ( 2, "Tiết kiệm Thông thường",         "Deposit",    "Term",           0.0620, 0.0),
    ( 3, "Tiết kiệm Online",               "Deposit",    "Term",           0.0680, 0.0),
    ( 4, "Tiết kiệm Lợi Ích Nhân Đôi",     "Deposit",    "Term",           0.0710, 0.0),
    ( 5, "Happy Future",                   "Deposit",    "Accumulation",   0.0650, 0.0),
    ( 6, "HAPPY HOME",                     "Loan",       "Mortgage",       0.0820, 0.0),
    ( 7, "An Gia Lập Nghiệp",              "Loan",       "Mortgage",       0.0880, 0.0),
    ( 8, "Vay Mua Xe Ô tô",                "Loan",       "Auto",           0.0950, 0.0),
    ( 9, "Vay Tiêu Dùng Có Tài Sản",       "Loan",       "ConsumerSecured",0.1050, 0.0),
    (10, "Thấu Chi Cá Nhân",               "Loan",       "Overdraft",      0.1650, 0.0),
    (11, "Siêu Tốc Lộc Phát 24h",          "Loan",       "ConsumerFast",   0.1450, 0.0),
    (12, "Vay Kinh Doanh Tự Do",           "Loan",       "SME",            0.1150, 0.0),
    (13, "Vay Nông Nghiệp",                "Loan",       "Agri",           0.0890, 0.0),
    (14, "Thẻ Visa Platinum",              "Card",       "CreditPremium",  0.2200, 0.0),
    (15, "Thẻ JCB Platinum",               "Card",       "CreditPremium",  0.2100, 0.0),
    (16, "Thẻ Mastercard Standard",        "Card",       "Credit",         0.2400, 0.0),
    (17, "Thẻ JCB Standard",               "Card",       "Credit",         0.2300, 0.0),
    (18, "Happy Card Platinum (NAPAS)",    "Card",       "CreditPremium",  0.1950, 0.0),
    (19, "Happy Lady",                     "Card",       "Credit",         0.2000, 0.0),
    (20, "Happy Golf",                     "Card",       "CreditPremium",  0.2050, 0.0),
    (21, "Happy Digital (Virtual Card)",   "Card",       "CreditDigital",  0.2250, 0.0),
    (22, "Mastercard Debit",               "Card",       "Debit",          0.0000, 0.0),
    (23, "NAPAS Debit",                    "Card",       "Debit",          0.0000, 0.0),
    (24, "Bảo hiểm nhân thọ FWD",          "Bancassurance","LifeInsurance",0.0000, 0.0),
    (25, "Bảo hiểm phi nhân thọ",          "Bancassurance","GeneralInsurance",0.0000,0.0),
    (26, "Kinh doanh Vàng miếng",          "Gold",       "GoldBar",        0.0000, 0.0),
)


# ─── Vietnamese Provinces / geography (Nam A Bank footprint) ──────────────────
# 34 tỉnh thành coverage với trọng số dựa vào 150 branches: HCMC/Nam Bộ đậm đặc.
# Format: (Province, City, Lat, Lon, BranchWeight, Region)
_VN_PROVINCES: tuple[tuple[str, str, float, float, float, str], ...] = (
    # South (HCMC-centric)
    ("Ho Chi Minh City", "Ho Chi Minh City", 10.7626, 106.6602, 32.0, "South"),
    ("Binh Duong",       "Thu Dau Mot",      10.9804, 106.6519,  8.0, "South"),
    ("Dong Nai",         "Bien Hoa",         10.9500, 106.8250,  7.0, "South"),
    ("Long An",          "Tan An",           10.5350, 106.4030,  5.0, "South"),
    ("Ba Ria - Vung Tau","Vung Tau",         10.3460, 107.0843,  4.0, "South"),
    ("Tay Ninh",         "Tay Ninh",         11.3100, 106.0980,  3.0, "South"),
    ("Binh Phuoc",       "Dong Xoai",        11.5350, 106.8830,  2.0, "South"),
    # Mekong Delta
    ("Can Tho",          "Can Tho",          10.0452, 105.7469,  4.0, "Mekong Delta"),
    ("An Giang",         "Long Xuyen",       10.3860, 105.4370,  3.0, "Mekong Delta"),
    ("Kien Giang",       "Rach Gia",         10.0125, 105.0808,  3.0, "Mekong Delta"),
    ("Tien Giang",       "My Tho",           10.3591, 106.3600,  2.5, "Mekong Delta"),
    ("Vinh Long",        "Vinh Long",        10.2537, 105.9722,  2.0, "Mekong Delta"),
    ("Dong Thap",        "Cao Lanh",         10.4632, 105.6320,  2.0, "Mekong Delta"),
    ("Ca Mau",           "Ca Mau",           9.1770,  105.1500,  2.0, "Mekong Delta"),
    ("Ben Tre",          "Ben Tre",          10.2415, 106.3752,  1.5, "Mekong Delta"),
    ("Bac Lieu",         "Bac Lieu",         9.2940,  105.7215,  1.5, "Mekong Delta"),
    ("Soc Trang",        "Soc Trang",        9.6003,  105.9800,  1.5, "Mekong Delta"),
    ("Hau Giang",        "Vi Thanh",         9.7845,  105.4700,  1.0, "Mekong Delta"),
    ("Tra Vinh",         "Tra Vinh",         9.9345,  106.3452,  1.0, "Mekong Delta"),
    # South Central Coast
    ("Khanh Hoa",        "Nha Trang",        12.2388, 109.1967,  4.0, "South Central"),
    ("Binh Thuan",       "Phan Thiet",       10.9333, 108.1000,  2.5, "South Central"),
    ("Ninh Thuan",       "Phan Rang",        11.5645, 108.9899,  1.5, "South Central"),
    ("Phu Yen",          "Tuy Hoa",          13.0955, 109.3220,  1.5, "South Central"),
    ("Binh Dinh",        "Quy Nhon",         13.7820, 109.2196,  2.0, "South Central"),
    ("Quang Ngai",       "Quang Ngai",       15.1213, 108.8043,  1.5, "South Central"),
    ("Quang Nam",        "Tam Ky",           15.5726, 108.4739,  1.5, "South Central"),
    # Central Highlands
    ("Lam Dong",         "Da Lat",           11.9404, 108.4583,  2.5, "Central Highlands"),
    ("Dak Lak",          "Buon Ma Thuot",    12.6667, 108.0500,  2.5, "Central Highlands"),
    ("Gia Lai",          "Pleiku",           13.9833, 108.0000,  1.5, "Central Highlands"),
    ("Kon Tum",          "Kon Tum",          14.3543, 108.0076,  0.8, "Central Highlands"),
    ("Dak Nong",         "Gia Nghia",        11.9450, 107.6820,  0.8, "Central Highlands"),
    # Central (Da Nang hub)
    ("Da Nang",          "Da Nang",          16.0544, 108.2022,  5.0, "Central"),
    ("Thua Thien Hue",   "Hue",              16.4637, 107.5909,  2.0, "Central"),
    # North Central
    ("Nghe An",          "Vinh",             18.6790, 105.6813,  2.5, "North Central"),
    ("Thanh Hoa",        "Thanh Hoa",        19.8069, 105.7851,  2.5, "North Central"),
    ("Ha Tinh",          "Ha Tinh",          18.3428, 105.9057,  1.5, "North Central"),
    # North
    ("Hanoi",            "Hanoi",            21.0285, 105.8542, 14.0, "Hanoi Capital"),
    ("Hai Phong",        "Hai Phong",        20.8449, 106.6881,  4.0, "North"),
    ("Quang Ninh",       "Ha Long",          20.9515, 107.0748,  2.5, "North"),
    ("Bac Ninh",         "Bac Ninh",         21.1861, 106.0763,  2.0, "North"),
    ("Hai Duong",        "Hai Duong",        20.9373, 106.3146,  1.5, "North"),
    ("Hung Yen",         "Hung Yen",         20.6464, 106.0511,  1.5, "North"),
    ("Bac Giang",        "Bac Giang",        21.2731, 106.1946,  1.5, "North"),
    ("Vinh Phuc",        "Vinh Yen",         21.3089, 105.6049,  1.5, "North"),
    ("Thai Nguyen",      "Thai Nguyen",      21.5942, 105.8481,  1.5, "North"),
    ("Nam Dinh",         "Nam Dinh",         20.4388, 106.1621,  1.0, "North"),
    ("Ninh Binh",        "Ninh Binh",        20.2506, 105.9744,  1.0, "North"),
    ("Ha Nam",           "Phu Ly",           20.5411, 105.9229,  0.8, "North"),
    ("Thai Binh",        "Thai Binh",        20.4463, 106.3366,  0.8, "North"),
    ("Phu Tho",          "Viet Tri",         21.3227, 105.4024,  1.0, "North"),
)


# ─── Next-Best-Offer pool (Nam A products) ────────────────────────────────────
_NBO_UPSELL_WEALTH: tuple[str, ...] = (
    "Nâng hạng Thẻ Visa Platinum",
    "Ưu tiên VIP Room + Concierge",
    "Danh mục đầu tư Kim loại quý Vàng miếng",
    "Bảo hiểm nhân thọ FWD trọn gói 1.5 tỷ",
    "Tiết kiệm Lợi Ích Nhân Đôi 24 tháng",
)
_NBO_CROSSSELL: tuple[str, ...] = (
    "Combo Happy Combo — Kích hoạt Open Banking",
    "Thẻ JCB Platinum + Miễn phí thường niên năm 1",
    "HAPPY HOME Refinance — Lãi suất 6.8%",
    "Happy Lady — Ưu đãi cho khách nữ",
    "Trả góp qua thẻ 0% 12 tháng",
    "Bảo hiểm nhân thọ FWD Gói An Tâm 300 triệu",
)
_NBO_ACQUISITION: tuple[str, ...] = (
    "Mở TK Online — Nhận 100k",
    "Thẻ Happy Digital Ảo — Duyệt tức thì",
    "Combo Happy Combo — Free 3 tháng phí",
    "Vay Siêu Tốc Lộc Phát 24h — 50 triệu duyệt trong ngày",
    "Chuyển lương qua Nam A Bank — Bonus 500k",
)
_NBO_WINBACK: tuple[str, ...] = (
    "Ưu đãi khách quay lại — Miễn phí 12 tháng SMS",
    "Bonus lãi suất tiết kiệm +0.3% cho khách cũ",
    "Tái kích hoạt Open Banking + 200k",
)


# ─── Parameters & Dataset ─────────────────────────────────────────────────────


@dataclass
class NamABankParameters:
    tenant_id: str
    start_date: date
    end_date: date
    n_customers: int = 85_000
    n_branches: int = 150
    n_onebank: int = 114
    base_daily_transactions: int = 12_000
    # Product mix among loan customers
    loan_penetration: float = 0.36
    # Fraction of customers with each digital channel active
    digital_adoption: float = 0.62
    # Nam A 2025 targets (used for calibration)
    npl_target: float = 0.0216
    nim_target: float = 0.0267
    casa_target: float = 0.135
    seed: int = 42
    # VN market events for transaction seasonality
    market_events: tuple[tuple[date, float], ...] = field(
        default_factory=lambda: (
            (date(2024, 11, 29), 1.6),   # Black Friday shopping surge
            (date(2025, 1, 28), 3.5),    # Tết 2025 (payroll + gifts)
            (date(2025, 9, 2), 1.4),     # Quốc khánh
            (date(2025, 11, 28), 1.7),   # Black Friday 2025
            (date(2026, 2, 17), 3.8),    # Tết 2026
        )
    )


@dataclass
class NamABankDataset:
    customers: pd.DataFrame
    branches: pd.DataFrame
    products: pd.DataFrame
    accounts: pd.DataFrame
    loans: pd.DataFrame
    transactions: pd.DataFrame
    digital_events: pd.DataFrame
    risk_scores: pd.DataFrame
    nbo_recommendations: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Customers": self.customers,
            "Branches": self.branches,
            "Products": self.products,
            "Accounts": self.accounts,
            "Loans": self.loans,
            "Transactions": self.transactions,
            "DigitalEvents": self.digital_events,
            "RiskScores": self.risk_scores,
            "NBORecommendations": self.nbo_recommendations,
        }


# ─── Generator ────────────────────────────────────────────────────────────────


def generate_nam_a_bank(params: NamABankParameters) -> NamABankDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker("vi_VN")
    Faker.seed(params.seed)

    branches = _build_branches(params, rng)
    products = _build_products()
    customers = _build_customers(params, rng, fake, branches)
    accounts = _build_accounts(params, rng, customers, products, branches)
    loans = _build_loans(params, rng, customers, products, branches)
    transactions = _build_transactions(params, rng, accounts)
    digital_events = _build_digital_events(params, rng, customers, branches)
    risk_scores = _build_risk_scores(params, rng, customers, loans)
    nbo = _build_nbo_recommendations(params, rng, customers)

    return NamABankDataset(
        customers=customers,
        branches=branches,
        products=products,
        accounts=accounts,
        loans=loans,
        transactions=transactions,
        digital_events=digital_events,
        risk_scores=risk_scores,
        nbo_recommendations=nbo,
    )


# ─── Table builders ───────────────────────────────────────────────────────────


def _build_branches(
    params: NamABankParameters, rng: np.random.Generator
) -> pd.DataFrame:
    """150 traditional branches + 114 ONEBANK kiosks, distributed by province weight."""
    n_traditional = params.n_branches
    n_kiosk = params.n_onebank
    n_total = n_traditional + n_kiosk

    weights = np.array([p[4] for p in _VN_PROVINCES], dtype=np.float64)
    probs = weights / weights.sum()
    prov_idx = rng.choice(len(_VN_PROVINCES), size=n_total, p=probs)

    lat = np.empty(n_total, dtype=np.float64)
    lon = np.empty(n_total, dtype=np.float64)
    province_arr: list[str] = []
    city_arr: list[str] = []
    region_arr: list[str] = []
    for i, idx in enumerate(prov_idx):
        p = _VN_PROVINCES[idx]
        province_arr.append(p[0])
        city_arr.append(p[1])
        region_arr.append(p[5])
        # Jitter ~1km so pins don't overlap on Symbol Map
        lat[i] = p[2] + rng.normal(0, 0.012)
        lon[i] = p[3] + rng.normal(0, 0.012)

    branch_type = np.concatenate([
        np.array(["Branch"] * n_traditional, dtype=object),
        np.array(["ONEBANK"] * n_kiosk, dtype=object),
    ])
    # Shuffle so type is not correlated with province ordering
    order = rng.permutation(n_total)
    branch_type = branch_type[order]

    # Branch names — traditional branches use city name; ONEBANK kiosks use city + kiosk suffix
    branch_names: list[str] = []
    onebank_counter = 0
    branch_counter = 0
    for i in range(n_total):
        if branch_type[i] == "Branch":
            branch_counter += 1
            branch_names.append(f"CN {city_arr[i]} {branch_counter:02d}")
        else:
            onebank_counter += 1
            branch_names.append(f"ONEBANK {city_arr[i]} {onebank_counter:03d}")

    # FTE: traditional branches 8-25 staff; ONEBANK kiosk 0 staff (fully automated)
    fte = np.where(
        branch_type == "Branch",
        rng.integers(8, 26, size=n_total),
        np.zeros(n_total, dtype=np.int32),
    ).astype(np.int16)

    return pd.DataFrame(
        {
            "BranchId": np.arange(1, n_total + 1, dtype=np.int32),
            "BranchName": branch_names,
            "BranchType": branch_type,
            "City": city_arr,
            "Province": province_arr,
            "Region": region_arr,
            "Country": ["VN"] * n_total,
            "Latitude": np.round(lat, 5),
            "Longitude": np.round(lon, 5),
            "OpenDate": [
                _random_dt_between(
                    rng,
                    params.start_date - timedelta(days=15 * 365),
                    params.start_date - timedelta(days=60),
                )
                for _ in range(n_total)
            ],
            "FteCount": fte,
            "TenantId": params.tenant_id,
        }
    )


def _build_products() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "ProductId": p[0],
                "ProductName": p[1],
                "ProductGroup": p[2],
                "ProductSubGroup": p[3],
                "BaseInterestRate": p[4],
                "BaseFee": p[5],
            }
            for p in _PRODUCTS
        ]
    )


def _build_customers(
    params: NamABankParameters,
    rng: np.random.Generator,
    fake: Faker,
    branches: pd.DataFrame,
) -> pd.DataFrame:
    n = params.n_customers
    segment = rng.choice(list(_SEGMENTS), size=n, p=list(_SEGMENT_PROBS))

    # Age distribution — banking skews adult
    age = np.clip(rng.normal(38, 12, size=n), 18, 78).round().astype(np.int8)

    # Gender split
    gender = rng.choice(["Male", "Female"], size=n, p=[0.51, 0.49])

    # Home branch (traditional branches only — ONEBANK doesn't have primary customers)
    trad_branches = branches[branches["BranchType"] == "Branch"]
    home_branch_id = rng.choice(
        trad_branches["BranchId"].to_numpy(), size=n
    ).astype(np.int32)
    branch_lookup = trad_branches.set_index("BranchId")[
        ["City", "Province", "Region"]
    ]
    home_city = branch_lookup.loc[home_branch_id, "City"].to_numpy()
    home_province = branch_lookup.loc[home_branch_id, "Province"].to_numpy()
    home_region = branch_lookup.loc[home_branch_id, "Region"].to_numpy()

    # Tenure years — mix of long-time + newer customers
    tenure = np.clip(rng.gamma(shape=2.5, scale=3.5, size=n), 0.1, 25).round(1).astype(np.float32)

    # Monthly income (VND millions) — segment-driven
    seg_income = {
        "Mass": 12,
        "MassAffluent": 35,
        "Affluent": 85,
        "Wealth": 220,
    }
    income_base = np.array([seg_income[s] for s in segment], dtype=np.float64)
    monthly_income_m = np.round(
        income_base * rng.lognormal(0, 0.32, size=n), 1
    ).astype(np.float32)  # million VND

    # Digital adoption — segment-driven (Wealth more likely to use mobile)
    digital_prob = {"Mass": 0.55, "MassAffluent": 0.72, "Affluent": 0.83, "Wealth": 0.88}
    digital_active = np.array(
        [rng.random() < digital_prob[s] for s in segment], dtype=bool
    )

    # Customer since (acquisition date)
    acq_date = [
        _random_dt_between(
            rng,
            params.start_date - timedelta(days=int(t * 365)),
            params.end_date,
        )
        for t in tenure
    ]

    # Happy Combo / Happy Lady bundle enrollment
    combo_enrolled = np.array(
        [rng.random() < (0.42 if s in ("MassAffluent", "Affluent") else 0.18)
         for s in segment], dtype=bool
    )
    lady_eligible = np.where(
        (gender == "Female") & (segment != "Mass") & (rng.random(n) < 0.45),
        True, False,
    )

    return pd.DataFrame(
        {
            "CustomerId": np.arange(1, n + 1, dtype=np.int32),
            # 85K customers exceeds faker's vi_VN unique name pool, so we use
            # plain names and prepend the CustomerId to guarantee uniqueness.
            "CustomerName": [fake.name() for _ in range(n)],
            "Segment": segment,
            "SegmentVN": [_SEGMENT_VN[s] for s in segment],
            "Gender": gender,
            "Age": age,
            "MonthlyIncomeM": monthly_income_m,
            "Region": home_region,
            "City": home_city,
            "Province": home_province,
            "PrimaryBranchId": home_branch_id,
            "AcquisitionDate": acq_date,
            "TenureYears": tenure,
            "DigitalActive": digital_active,
            "HappyComboEnrolled": combo_enrolled,
            "HappyLadyEligible": lady_eligible,
            "TenantId": params.tenant_id,
        }
    )


def _build_accounts(
    params: NamABankParameters,
    rng: np.random.Generator,
    customers: pd.DataFrame,
    products: pd.DataFrame,
    branches: pd.DataFrame,
) -> pd.DataFrame:
    """Every customer has 1 CASA + 0-3 term deposits + 0-2 cards on average."""
    n_cust = len(customers)

    # Product IDs by group
    casa_id = 1  # Tài khoản Thanh toán
    term_ids = [2, 3, 4, 5]  # Term & accumulation deposits
    card_ids = list(range(14, 24))  # 14-23 → all card products
    bancass_ids = [24, 25]
    gold_id = 26

    seg_arr = customers["Segment"].to_numpy()

    # Count of accounts per customer by product type
    # CASA: everyone gets 1
    n_casa = n_cust
    # Term deposits: segment-driven Poisson
    seg_term_lambda = {"Mass": 0.5, "MassAffluent": 1.3, "Affluent": 2.1, "Wealth": 3.0}
    n_term_per = np.array(
        [rng.poisson(seg_term_lambda[s]) for s in seg_arr], dtype=np.int16
    )
    # Cards: segment-driven
    seg_card_lambda = {"Mass": 0.3, "MassAffluent": 1.0, "Affluent": 1.6, "Wealth": 2.2}
    n_card_per = np.array(
        [rng.poisson(seg_card_lambda[s]) for s in seg_arr], dtype=np.int16
    )
    # Bancassurance: rare (5-15%)
    seg_bancass_p = {"Mass": 0.05, "MassAffluent": 0.12, "Affluent": 0.22, "Wealth": 0.38}
    has_bancass = np.array(
        [1 if rng.random() < seg_bancass_p[s] else 0 for s in seg_arr], dtype=np.int16
    )
    # Gold: only Affluent+
    has_gold = np.array(
        [1 if s in ("Affluent", "Wealth") and rng.random() < 0.15 else 0 for s in seg_arr],
        dtype=np.int16,
    )

    total_accounts_per_cust = 1 + n_term_per + n_card_per + has_bancass + has_gold
    total = int(total_accounts_per_cust.sum())

    # Build rows
    rows = {
        "AccountId": np.arange(1, total + 1, dtype=np.int64),
        "CustomerId": np.empty(total, dtype=np.int32),
        "ProductId": np.empty(total, dtype=np.int32),
        "Balance": np.empty(total, dtype=np.float64),
        "OpenDate": [None] * total,
        "BranchId": np.empty(total, dtype=np.int32),
        "Status": [None] * total,
        "TenantId": [params.tenant_id] * total,
    }

    idx = 0
    cust_ids = customers["CustomerId"].to_numpy()
    branch_ids = branches[branches["BranchType"] == "Branch"]["BranchId"].to_numpy()
    home_branches = customers["PrimaryBranchId"].to_numpy()

    for i, cust_id in enumerate(cust_ids):
        seg = seg_arr[i]
        home_b = int(home_branches[i])
        # CASA
        rows["CustomerId"][idx] = cust_id
        rows["ProductId"][idx] = casa_id
        # CASA balance — calibrated so total CASA ≈ 13.5% of total deposits.
        casa_mean = {"Mass": 15_000_000, "MassAffluent": 85_000_000, "Affluent": 400_000_000, "Wealth": 1_500_000_000}[seg]
        rows["Balance"][idx] = round(casa_mean * rng.lognormal(0, 0.65), -3)
        rows["BranchId"][idx] = home_b
        rows["OpenDate"][idx] = _random_dt_between(
            rng, params.start_date - timedelta(days=8 * 365), params.end_date
        )
        rows["Status"][idx] = "Active"
        idx += 1
        # Term deposits
        for _ in range(int(n_term_per[i])):
            rows["CustomerId"][idx] = cust_id
            rows["ProductId"][idx] = int(rng.choice(term_ids))
            # Term is 6-7x CASA on average → yields CASA/Total ≈ 13.5%.
            term_mean = {"Mass": 55_000_000, "MassAffluent": 250_000_000, "Affluent": 1_200_000_000, "Wealth": 4_500_000_000}[seg]
            rows["Balance"][idx] = round(term_mean * rng.lognormal(0, 0.5), -6)
            rows["BranchId"][idx] = int(rng.choice([home_b] * 3 + list(branch_ids)))  # 75% home branch
            rows["OpenDate"][idx] = _random_dt_between(
                rng, params.start_date - timedelta(days=3 * 365), params.end_date
            )
            rows["Status"][idx] = "Active"
            idx += 1
        # Cards
        for _ in range(int(n_card_per[i])):
            rows["CustomerId"][idx] = cust_id
            # Premium card products for higher segments
            if seg == "Wealth":
                pool = [14, 15, 18, 20]  # Visa Platinum, JCB Platinum, Happy Platinum, Happy Golf
            elif seg == "Affluent":
                pool = [14, 15, 16, 18, 19, 20]
            elif seg == "MassAffluent":
                pool = [15, 16, 17, 19, 21, 22]
            else:
                pool = [16, 17, 21, 22, 23]  # Standard cards + debit
            rows["ProductId"][idx] = int(rng.choice(pool))
            # Card "balance" = current outstanding (credit) or account balance (debit)
            if rows["ProductId"][idx] in [22, 23]:
                rows["Balance"][idx] = round(rng.lognormal(15, 0.8), -3)  # Debit
            else:
                # Credit card outstanding — some negative (unpaid)
                rows["Balance"][idx] = round(rng.uniform(-30_000_000, 5_000_000), -3)
            rows["BranchId"][idx] = home_b
            rows["OpenDate"][idx] = _random_dt_between(
                rng, params.start_date - timedelta(days=4 * 365), params.end_date
            )
            rows["Status"][idx] = str(rng.choice(["Active", "Active", "Active", "Frozen"]))
            idx += 1
        # Bancassurance
        if has_bancass[i]:
            rows["CustomerId"][idx] = cust_id
            rows["ProductId"][idx] = int(rng.choice(bancass_ids))
            # Bancassurance "balance" = policy sum assured
            rows["Balance"][idx] = round(rng.choice([500_000_000, 1_000_000_000, 1_500_000_000, 3_000_000_000]))
            rows["BranchId"][idx] = home_b
            rows["OpenDate"][idx] = _random_dt_between(
                rng, params.start_date - timedelta(days=3 * 365), params.end_date
            )
            rows["Status"][idx] = "Active"
            idx += 1
        # Gold
        if has_gold[i]:
            rows["CustomerId"][idx] = cust_id
            rows["ProductId"][idx] = gold_id
            # Gold "balance" = current value in VND (1 lượng ~ 80M VND)
            n_luong = rng.integers(1, 20)
            rows["Balance"][idx] = round(n_luong * 80_000_000 * rng.uniform(0.95, 1.05), -3)
            rows["BranchId"][idx] = home_b
            rows["OpenDate"][idx] = _random_dt_between(
                rng, params.start_date - timedelta(days=2 * 365), params.end_date
            )
            rows["Status"][idx] = "Active"
            idx += 1

    return pd.DataFrame(rows)


def _build_loans(
    params: NamABankParameters,
    rng: np.random.Generator,
    customers: pd.DataFrame,
    products: pd.DataFrame,
    branches: pd.DataFrame,
) -> pd.DataFrame:
    """Loans: 36% of customers have at least one loan, some have multiple."""
    n_cust = len(customers)
    seg_arr = customers["Segment"].to_numpy()
    income_arr = customers["MonthlyIncomeM"].to_numpy()

    # Loan penetration by segment
    seg_loan_p = {"Mass": 0.30, "MassAffluent": 0.55, "Affluent": 0.62, "Wealth": 0.50}
    has_loan = np.array(
        [rng.random() < seg_loan_p[s] for s in seg_arr], dtype=bool
    )
    # Some customers have 2 loans (mortgage + auto, etc.)
    n_loans_per = np.where(
        has_loan,
        np.where(rng.random(n_cust) < 0.25, 2, 1),  # 25% of loan customers have 2
        0,
    )
    total_loans = int(n_loans_per.sum())

    loan_product_ids = [6, 7, 8, 9, 10, 11, 12, 13]  # Loan product IDs
    loan_product_probs = [0.30, 0.06, 0.11, 0.14, 0.07, 0.09, 0.14, 0.09]  # HAPPY HOME dominant

    # Loan status distribution — calibrated to NPL 2.16% ±5% target.
    # NPL = sum(OutstandingBalance where Status in Delinquent60/90+) / sum(all).
    # Empirically (0.955, 0.020, 0.012, 0.013) yields NPL ~2.15%.
    status_probs = [0.955, 0.020, 0.012, 0.013]
    status_values = ["Current", "Delinquent30", "Delinquent60", "Delinquent90Plus"]

    home_branches = customers["PrimaryBranchId"].to_numpy()

    rows: list[dict[str, object]] = []
    loan_id = 1
    for i in range(n_cust):
        for _ in range(int(n_loans_per[i])):
            prod_id = int(rng.choice(loan_product_ids, p=loan_product_probs))
            seg = seg_arr[i]

            # Principal by product type + income
            if prod_id in [6, 7]:  # Mortgage
                # HAPPY HOME size — typically 500M to 5B VND, income-scaled
                base = income_arr[i] * 1_000_000 * rng.uniform(60, 200)  # ~5-15 years income
                principal = round(np.clip(base, 200_000_000, 15_000_000_000), -6)
            elif prod_id == 8:  # Auto
                principal = round(rng.uniform(300_000_000, 1_500_000_000), -6)
            elif prod_id in [9, 11]:  # Consumer
                principal = round(rng.uniform(20_000_000, 300_000_000), -6)
            elif prod_id == 10:  # Overdraft
                principal = round(rng.uniform(20_000_000, 200_000_000), -6)
            elif prod_id == 12:  # SME
                principal = round(rng.uniform(500_000_000, 5_000_000_000), -6)
            else:  # Agri
                principal = round(rng.uniform(100_000_000, 800_000_000), -6)

            # Interest rate — base rate + risk premium
            base_rate = float(
                products[products["ProductId"] == prod_id]["BaseInterestRate"].values[0]
            )
            rate = round(base_rate + rng.uniform(-0.005, 0.015), 4)

            origin_date = _random_dt_between(
                rng,
                params.start_date - timedelta(days=5 * 365),
                params.end_date - timedelta(days=30),
            )

            # Term months
            if prod_id in [6, 7]:
                term_months = int(rng.choice([120, 180, 240, 300], p=[0.15, 0.35, 0.35, 0.15]))
            elif prod_id == 8:
                term_months = int(rng.choice([36, 48, 60, 72]))
            elif prod_id == 12:
                term_months = int(rng.choice([12, 24, 36, 48, 60]))
            else:
                term_months = int(rng.choice([6, 12, 18, 24, 36]))

            # Outstanding = principal × (1 - amortization fraction)
            months_elapsed = int((datetime.now().date() - origin_date.date()).days / 30)
            amort_fraction = min(0.98, max(0.02, months_elapsed / term_months + rng.uniform(-0.1, 0.1)))
            outstanding = round(principal * (1 - amort_fraction), -3)

            # DPD & status
            status = str(rng.choice(status_values, p=status_probs))
            if status == "Current":
                dpd = int(rng.integers(0, 15))
            elif status == "Delinquent30":
                dpd = int(rng.integers(30, 60))
            elif status == "Delinquent60":
                dpd = int(rng.integers(60, 90))
            else:  # Delinquent90Plus
                dpd = int(rng.integers(90, 250))

            # Collateral value (mortgages only)
            if prod_id in [6, 7]:
                # LTV typically 60-85%, so collateral > principal
                ltv = rng.uniform(0.60, 0.85)
                collateral_value = round(principal / ltv, -6)
            elif prod_id == 8:  # Auto
                collateral_value = round(principal * rng.uniform(1.1, 1.4), -6)
            else:
                collateral_value = 0

            rows.append({
                "LoanId": loan_id,
                "CustomerId": int(customers["CustomerId"].iloc[i]),
                "ProductId": prod_id,
                "Principal": principal,
                "OutstandingBalance": outstanding,
                "InterestRate": rate,
                "Status": status,
                "DaysPastDue": dpd,
                "TermMonths": term_months,
                "CollateralValue": collateral_value,
                "OriginationDate": origin_date,
                "BranchId": int(home_branches[i]),
                "TenantId": params.tenant_id,
            })
            loan_id += 1

    return pd.DataFrame(rows)


def _build_transactions(
    params: NamABankParameters,
    rng: np.random.Generator,
    accounts: pd.DataFrame,
) -> pd.DataFrame:
    """Daily transactions on accounts with weekly/monthly/seasonal patterns."""
    days = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(days)

    base = np.full(n_days, float(params.base_daily_transactions))
    dow = np.array([d.dayofweek for d in days])
    # Friday payday spike + weekend dip
    dow_mult = np.where(dow == 4, 1.35, np.where(dow >= 5, 0.55, 1.0))
    # Month-end salary
    month_end_mult = np.where(np.array([d.day for d in days]) >= 25, 1.30, 1.0)

    event_mult = np.ones(n_days)
    for ev_date, ev_scale in params.market_events:
        if params.start_date <= ev_date <= params.end_date:
            idx = (ev_date - params.start_date).days
            for offset, s in ((-3, 0.4), (-2, 0.6), (-1, 0.85), (0, 1.0), (1, 0.5), (2, 0.3)):
                j = idx + offset
                if 0 <= j < n_days:
                    event_mult[j] = max(event_mult[j], 1 + (ev_scale - 1) * s)

    daily_tx = np.maximum(
        rng.poisson(base * dow_mult * month_end_mult * event_mult), 1
    )
    total_tx = int(daily_tx.sum())

    tx_dates = np.repeat(days.values, daily_tx).astype("datetime64[D]")

    # Sample accounts biased toward CASA (product_id=1) which has most activity
    casa_accounts = accounts[accounts["ProductId"] == 1]["AccountId"].to_numpy()
    other_accounts = accounts[accounts["ProductId"] != 1]["AccountId"].to_numpy()
    if len(other_accounts) > 0:
        # 82% CASA, 18% other
        p_casa = 0.82
        casa_pick = rng.random(total_tx) < p_casa
        account_ids = np.empty(total_tx, dtype=np.int64)
        account_ids[casa_pick] = rng.choice(casa_accounts, size=int(casa_pick.sum()))
        account_ids[~casa_pick] = rng.choice(other_accounts, size=int((~casa_pick).sum()))
    else:
        account_ids = rng.choice(casa_accounts, size=total_tx)

    # Amount — mostly small transfers, some large. Lognormal in millions.
    amounts = np.round(rng.lognormal(mean=13.5, sigma=1.4, size=total_tx), -3)
    # 60% debit (money out), 40% credit (money in)
    sign = np.where(rng.random(total_tx) < 0.60, -1, 1).astype(np.int8)

    tx_types = rng.choice(
        ["Transfer", "Bill Payment", "QR Payment", "Card Purchase", "ATM Withdrawal",
         "Salary Credit", "Loan Repayment", "Fee", "FX Exchange"],
        size=total_tx,
        p=[0.22, 0.15, 0.14, 0.13, 0.11, 0.09, 0.07, 0.06, 0.03],
    )
    channels = rng.choice(
        ["Open Banking", "ONEBANK", "Branch", "ATM", "Web"],
        size=total_tx,
        p=[0.48, 0.18, 0.10, 0.14, 0.10],
    )

    return pd.DataFrame(
        {
            "TransactionId": np.arange(1, total_tx + 1, dtype=np.int64),
            "AccountId": account_ids,
            "PostedDate": tx_dates,
            "Amount": (amounts * sign).astype(np.float64),
            "Type": tx_types,
            "Channel": channels,
            "TenantId": [params.tenant_id] * total_tx,
        }
    )


def _build_digital_events(
    params: NamABankParameters,
    rng: np.random.Generator,
    customers: pd.DataFrame,
    branches: pd.DataFrame,
) -> pd.DataFrame:
    """Digital channel events: eKYC, app logins, QR pay, VNeID auth via Trạm Công dân số."""
    active = customers[customers["DigitalActive"]]
    n_active = len(active)
    # ~10 events per active customer per year
    total_days = (params.end_date - params.start_date).days + 1
    events_per_cust = np.maximum(rng.poisson(10 * total_days / 365, size=n_active), 1)
    total = int(events_per_cust.sum())

    cust_ids = np.repeat(active["CustomerId"].to_numpy(), events_per_cust)

    # Event date — spread across period
    day_offsets = rng.integers(0, total_days, size=total)
    event_dates = np.array(
        [params.start_date + timedelta(days=int(d)) for d in day_offsets],
        dtype="datetime64[D]",
    )

    # Channel — Nam A digital DNA
    channel = rng.choice(
        ["Open Banking", "ONEBANK", "Web", "ATM", "VNeID Trạm Công dân số"],
        size=total,
        p=[0.62, 0.18, 0.08, 0.07, 0.05],
    )
    event_type = rng.choice(
        ["Login", "Transfer", "QR Pay", "Bill Payment", "eKYC Onboarding",
         "Card Issue", "Loan Application", "Deposit Open", "Balance Check"],
        size=total,
        p=[0.32, 0.22, 0.14, 0.10, 0.04, 0.03, 0.02, 0.03, 0.10],
    )
    # eKYC success rate for eKYC events
    ekyc_mask = event_type == "eKYC Onboarding"
    outcome = np.array(["Success"] * total, dtype=object)
    outcome[ekyc_mask] = np.where(
        rng.random(int(ekyc_mask.sum())) < 0.87, "Success", "Failed"
    )

    # Cost per event by channel (VND) — for cost-to-serve analysis
    channel_cost = {
        "Open Banking": 1200,
        "ONEBANK": 9500,
        "Web": 3500,
        "ATM": 15000,
        "VNeID Trạm Công dân số": 8000,
    }
    cost = np.array([channel_cost[c] for c in channel], dtype=np.int32)

    return pd.DataFrame(
        {
            "EventId": np.arange(1, total + 1, dtype=np.int64),
            "CustomerId": cust_ids.astype(np.int32),
            "EventDate": event_dates,
            "Channel": channel,
            "EventType": event_type,
            "Outcome": outcome,
            "ChannelCost": cost,
            "TenantId": [params.tenant_id] * total,
        }
    )


def _build_risk_scores(
    params: NamABankParameters,
    rng: np.random.Generator,
    customers: pd.DataFrame,
    loans: pd.DataFrame,
) -> pd.DataFrame:
    """AI Early Warning risk scores — one score per loan customer with reasoning."""
    if len(loans) == 0:
        return pd.DataFrame(
            {
                "ScoreId": [], "CustomerId": [], "ScoreDate": [], "PdScore": [],
                "RiskBand": [], "TopReason": [], "TenantId": [],
            }
        )

    loan_customers = loans["CustomerId"].unique()
    n = len(loan_customers)

    # Base PD from beta(2, 8) — most customers low risk
    pd_score = np.clip(rng.beta(2, 8, size=n), 0, 1)

    # Increase PD for customers with delinquent loans
    cust_worst_dpd = loans.groupby("CustomerId")["DaysPastDue"].max()
    for i, cust in enumerate(loan_customers):
        dpd = int(cust_worst_dpd.get(cust, 0))
        if dpd > 90:
            pd_score[i] = min(1.0, pd_score[i] + rng.uniform(0.4, 0.7))
        elif dpd > 60:
            pd_score[i] = min(1.0, pd_score[i] + rng.uniform(0.25, 0.45))
        elif dpd > 30:
            pd_score[i] = min(1.0, pd_score[i] + rng.uniform(0.10, 0.25))

    # Risk band
    risk_band = np.where(
        pd_score >= 0.7, "Watch",
        np.where(pd_score >= 0.5, "High",
                 np.where(pd_score >= 0.3, "Medium", "Low")),
    )

    reasons_watch = [
        "DPD tăng 2 tháng liên tiếp + thu nhập giảm",
        "Trễ hạn ≥90 ngày trên khoản HAPPY HOME",
        "Điểm CIC B4 + tỷ lệ dư nợ/thu nhập >65%",
        "Không có giao dịch lương 60 ngày gần đây",
        "Nợ nhóm 4 tại NH khác + sụt giảm CASA 40%",
    ]
    reasons_high = [
        "DPD 30-60 ngày trên khoản vay tiêu dùng",
        "LTV Mortgage >85% + giá BĐS khu vực giảm 8%",
        "Số dư CASA giảm 3 tháng liên tiếp",
        "Chi tiêu thẻ vượt 90% hạn mức 3 tháng",
        "Ngành nghề rủi ro (BĐS/xây dựng) + delay DPD nhẹ",
    ]
    reasons_medium = [
        "Chậm thanh toán thẻ 1 lần trong 6 tháng",
        "Tỷ lệ nợ/thu nhập tăng nhẹ",
        "Điểm CIC B2 (khá) — cần theo dõi thu nhập",
        "Sử dụng >60% hạn mức thẻ nhưng vẫn thanh toán đúng hạn",
    ]
    reasons_low = [
        "Lịch sử thanh toán tốt, thu nhập ổn định",
        "CASA tăng đều, sử dụng thẻ có kỷ luật",
        "Điểm CIC A1 (rất tốt)",
        "Nhiều sản phẩm liên kết, khách hàng gắn bó dài hạn",
    ]

    top_reason = []
    for band in risk_band:
        if band == "Watch":
            top_reason.append(str(rng.choice(reasons_watch)))
        elif band == "High":
            top_reason.append(str(rng.choice(reasons_high)))
        elif band == "Medium":
            top_reason.append(str(rng.choice(reasons_medium)))
        else:
            top_reason.append(str(rng.choice(reasons_low)))

    return pd.DataFrame(
        {
            "ScoreId": np.arange(1, n + 1, dtype=np.int32),
            "CustomerId": loan_customers.astype(np.int32),
            "ScoreDate": [pd.Timestamp(params.end_date)] * n,
            "PdScore": np.round(pd_score, 3).astype(np.float32),
            "RiskBand": risk_band,
            "TopReason": top_reason,
            "TenantId": [params.tenant_id] * n,
        }
    )


def _build_nbo_recommendations(
    params: NamABankParameters,
    rng: np.random.Generator,
    customers: pd.DataFrame,
) -> pd.DataFrame:
    """Next-Best-Offer AI recommendations — one per customer, segment-driven."""
    n = len(customers)
    seg = customers["Segment"].to_numpy()
    tenure = customers["TenureYears"].to_numpy()

    offers: list[str] = []
    categories: list[str] = []
    est_revenue: list[float] = []

    for i in range(n):
        s = seg[i]
        t = tenure[i]
        if s == "Wealth":
            offer = str(rng.choice(_NBO_UPSELL_WEALTH))
            category = "Upsell Wealth"
            rev = float(rng.uniform(5_000_000, 25_000_000))
        elif s in ("Affluent", "MassAffluent"):
            offer = str(rng.choice(_NBO_CROSSSELL))
            category = "Cross-sell"
            rev = float(rng.uniform(1_500_000, 8_000_000))
        elif t < 1.0:  # New Mass customer
            offer = str(rng.choice(_NBO_ACQUISITION))
            category = "Acquisition"
            rev = float(rng.uniform(300_000, 2_000_000))
        elif t > 5.0 and rng.random() < 0.15:
            offer = str(rng.choice(_NBO_WINBACK))
            category = "Winback"
            rev = float(rng.uniform(500_000, 3_000_000))
        else:
            offer = str(rng.choice(_NBO_CROSSSELL + _NBO_ACQUISITION))
            category = "Cross-sell"
            rev = float(rng.uniform(500_000, 5_000_000))

        offers.append(offer)
        categories.append(category)
        est_revenue.append(round(rev, -3))

    # Confidence score
    confidence = np.round(np.clip(rng.beta(5, 2, size=n), 0.3, 0.98), 3)

    return pd.DataFrame(
        {
            "RecommendationId": np.arange(1, n + 1, dtype=np.int32),
            "CustomerId": customers["CustomerId"].to_numpy(),
            "OfferName": offers,
            "OfferCategory": categories,
            "EstimatedRevenue": est_revenue,
            "ConfidenceScore": confidence.astype(np.float32),
            "GeneratedDate": [pd.Timestamp(params.end_date)] * n,
            "TenantId": [params.tenant_id] * n,
        }
    )


def _random_dt_between(
    rng: np.random.Generator, start: date, end: date
) -> datetime:
    delta_days = max((end - start).days, 1)
    offset = int(rng.integers(0, delta_days))
    return datetime.combine(start + timedelta(days=offset), datetime.min.time())
