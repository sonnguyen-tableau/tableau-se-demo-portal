"""VACS (Vietnam Airlines Caterers) in-flight catering QUALITY / COMPLAINT
synthetic data generator.

Powers the VACS Executive QA demo for the Quality Assurance / Operations
leadership — 6 dashboards:
  Tổng quan Chất lượng & Khiếu nại · Phân tích Khiếu nại theo Loại (Pareto) ·
  Giám sát Dị vật · Hiệu suất Giao suất ăn (COF) · Cam kết Dịch vụ & Phạt (SLA) ·
  Bảng điểm theo Hãng & Đường bay.

Contract: emits a ``VacsDataset`` whose column names match
``packages/factory-schema/airline-catering.schema.json``.

Company facts (grounded by web research 2026-07-09):
- Vietnam Airlines Caterers (VACS) — 100% subsidiary of Vietnam Airlines
  (founded 1993 as a JV with Cathay Pacific Catering; NOT a SATS JV).
- Scale: ~10M meals/year for 58+ airlines out of Tân Sơn Nhất (SGN); also Phú
  Quốc (PQC); new Long Thành (LTA) facility coming. ≈ 27,000 meals/day blended.
- Brand blue #006D99 / gold #D09A2D (lotus roundel).

Data model — a clean star schema so complaint-rate (PPM), Complaint Index and
COF figures compute across facts via Tableau relationships:
  Dimensions : Airlines · Routes
  Facts      : Complaints · Compliments · SLARecords · MealVolume
Everything relates through the Airlines hub (on AirlineName); the three
feedback facts also relate to Routes (on Route). MealVolume carries the meal /
flight counts that normalize complaints into PPM and drive the COF board.

Timeframe: full 2025 (last year) + 2026 YTD (Jan–Jun, current year) so YoY
Complaint Index and month-over-month COF have signal.

100% Vietnamese labels. Penalties in VND (+ USD for foreign carriers).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker

# ─── Airlines (real VACS customers) ─────────────────────────────────────────
# (name, IATA code, region_vn, country_vn, meal_share_weight, contract_tier)
# Vietnam Airlines dominates (VACS is its in-house caterer). Weights are the
# share of total meal volume; normalized at build time.
_AIRLINES: tuple[tuple, ...] = (
    ("Vietnam Airlines",   "VN", "Nội địa & Quốc tế", "Việt Nam",      44.0, "Chiến lược"),
    ("Pacific Airlines",   "BL", "Nội địa",            "Việt Nam",       6.0, "Chiến lược"),
    ("VASCO",              "0V", "Nội địa",            "Việt Nam",       2.0, "Tiêu chuẩn"),
    ("Korean Air",         "KE", "Đông Bắc Á",         "Hàn Quốc",       5.0, "Ưu tiên"),
    ("Asiana Airlines",    "OZ", "Đông Bắc Á",         "Hàn Quốc",       3.0, "Ưu tiên"),
    ("Cathay Pacific",     "CX", "Đông Bắc Á",         "Hồng Kông",      4.0, "Ưu tiên"),
    ("EVA Air",            "BR", "Đông Bắc Á",         "Đài Loan",       3.0, "Ưu tiên"),
    ("China Airlines",     "CI", "Đông Bắc Á",         "Đài Loan",       2.5, "Tiêu chuẩn"),
    ("Japan Airlines",     "JL", "Đông Bắc Á",         "Nhật Bản",       3.0, "Ưu tiên"),
    ("All Nippon Airways", "NH", "Đông Bắc Á",         "Nhật Bản",       3.0, "Ưu tiên"),
    ("Singapore Airlines", "SQ", "Đông Nam Á",         "Singapore",      3.0, "Ưu tiên"),
    ("Qatar Airways",      "QR", "Trung Đông",         "Qatar",          3.0, "Ưu tiên"),
    ("Emirates",           "EK", "Trung Đông",         "UAE",            2.5, "Ưu tiên"),
    ("Turkish Airlines",   "TK", "Châu Âu",            "Thổ Nhĩ Kỳ",     2.0, "Tiêu chuẩn"),
    ("Cebu Pacific",       "5J", "Đông Nam Á",         "Philippines",    2.0, "Tiêu chuẩn"),
    ("Philippine Airlines","PR", "Đông Nam Á",         "Philippines",    1.5, "Tiêu chuẩn"),
    ("China Southern",     "CZ", "Đông Bắc Á",         "Trung Quốc",     2.0, "Tiêu chuẩn"),
    ("Air France",         "AF", "Châu Âu",            "Pháp",           1.5, "Tiêu chuẩn"),
    ("Starlux Airlines",   "JX", "Đông Bắc Á",         "Đài Loan",       1.0, "Tiêu chuẩn"),
    ("United Airlines",    "UA", "Bắc Mỹ",             "Hoa Kỳ",         1.5, "Tiêu chuẩn"),
)
_AIRLINE_KEYS = ("name", "code", "region", "country", "weight", "tier")

# Foreign carriers pay penalties in USD; Vietnamese carriers in VND.
_VN_CARRIERS = {"Vietnam Airlines", "Pacific Airlines", "VASCO"}

# ─── Routes (SGN/PQC outbound) ──────────────────────────────────────────────
# (route, origin, dest_code, dest_city_vn, dest_country_vn, haul_type, lat, lon, vol_weight)
_ROUTES: tuple[tuple, ...] = (
    ("SGN-HAN", "SGN", "HAN", "Hà Nội",        "Việt Nam",    "Nội địa",       21.2212, 105.8072, 16.0),
    ("SGN-DAD", "SGN", "DAD", "Đà Nẵng",       "Việt Nam",    "Nội địa",       16.0439, 108.1994,  9.0),
    ("SGN-HPH", "SGN", "HPH", "Hải Phòng",     "Việt Nam",    "Nội địa",       20.8194, 106.7247,  3.5),
    ("SGN-CXR", "SGN", "CXR", "Nha Trang",     "Việt Nam",    "Nội địa",       11.9982, 109.2193,  3.5),
    ("SGN-PQC", "SGN", "PQC", "Phú Quốc",      "Việt Nam",    "Nội địa",       10.1698, 103.9931,  3.0),
    ("SGN-ICN", "SGN", "ICN", "Seoul",         "Hàn Quốc",    "Đông Bắc Á",    37.4602, 126.4407,  7.0),
    ("SGN-NRT", "SGN", "NRT", "Tokyo",         "Nhật Bản",    "Đông Bắc Á",    35.7719, 140.3929,  5.0),
    ("SGN-HND", "SGN", "HND", "Tokyo Haneda",  "Nhật Bản",    "Đông Bắc Á",    35.5494, 139.7798,  3.0),
    ("SGN-TPE", "SGN", "TPE", "Đài Bắc",       "Đài Loan",    "Đông Bắc Á",    25.0777, 121.2328,  5.0),
    ("SGN-HKG", "SGN", "HKG", "Hồng Kông",     "Hồng Kông",   "Đông Bắc Á",    22.3080, 113.9185,  4.5),
    ("SGN-PVG", "SGN", "PVG", "Thượng Hải",    "Trung Quốc",  "Đông Bắc Á",    31.1443, 121.8083,  3.0),
    ("SGN-CAN", "SGN", "CAN", "Quảng Châu",    "Trung Quốc",  "Đông Bắc Á",    23.3924, 113.2988,  3.0),
    ("SGN-SIN", "SGN", "SIN", "Singapore",     "Singapore",   "Đông Nam Á",     1.3644, 103.9915,  5.5),
    ("SGN-BKK", "SGN", "BKK", "Bangkok",       "Thái Lan",    "Đông Nam Á",    13.6900, 100.7501,  4.0),
    ("SGN-KUL", "SGN", "KUL", "Kuala Lumpur",  "Malaysia",    "Đông Nam Á",     2.7456, 101.7099,  3.0),
    ("SGN-MNL", "SGN", "MNL", "Manila",        "Philippines", "Đông Nam Á",    14.5086, 121.0197,  3.0),
    ("SGN-DOH", "SGN", "DOH", "Doha",          "Qatar",       "Trung Đông",    25.2731,  51.6081,  3.5),
    ("SGN-DXB", "SGN", "DXB", "Dubai",         "UAE",         "Trung Đông",    25.2532,  55.3657,  3.0),
    ("SGN-CDG", "SGN", "CDG", "Paris",         "Pháp",        "Châu Âu",       49.0097,   2.5479,  2.5),
    ("SGN-IST", "SGN", "IST", "Istanbul",      "Thổ Nhĩ Kỳ",  "Châu Âu",       41.2753,  28.7519,  2.0),
    ("SGN-SFO", "SGN", "SFO", "San Francisco", "Hoa Kỳ",      "Bắc Mỹ",        37.6213, 122.3790,  2.0),
    ("PQC-HAN", "PQC", "HAN", "Hà Nội",        "Việt Nam",    "Nội địa",       21.2212, 105.8072,  2.0),
)
_ROUTE_KEYS = ("route", "origin", "dest_code", "dest_city", "dest_country",
               "haul", "lat", "lon", "weight")

# ─── Complaint taxonomy (from client requirements doc) ──────────────────────
# Top-level category -> (weight, [(subcategory, weight), ...])
_CATEGORY_TREE: dict[str, tuple[float, tuple[tuple[str, float], ...]]] = {
    "Suất ăn": (0.55, (
        ("Chất lượng món ăn", 0.30),
        ("Quy cách suất ăn", 0.16),
        ("Số lượng suất ăn", 0.14),
        ("Trình bày món ăn", 0.13),
        ("Dị vật trong suất ăn", 0.19),
        ("Khác", 0.08),
    )),
    "Trang thiết bị": (0.13, (
        ("Thiếu thiết bị", 0.26),
        ("Cấp sai thiết bị", 0.20),
        ("Sắp xếp thiết bị", 0.16),
        ("Tình trạng thiết bị", 0.20),
        ("Vệ sinh thiết bị", 0.14),
        ("Khác", 0.04),
    )),
    "Đồ uống & Vật phẩm bổ sung": (0.08, (
        ("Thiếu nguồn cung", 0.55),
        ("Cấp sai nguồn cung", 0.45),
    )),
    "Xếp dỡ & Giao nhận": (0.21, (
        ("Chậm chuyến bay", 0.22),
        ("Chậm xếp tải", 0.34),
        ("Sai vị trí xếp tải", 0.22),
        ("Chậm dỡ tải", 0.22),
    )),
    "Khác": (0.025, (("Khác", 1.0),)),
    "Nghi ngờ ngộ độc thực phẩm": (0.005, (("Nghi ngờ ngộ độc thực phẩm", 1.0),)),
}

# Foreign-object types + relative frequency (research: Plastic > Hair > Insects
# > Glass/Chinaware ~ Metal, Moldy & Other rarer). Applied ONLY to the
# "Dị vật trong suất ăn" subcategory. Metal/Glass = low-freq, high-severity.
_FO_TYPES: tuple[tuple[str, float], ...] = (
    ("PLASTIC", 0.28),
    ("HAIR", 0.23),
    ("INSECTS", 0.17),
    ("OTHER F/O", 0.10),
    ("GLASS/CHINAWARE", 0.08),
    ("METAL", 0.06),
    ("MOLDY", 0.08),
)

# Root-cause groups (for the root-cause analysis panel).
_ROOT_CAUSE: tuple[tuple[str, float], ...] = (
    ("Thao tác nhân viên", 0.24),
    ("Quy trình sản xuất", 0.20),
    ("Nguyên vật liệu / Nhà cung cấp", 0.16),
    ("Vệ sinh an toàn thực phẩm", 0.12),
    ("Thiết bị / Dụng cụ", 0.10),
    ("Xếp dỡ & Giao nhận", 0.14),
    ("Khác", 0.04),
)

_CORRECTIVE = ("Đã khắc phục", "Đang thực hiện", "Chờ xác minh", "Chưa xử lý")
_STATUS = ("Đã đóng", "Đang xử lý")
_SEVERITY = ("Thấp", "Trung bình", "Cao", "Nghiêm trọng")

# Departments for staff-in-honour (compliments).
_DEPARTMENTS = (
    "Bếp nóng", "Bếp nguội", "Bếp bánh", "Xếp tải & Giao nhận",
    "Kiểm soát chất lượng", "Kho & Hậu cần", "Dịch vụ khách hàng", "Vệ sinh",
)

# SLA breach types + (weight, penalty_range_usd) — foreign carriers pay USD,
# VN carriers a VND equivalent. Penalty magnitude scales with breach severity.
_BREACH_TYPES: tuple[tuple[str, float, tuple[int, int]], ...] = (
    ("Chậm xếp tải",            0.34, (200, 1200)),
    ("Sai vị trí xếp tải",      0.20, (150, 800)),
    ("Chậm dỡ tải",             0.18, (150, 700)),
    ("Chậm chuyến do suất ăn",  0.14, (800, 5000)),
    ("Sai / thiếu đơn hàng",    0.14, (300, 1500)),
)

# ─── Monthly seasonality (share of annual volume) ───────────────────────────
# SGN flight seasonality: Tết (Jan–Feb) + summer peak (Jun–Aug) high. Complaint
# absolute counts follow volume; quality (PPM) stays roughly flat except a mild
# hot-season MOLDY / spoilage bump built into the FO logic.
_MONTH_VOL_WEIGHT = {
    1: 1.14, 2: 1.16, 3: 0.94, 4: 0.92, 5: 0.98, 6: 1.06,
    7: 1.12, 8: 1.10, 9: 0.90, 10: 0.92, 11: 0.96, 12: 1.06,
}
# Hot months → slightly higher foreign-object / spoilage risk multiplier.
_HOT_MONTHS = {5, 6, 7, 8}

_LAST_YEAR = 2025
_CUR_YEAR = 2026
_CUR_YEAR_END_MONTH = 6  # 2026 YTD through June (today = 2026-07-09)

# Annual meal volume (calibrated to ~10M meals/yr; 2026 growing ~+6%).
_MEALS_LY = 9_700_000
_MEALS_CY_H1 = 5_150_000  # Jan–Jun 2026
# Blended meals per flight (widebody long-haul higher; domestic lower). Used to
# derive Flights from MealUnits per row.
_MEALS_PER_FLIGHT = {
    "Nội địa": 150, "Đông Nam Á": 175, "Đông Bắc Á": 210,
    "Trung Đông": 300, "Châu Âu": 320, "Bắc Mỹ": 340, "Nội địa & Quốc tế": 190,
}
# Target complaint rate ≈ 55 complaints per million meals (good-quality caterer).
_TARGET_PPM = 55.0
# SLA reply target (working days) + on-time attainment target.
_SLA_REPLY_DAYS = 7


@dataclass
class VacsParameters:
    tenant_id: str
    seed: int = 42


@dataclass
class VacsDataset:
    airlines: pd.DataFrame
    routes: pd.DataFrame
    complaints: pd.DataFrame
    compliments: pd.DataFrame
    sla_records: pd.DataFrame
    meal_volume: pd.DataFrame
    monthly_summary: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Airlines": self.airlines,
            "Routes": self.routes,
            "Complaints": self.complaints,
            "Compliments": self.compliments,
            "SLARecords": self.sla_records,
            "MealVolume": self.meal_volume,
            "MonthlySummary": self.monthly_summary,
        }


def generate_vacs(params: VacsParameters) -> VacsDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker("vi_VN")
    Faker.seed(params.seed)

    airlines = _build_airlines(params)
    routes = _build_routes(params)
    meal_volume = _build_meal_volume(params, rng)
    complaints = _build_complaints(params, rng, fake, meal_volume)
    compliments = _build_compliments(params, rng, fake)
    sla_records = _build_sla_records(params, rng)
    monthly_summary = _build_monthly_summary(
        params, meal_volume, complaints, compliments, sla_records)

    return VacsDataset(
        airlines=airlines, routes=routes, complaints=complaints,
        compliments=compliments, sla_records=sla_records, meal_volume=meal_volume,
        monthly_summary=monthly_summary,
    )


# ─── Dimension builders ─────────────────────────────────────────────────────
def _airline_dicts() -> list[dict]:
    return [dict(zip(_AIRLINE_KEYS, a)) for a in _AIRLINES]


def _route_dicts() -> list[dict]:
    return [dict(zip(_ROUTE_KEYS, r)) for r in _ROUTES]


def _build_airlines(params: VacsParameters) -> pd.DataFrame:
    rows = []
    for i, a in enumerate(_airline_dicts(), 1):
        rows.append({
            "AirlineId": i,
            "AirlineName": a["name"],
            "AirlineCode": a["code"],
            "Region": a["region"],
            "Country": a["country"],
            "ContractTier": a["tier"],
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


def _build_routes(params: VacsParameters) -> pd.DataFrame:
    rows = []
    for i, r in enumerate(_route_dicts(), 1):
        rows.append({
            "RouteId": i,
            "Route": r["route"],
            "OriginAirport": r["origin"],
            "DestAirport": r["dest_code"],
            "DestCity": r["dest_city"],
            "DestCountry": r["dest_country"],
            "HaulType": r["haul"],
            "DestLat": r["lat"],
            "DestLon": r["lon"],
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── MealVolume (daily × airline × origin) — normalizes complaints into PPM ──
def _build_meal_volume(params: VacsParameters, rng) -> pd.DataFrame:
    airlines = _airline_dicts()
    aw = np.array([a["weight"] for a in airlines], float)
    aw = aw / aw.sum()

    # Days: full 2025 + 2026 Jan–Jun.
    days: list[date] = []
    d = date(_LAST_YEAR, 1, 1)
    while d <= date(_LAST_YEAR, 12, 31):
        days.append(d); d += timedelta(days=1)
    d = date(_CUR_YEAR, 1, 1)
    while d <= date(_CUR_YEAR, _CUR_YEAR_END_MONTH, 30 if _CUR_YEAR_END_MONTH in (4, 6, 9, 11) else 31):
        if d.month <= _CUR_YEAR_END_MONTH:
            days.append(d)
        d += timedelta(days=1)

    # Per-day total meals scaled by month seasonality, split by airline share.
    rows = []
    vid = 1
    ly_month_sum = sum(_MONTH_VOL_WEIGHT[m] * _days_in_month(_LAST_YEAR, m) for m in range(1, 13))
    cy_month_sum = sum(_MONTH_VOL_WEIGHT[m] * _days_in_month(_CUR_YEAR, m) for m in range(1, _CUR_YEAR_END_MONTH + 1))

    for day in days:
        yr = day.year
        annual = _MEALS_LY if yr == _LAST_YEAR else _MEALS_CY_H1
        msum = ly_month_sum if yr == _LAST_YEAR else cy_month_sum
        day_meals = annual * _MONTH_VOL_WEIGHT[day.month] / msum
        # weekday effect: slightly fewer on Tue/Wed
        day_meals *= (0.95 if day.weekday() in (1, 2) else 1.03)
        # split across airlines (integer allocation)
        alloc = rng.multinomial(int(day_meals), aw)
        for a, meals in zip(airlines, alloc):
            if meals <= 0:
                continue
            mpf = _MEALS_PER_FLIGHT.get(a["region"], 190)
            flights = max(1, int(round(meals / mpf)))
            # ~85% of an airline's uplift departs SGN, the rest PQC (domestic only)
            origin = "SGN" if (a["region"] != "Nội địa" or rng.random() < 0.85) else "PQC"
            rows.append({
                "VolumeId": vid,
                "Date": datetime.combine(day, datetime.min.time()),
                "DepMonth": datetime(yr, day.month, 1),
                "Year": yr,
                "AirlineName": a["name"],
                "AirlineCode": a["code"],
                "OriginAirport": origin,
                "MealUnits": int(meals),
                "Flights": flights,
                "TenantId": params.tenant_id,
            })
            vid += 1
    return pd.DataFrame(rows)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date(year, month, 1)).days


# ─── Complaints (the complaint-summary fact) ────────────────────────────────
def _build_complaints(params: VacsParameters, rng, fake, meal_volume) -> pd.DataFrame:
    airlines = _airline_dicts()
    routes = _route_dicts()
    aw = np.array([a["weight"] for a in airlines], float); aw /= aw.sum()
    rw = np.array([r["weight"] for r in routes], float); rw /= rw.sum()

    # Number of complaints per (year, month) from meal volume × target PPM,
    # with hot-month uplift and mild noise → realistic monthly counts.
    vol = meal_volume.groupby(["Year", meal_volume["DepMonth"].dt.month])["MealUnits"].sum()
    cat_names = list(_CATEGORY_TREE.keys())
    cat_w = np.array([_CATEGORY_TREE[c][0] for c in cat_names], float); cat_w /= cat_w.sum()

    rows = []
    cid = 1
    for (yr, mo), meals in vol.items():
        base = meals / 1_000_000 * _TARGET_PPM
        if mo in _HOT_MONTHS:
            base *= 1.12
        n = max(0, int(rng.poisson(base)))
        for _ in range(n):
            ai = int(rng.choice(len(airlines), p=aw))
            a = airlines[ai]
            ri = int(rng.choice(len(routes), p=rw))
            r = routes[ri]
            # category / subcategory
            cat = cat_names[int(rng.choice(len(cat_names), p=cat_w))]
            subs = _CATEGORY_TREE[cat][1]
            sw = np.array([s[1] for s in subs], float); sw /= sw.sum()
            sub = subs[int(rng.choice(len(subs), p=sw))][0]

            # foreign object type (only for the dị-vật subcategory)
            fo_type = ""
            if sub == "Dị vật trong suất ăn":
                fw = np.array([f[1] for f in _FO_TYPES], float)
                if mo in _HOT_MONTHS:  # summer → more mold / insects
                    fw = fw * np.array([1, 1, 1.4, 1, 1, 1, 1.8])
                fw /= fw.sum()
                fo_type = _FO_TYPES[int(rng.choice(len(_FO_TYPES), p=fw))][0]

            flight_delay = 1 if (cat == "Xếp dỡ & Giao nhận" and sub == "Chậm chuyến bay") else 0

            # severity: FO metal/glass + food-poisoning = high/critical
            if cat == "Nghi ngờ ngộ độc thực phẩm":
                sev = "Nghiêm trọng"
            elif fo_type in ("METAL", "GLASS/CHINAWARE"):
                sev = str(rng.choice(["Cao", "Nghiêm trọng"], p=[0.55, 0.45]))
            elif fo_type or sub in ("Chất lượng món ăn", "Chậm chuyến bay"):
                sev = str(rng.choice(_SEVERITY, p=[0.20, 0.45, 0.28, 0.07]))
            else:
                sev = str(rng.choice(_SEVERITY, p=[0.45, 0.42, 0.11, 0.02]))

            root = _ROOT_CAUSE[int(rng.choice(len(_ROOT_CAUSE),
                                              p=[x[1] for x in _ROOT_CAUSE]))][0]

            # dates
            dep = date(yr, mo, int(rng.integers(1, _days_in_month(yr, mo) + 1)))
            received = dep + timedelta(days=int(rng.integers(0, 4)))
            # reply time: ~92% within SLA (7 working days), tail late
            if rng.random() < 0.92:
                reply_days = int(rng.integers(1, _SLA_REPLY_DAYS + 1))
            else:
                reply_days = int(rng.integers(_SLA_REPLY_DAYS + 1, 22))
            # open cases (recent, current year) may not be replied yet. Store
            # RepliedDate as a text date ('' when open) and ReplyDays as int
            # (0 when open) so the Hyper extract has no NULL/NaT columns; the
            # open state is carried by WithinSLA='Chưa phản hồi' + Status.
            is_open = (yr == _CUR_YEAR and mo >= _CUR_YEAR_END_MONTH - 0 and rng.random() < 0.18)
            replied = None if is_open else received + timedelta(days=reply_days)
            within = "Chưa phản hồi" if is_open else ("Đúng hạn" if reply_days <= _SLA_REPLY_DAYS else "Trễ hạn")
            # _STATUS = ("Đã đóng", "Đang xử lý") — a mature QA op closes most
            # complaints; only a small tail is still in progress.
            status = "Đang xử lý" if is_open else str(rng.choice(_STATUS, p=[0.92, 0.08]))
            corrective = "Đang thực hiện" if is_open else str(
                rng.choice(_CORRECTIVE, p=[0.72, 0.14, 0.09, 0.05]))

            flight_no = f"{a['code']}{int(rng.integers(1, 999)):03d}"
            rows.append({
                "ComplaintId": cid,
                "DepMonth": datetime(yr, mo, 1),
                "Year": yr,
                "AirlineName": a["name"],
                "AirlineCode": a["code"],
                "Flight": flight_no,
                "Route": r["route"],
                "OriginAirport": r["origin"],
                "DestAirport": r["dest_code"],
                "DepDate": datetime.combine(dep, datetime.min.time()),
                "ReceivedDate": datetime.combine(received, datetime.min.time()),
                "RepliedDate": (replied.isoformat() if replied else ""),
                "ReplyDays": (reply_days if not is_open else 0),
                "SLATargetDays": _SLA_REPLY_DAYS,
                "WithinSLA": within,
                "Category": cat,
                "SubCategory": sub,
                "RootCauseGroup": root,
                "ForeignObjectType": fo_type,
                "FlightDelayFlag": flight_delay,
                "Severity": sev,
                "Status": status,
                "CorrectiveAction": corrective,
                "Summary": _complaint_summary(cat, sub, fo_type, r),
                "Remark": "",
                "TenantId": params.tenant_id,
            })
            cid += 1

    # Guarantee a tiny, deterministic set of suspected-food-poisoning events
    # (research: 0–2/year, each a red-flag investigation) so the executive
    # "sự cố nghiêm trọng" tile always has signal. 2 in LY, 1 in CY.
    fp_cat = "Nghi ngờ ngộ độc thực phẩm"
    if (pd.Series([r["Category"] for r in rows]) == fp_cat).sum() < 3:
        for yr, mo in ((_LAST_YEAR, 4), (_LAST_YEAR, 9), (_CUR_YEAR, 3)):
            ai = int(rng.choice(len(airlines), p=aw)); a = airlines[ai]
            ri = int(rng.choice(len(routes), p=rw)); r = routes[ri]
            dep = date(yr, mo, int(rng.integers(1, 27)))
            received = dep + timedelta(days=int(rng.integers(0, 2)))
            reply_days = int(rng.integers(2, _SLA_REPLY_DAYS + 1))
            rows.append({
                "ComplaintId": cid,
                "DepMonth": datetime(yr, mo, 1), "Year": yr,
                "AirlineName": a["name"], "AirlineCode": a["code"],
                "Flight": f"{a['code']}{int(rng.integers(1, 999)):03d}",
                "Route": r["route"], "OriginAirport": r["origin"],
                "DestAirport": r["dest_code"],
                "DepDate": datetime.combine(dep, datetime.min.time()),
                "ReceivedDate": datetime.combine(received, datetime.min.time()),
                "RepliedDate": (received + timedelta(days=reply_days)).isoformat(),
                "ReplyDays": reply_days, "SLATargetDays": _SLA_REPLY_DAYS,
                "WithinSLA": "Đúng hạn",
                "Category": fp_cat, "SubCategory": fp_cat,
                "RootCauseGroup": "Vệ sinh an toàn thực phẩm",
                "ForeignObjectType": "", "FlightDelayFlag": 0,
                "Severity": "Nghiêm trọng", "Status": "Đã đóng",
                "CorrectiveAction": "Đã khắc phục",
                "Summary": f"Nghi ngờ ngộ độc thực phẩm — chặng {r['route']} ({a['code']})",
                "Remark": "Đã điều tra, lấy mẫu xét nghiệm và báo cáo cơ quan chức năng",
                "TenantId": params.tenant_id,
            })
            cid += 1
    return pd.DataFrame(rows)


def _complaint_summary(cat: str, sub: str, fo_type: str, route: dict) -> str:
    fo_vn = {
        "HAIR": "tóc", "INSECTS": "côn trùng", "PLASTIC": "mảnh nhựa",
        "METAL": "mảnh kim loại", "GLASS/CHINAWARE": "mảnh thủy tinh/sành sứ",
        "OTHER F/O": "dị vật khác", "MOLDY": "dấu hiệu nấm mốc",
    }
    if fo_type:
        return f"Phát hiện {fo_vn.get(fo_type, 'dị vật')} trong suất ăn trên chặng {route['route']}"
    return f"{sub} — chặng {route['route']} ({route['dest_city']})"


# ─── MonthlySummary (pre-aggregated month × airline fact) ───────────────────
def _build_monthly_summary(params, meal_volume, complaints, compliments,
                           sla_records) -> pd.DataFrame:
    """Pre-aggregated month × airline grain so the Complaint-Index, COF and
    per-airline dashboards are SINGLE-TABLE (no cross-table relationship needed
    at render time). Carries the normalized quality numbers directly:
      Meals, Flights, Complaints, FOComplaints, Compliments, PenaltyUsd,
      OnTimeReplies, complaint index (PPM), and same-month PriorYearMeals +
      PriorYearComplaints for YoY without a cross-year LOD.
    """
    mv = meal_volume.copy()
    mv["mo"] = mv["DepMonth"].dt.month
    cp = complaints.copy()
    cp["mo"] = cp["DepMonth"].dt.month
    cm = compliments.copy()
    cm["mo"] = cm["DepMonth"].dt.month
    sl = sla_records.copy()
    sl["mo"] = sl["DepMonth"].dt.month

    meals = mv.groupby(["Year", "mo", "AirlineName", "AirlineCode"]).agg(
        Meals=("MealUnits", "sum"), Flights=("Flights", "sum")).reset_index()
    comp = cp.groupby(["Year", "mo", "AirlineName"]).agg(
        Complaints=("ComplaintId", "count"),
        FOComplaints=("ForeignObjectType", lambda s: (s != "").sum()),
        OnTimeReplies=("WithinSLA", lambda s: (s == "Đúng hạn").sum()),
        RepliedTotal=("WithinSLA", lambda s: s.isin(["Đúng hạn", "Trễ hạn"]).sum()),
    ).reset_index()
    cml = cm.groupby(["Year", "mo", "AirlineName"]).agg(
        Compliments=("ComplimentId", "count")).reset_index()
    pen = sl.groupby(["Year", "mo", "AirlineName"]).agg(
        Penalties=("SLAId", "count"), PenaltyUsd=("PenaltyUsd", "sum"),
        PenaltyVnd=("PenaltyVnd", "sum")).reset_index()

    df = meals.merge(comp, on=["Year", "mo", "AirlineName"], how="left")
    df = df.merge(cml, on=["Year", "mo", "AirlineName"], how="left")
    df = df.merge(pen, on=["Year", "mo", "AirlineName"], how="left")
    for c in ["Complaints", "FOComplaints", "OnTimeReplies", "RepliedTotal",
              "Compliments", "Penalties", "PenaltyUsd", "PenaltyVnd"]:
        df[c] = df[c].fillna(0).astype(int)

    # same-month prior-year meals & complaints (for YoY complaint index)
    prior = meals.rename(columns={"Meals": "PriorYearMeals"})[
        ["Year", "mo", "AirlineName", "PriorYearMeals"]].copy()
    prior["Year"] = prior["Year"] + 1
    priorc = comp.rename(columns={"Complaints": "PriorYearComplaints"})[
        ["Year", "mo", "AirlineName", "PriorYearComplaints"]].copy()
    priorc["Year"] = priorc["Year"] + 1
    df = df.merge(prior, on=["Year", "mo", "AirlineName"], how="left")
    df = df.merge(priorc, on=["Year", "mo", "AirlineName"], how="left")
    df["PriorYearMeals"] = df["PriorYearMeals"].fillna(0).astype(int)
    df["PriorYearComplaints"] = df["PriorYearComplaints"].fillna(0).astype(int)

    rows = []
    for i, r in enumerate(df.itertuples(index=False), 1):
        meals_v = int(r.Meals)
        idx_ppm = round(r.Complaints / meals_v * 1_000_000, 2) if meals_v else 0.0
        rows.append({
            "SummaryId": i,
            "Month": datetime(int(r.Year), int(r.mo), 1),
            "Year": int(r.Year),
            "MonthNum": int(r.mo),
            "AirlineName": r.AirlineName,
            "AirlineCode": r.AirlineCode,
            "Meals": meals_v,
            "Flights": int(r.Flights),
            "Complaints": int(r.Complaints),
            "FOComplaints": int(r.FOComplaints),
            "Compliments": int(r.Compliments),
            "Penalties": int(r.Penalties),
            "PenaltyUsd": int(r.PenaltyUsd),
            "PenaltyVnd": int(r.PenaltyVnd),
            "OnTimeReplies": int(r.OnTimeReplies),
            "RepliedTotal": int(r.RepliedTotal),
            "ComplaintIndexPpm": idx_ppm,
            "PriorYearMeals": int(r.PriorYearMeals),
            "PriorYearComplaints": int(r.PriorYearComplaints),
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── Compliments (staff-in-honour records) ──────────────────────────────────
def _build_compliments(params: VacsParameters, rng, fake) -> pd.DataFrame:
    airlines = _airline_dicts()
    routes = _route_dicts()
    aw = np.array([a["weight"] for a in airlines], float); aw /= aw.sum()
    rw = np.array([r["weight"] for r in routes], float); rw /= rw.sum()

    # ~200 compliments across the timeframe, weighted toward premium carriers.
    n = 210
    tmpl = [
        "Khen ngợi suất ăn ngon và trình bày đẹp trên chặng {route}",
        "Cảm ơn bộ phận {dept} phục vụ tận tâm, xử lý yêu cầu đặc biệt kịp thời",
        "Hãng đánh giá cao chất lượng suất ăn hạng Thương gia chặng {route}",
        "Ghi nhận suất ăn đặc biệt (Halal/chay) chuẩn xác, đúng yêu cầu",
        "Khen ngợi phản hồi nhanh và thái độ chuyên nghiệp của {dept}",
    ]
    rows = []
    for i in range(1, n + 1):
        a = airlines[int(rng.choice(len(airlines), p=aw))]
        r = routes[int(rng.choice(len(routes), p=rw))]
        yr = int(rng.choice([_LAST_YEAR, _CUR_YEAR], p=[0.62, 0.38]))
        max_mo = 12 if yr == _LAST_YEAR else _CUR_YEAR_END_MONTH
        mo = int(rng.integers(1, max_mo + 1))
        dep = date(yr, mo, int(rng.integers(1, _days_in_month(yr, mo) + 1)))
        dept = str(rng.choice(_DEPARTMENTS))
        summary = str(rng.choice(tmpl)).format(route=r["route"], dept=dept)
        rows.append({
            "ComplimentId": i,
            "DepMonth": datetime(yr, mo, 1),
            "Year": yr,
            "AirlineName": a["name"],
            "AirlineCode": a["code"],
            "Flight": f"{a['code']}{int(rng.integers(1, 999)):03d}",
            "Route": r["route"],
            "DepDate": datetime.combine(dep, datetime.min.time()),
            "StaffInHonour": fake.name(),
            "Department": dept,
            "Summary": summary,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── SLARecords (breach + penalty ledger) ───────────────────────────────────
def _build_sla_records(params: VacsParameters, rng) -> pd.DataFrame:
    airlines = _airline_dicts()
    routes = _route_dicts()
    aw = np.array([a["weight"] for a in airlines], float); aw /= aw.sum()
    rw = np.array([r["weight"] for r in routes], float); rw /= rw.sum()
    bw = np.array([b[1] for b in _BREACH_TYPES], float); bw /= bw.sum()

    # ~260 breach events across the timeframe (on-time loading ~98.5% → a small
    # but meaningful breach tail so the penalty scorecard has signal).
    n = 265
    rows = []
    for i in range(1, n + 1):
        a = airlines[int(rng.choice(len(airlines), p=aw))]
        r = routes[int(rng.choice(len(routes), p=rw))]
        yr = int(rng.choice([_LAST_YEAR, _CUR_YEAR], p=[0.63, 0.37]))
        max_mo = 12 if yr == _LAST_YEAR else _CUR_YEAR_END_MONTH
        mo = int(rng.integers(1, max_mo + 1))
        dep = date(yr, mo, int(rng.integers(1, _days_in_month(yr, mo) + 1)))
        bi = int(rng.choice(len(_BREACH_TYPES), p=bw))
        breach, _, (lo, hi) = _BREACH_TYPES[bi]
        penalty_usd = int(rng.integers(lo, hi + 1))
        # tier discount: strategic partners smaller penalties
        if a["tier"] == "Chiến lược":
            penalty_usd = int(penalty_usd * 0.5)
        delay_min = int(rng.integers(15, 130)) if "Chậm" in breach else 0
        is_vn = a["name"] in _VN_CARRIERS
        penalty_vnd = int(penalty_usd * 25000)  # ≈ USD→VND
        status = str(rng.choice(["Đã xử phạt", "Đang khiếu nại", "Đã miễn giảm"],
                                p=[0.74, 0.16, 0.10]))
        rows.append({
            "SLAId": i,
            "DepMonth": datetime(yr, mo, 1),
            "Year": yr,
            "AirlineName": a["name"],
            "AirlineCode": a["code"],
            "Flight": f"{a['code']}{int(rng.integers(1, 999)):03d}",
            "Route": r["route"],
            "DepDate": datetime.combine(dep, datetime.min.time()),
            "BreachType": breach,
            "DelayMinutes": delay_min,
            "PenaltyUsd": (penalty_usd if not is_vn else 0),
            "PenaltyVnd": penalty_vnd,
            "Status": status,
            "Summary": f"{breach} — chặng {r['route']} ({a['code']})",
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)
