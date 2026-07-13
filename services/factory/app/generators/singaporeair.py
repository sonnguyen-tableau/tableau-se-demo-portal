"""Singapore Airlines (SIA) — "Network & Commercial Control Tower" synthetic
data generator.

Powers the Singapore Airlines executive demo: a commercial control tower for the
full-service flag carrier — revenue & yield, passenger load factor (PLF),
capacity (ASK/RPK), route & region performance, a destinations network map, and
cabin-class + KrisFlyer loyalty mix.

Three-page dashboard story (docs/dashboards/singapore-airlines.md):
  1. Network & Revenue Pulse   — headline KPIs + revenue/traffic monthly trend
  2. Route & Network Performance — region breakdown + destinations bubble map
  3. Customer & Loyalty        — cabin-class revenue mix + KrisFlyer growth

Contract: emits a ``SingaporeAirDataset`` whose column names match
``packages/factory-schema/airline-passenger.schema.json``.

Six tables (pre-aggregated so every dashboard sheet is single-table — the VACS/
VNPT extract-workbook technique):
  - monthly_performance : month grain — revenue, pax, PLF, ASK/RPK, yield,
                          cargo, KrisFlyer members, on-time performance, + prior
                          -year same-month values for clean YoY.
  - region_performance  : 6 regions × snapshot — revenue, pax, PLF, yield,
                          capacity share, YoY growth (Route/Network page).
  - destinations        : ~28 SIA destinations with real lat/lon — pax, revenue,
                          PLF, load rank (for the custom-lat/lon bubble map).
  - cabin_class         : 5 cabins — revenue, pax, revenue share, yield index,
                          seat share, load factor (Customer page).
  - loyalty_krisflyer   : month grain — total members, net adds, tier mix
                          (base/silver/gold/PPS), redemptions, ancillary rev.
  - metric_dictionary   : one row per metric — definition, unit, source,
                          cadence, favorable direction (powers "explain metric").

DATA POLICY: 100% synthetic (``MockData=1``), calibrated to SIA's published
FY2024/25 GROUP figures (±jitter). Money in SGD. English labels throughout.

Calibration anchors (web research 2026-07-13, real published numbers):
- Group revenue FY24/25 ≈ S$19,539.8M (+2.8%); FY23/24 S$19,012.7M.
- Group PLF 86.6% (FY24/25) vs 88.0% (FY23/24). Pax carried 39.4M (+8.1%).
- Group pax yield ≈ 10.3 cents/RPK (−5.5% YoY — a real "insight" hook).
- Mainline ASK 139,651.6M (+10.6%), RPK 120,212.8M (+9.3%), PLF 86.1%.
- Cargo load factor 56.1% (+1.6pt), cargo revenue S$2.23B.
- KrisFlyer 10M members (Mar 2025), ~2M/yr net adds from 8M (Jan 2024).
- Hub Changi (SIN). Star Alliance. Cabins: Suites/First/Business/PremEcon/Economy.
- NOTE net profit FY24/25 inflated by ~S$1.1B one-off Air India merger gain;
  operating profit actually FELL 37% — surfaced as a demo insight, not "up".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

# ─── Timeframe: full FY23/24 + FY24/25 as calendar 2024 + 2025 (24 months) ──
# Kept on a calendar-month grain (Jan-2024 .. Dec-2025) so YoY is a clean
# 12-vs-12 comparison; "as-of" the 2025 close.
_LAST_YEAR = 2024
_CUR_YEAR = 2025

# Annual GROUP revenue anchors (SGD). 19,012.7M → 19,539.8M.
_REVENUE_LY = 19_012.7e6
_REVENUE_CY = 19_539.8e6
# Group passengers carried (annual). ~36.4M → 39.4M.
_PAX_LY = 36_400_000
_PAX_CY = 39_400_000
# Group passenger load factor (%). 88.0 → 86.6 (slight softening).
_PLF_LY = 88.0
_PLF_CY = 86.6
# Group passenger yield (cents/RPK). ~10.9 → 10.3 (declining — insight hook).
_YIELD_LY = 10.9
_YIELD_CY = 10.3
# Mainline capacity anchors (ASK/RPK, million seat-km) — grow ~10% YoY.
_ASK_LY = 126_300.0
_ASK_CY = 139_651.6
_RPK_LY = 110_000.0
_RPK_CY = 120_212.8
# Cargo load factor (%) and revenue (SGD).
_CARGO_LF_LY = 54.5
_CARGO_LF_CY = 56.1
# On-time performance (%) — synthesized (no consistent public group OTP).
_OTP_LY = 84.5
_OTP_CY = 85.8
# KrisFlyer members (end of month) ramp 8.0M → 10.0M across 24 months.
_KF_START = 8_000_000
_KF_END = 10_000_000

# ─── Monthly seasonality (share of annual — Jun–Aug & Dec peaks) ────────────
_SEASON = {
    1: 0.99, 2: 0.92, 3: 1.00, 4: 0.98, 5: 1.00, 6: 1.06,
    7: 1.08, 8: 1.07, 9: 0.98, 10: 1.00, 11: 0.98, 12: 1.06,
}

# ─── Regions (6) — weight = share of network revenue ─────────────────────────
# (region, revenue_share, base_plf, yield_index). Shares sum ≈ 1.0. East Asia +
# SE Asia are the volume core; Europe/Americas are premium long-haul (high PLF,
# high yield); SW Pacific = Australia/NZ; West Asia/Africa smaller.
_REGIONS: tuple[tuple, ...] = (
    # region,               rev_share, plf,  yield_idx, growth_yoy
    ("East Asia",            0.26,     87.5,  1.02,  6.5),
    ("South East Asia",      0.22,     86.0,  0.88,  7.2),
    ("Europe",               0.19,     88.5,  1.18,  9.0),
    ("South West Pacific",   0.15,     87.8,  1.10,  5.5),
    ("Americas",             0.11,     89.2,  1.25,  11.5),
    ("West Asia & Africa",   0.07,     84.5,  0.95,  4.0),
)

# ─── Destinations (real SIA-served airports w/ real lat/lon) ────────────────
# (city, iata, region, lat, lon, weight). Weight ≈ relative pax/revenue.
_DESTINATIONS: tuple[tuple, ...] = (
    ("Singapore (hub)",  "SIN", "South East Asia",     1.3644, 103.9915, 10.0),
    ("Bangkok",          "BKK", "South East Asia",    13.6900, 100.7501, 4.6),
    ("Kuala Lumpur",     "KUL", "South East Asia",     2.7456, 101.7099, 3.4),
    ("Jakarta",          "CGK", "South East Asia",    -6.1256, 106.6559, 3.6),
    ("Manila",           "MNL", "South East Asia",    14.5086, 121.0198, 2.8),
    ("Ho Chi Minh City", "SGN", "South East Asia",    10.8188, 106.6520, 2.4),
    ("Hong Kong",        "HKG", "East Asia",          22.3080, 113.9185, 5.2),
    ("Tokyo Haneda",     "HND", "East Asia",          35.5494, 139.7798, 4.8),
    ("Seoul Incheon",    "ICN", "East Asia",          37.4602, 126.4407, 3.9),
    ("Shanghai",         "PVG", "East Asia",          31.1443, 121.8083, 3.6),
    ("Taipei",           "TPE", "East Asia",          25.0777, 121.2328, 2.9),
    ("Beijing",          "PEK", "East Asia",          40.0799, 116.6031, 2.7),
    ("Mumbai",           "BOM", "West Asia & Africa", 19.0896,  72.8656, 2.6),
    ("Delhi",            "DEL", "West Asia & Africa", 28.5562,  77.1000, 2.8),
    ("Dubai",            "DXB", "West Asia & Africa", 25.2532,  55.3657, 2.2),
    ("Johannesburg",     "JNB", "West Asia & Africa",-26.1392,  28.2460, 1.3),
    ("London Heathrow",  "LHR", "Europe",             51.4700,  -0.4543, 5.4),
    ("Frankfurt",        "FRA", "Europe",             50.0379,   8.5622, 3.4),
    ("Paris CDG",        "CDG", "Europe",             49.0097,   2.5479, 3.1),
    ("Zurich",           "ZRH", "Europe",             47.4647,   8.5492, 2.0),
    ("Amsterdam",        "AMS", "Europe",             52.3105,   4.7683, 2.2),
    ("Sydney",           "SYD", "South West Pacific",-33.9399, 151.1753, 4.2),
    ("Melbourne",        "MEL", "South West Pacific",-37.6690, 144.8410, 3.6),
    ("Auckland",         "AKL", "South West Pacific",-37.0082, 174.7850, 2.1),
    ("Perth",            "PER", "South West Pacific",-31.9385, 115.9672, 2.3),
    ("New York JFK",     "JFK", "Americas",           40.6413, -73.7781, 3.4),
    ("Los Angeles",      "LAX", "Americas",           33.9416,-118.4085, 3.1),
    ("San Francisco",    "SFO", "Americas",           37.6213,-122.3790, 2.9),
)
_DEST_KEYS = ("city", "iata", "region", "lat", "lon", "weight")

# ─── Cabin classes (5) — revenue mix + yield index (premium punches above) ──
# (cabin, rev_share, seat_share, yield_index, plf). Premium cabins ≈ 45% of
# passenger revenue from ~23% of seats.
_CABINS: tuple[tuple, ...] = (
    # cabin,             rev_share, seat_share, yield_idx, plf
    ("Suites",            0.06,     0.01,      9.5,   82.0),
    ("First",             0.05,     0.02,      6.8,   80.5),
    ("Business",          0.30,     0.14,      3.2,   85.5),
    ("Premium Economy",   0.11,     0.09,      1.7,   86.5),
    ("Economy",           0.48,     0.74,      1.0,   88.5),
)
_CABIN_KEYS = ("cabin", "rev_share", "seat_share", "yield_idx", "plf")


@dataclass
class SingaporeAirParameters:
    tenant_id: str = "singapore-airlines"
    seed: int = 42


@dataclass
class SingaporeAirDataset:
    monthly_performance: pd.DataFrame
    region_performance: pd.DataFrame
    destinations: pd.DataFrame
    cabin_class: pd.DataFrame
    loyalty_krisflyer: pd.DataFrame
    metric_dictionary: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "monthly_performance": self.monthly_performance,
            "region_performance": self.region_performance,
            "destinations": self.destinations,
            "cabin_class": self.cabin_class,
            "loyalty_krisflyer": self.loyalty_krisflyer,
            "metric_dictionary": self.metric_dictionary,
        }


def generate_singaporeair(params: SingaporeAirParameters) -> SingaporeAirDataset:
    rng = np.random.default_rng(params.seed)
    return SingaporeAirDataset(
        monthly_performance=_build_monthly(params, rng),
        region_performance=_build_regions(params, rng),
        destinations=_build_destinations(params, rng),
        cabin_class=_build_cabins(params, rng),
        loyalty_krisflyer=_build_loyalty(params, rng),
        metric_dictionary=_build_dictionary(params),
    )


# ─── helpers ────────────────────────────────────────────────────────────────
def _jit(rng, base: float, pct: float = 0.04) -> float:
    return base * (1.0 + rng.uniform(-pct, pct))


def _months() -> list[tuple[int, int]]:
    return [(_LAST_YEAR, m) for m in range(1, 13)] + [(_CUR_YEAR, m) for m in range(1, 13)]


# ─── monthly_performance (headline KPIs, month grain, YoY-ready) ────────────
def _build_monthly(params: SingaporeAirParameters, rng) -> pd.DataFrame:
    months = _months()
    wsum = sum(_SEASON.values())
    rows = []
    hist_rev, hist_pax, hist_plf, hist_yield = [], [], [], []
    for i, (yr, mo) in enumerate(months):
        annual_rev = _REVENUE_LY if yr == _LAST_YEAR else _REVENUE_CY
        annual_pax = _PAX_LY if yr == _LAST_YEAR else _PAX_CY
        revenue = int(_jit(rng, annual_rev * _SEASON[mo] / wsum, 0.03))
        pax = int(_jit(rng, annual_pax * _SEASON[mo] / wsum, 0.03))
        plf_base = _PLF_LY if yr == _LAST_YEAR else _PLF_CY
        # seasonal PLF swing: peaks fuller
        plf = round(min(92.0, _jit(rng, plf_base + (_SEASON[mo] - 1.0) * 12, 0.012)), 1)
        yld = round(_jit(rng, _YIELD_LY if yr == _LAST_YEAR else _YIELD_CY, 0.02), 2)
        ask = int(_jit(rng, (_ASK_LY if yr == _LAST_YEAR else _ASK_CY) * _SEASON[mo] / wsum, 0.02) * 1e6)
        rpk = int(ask * plf / 100.0)
        cargo_lf = round(_jit(rng, _CARGO_LF_LY if yr == _LAST_YEAR else _CARGO_LF_CY, 0.03), 1)
        cargo_rev = int(_jit(rng, (2.13e9 if yr == _LAST_YEAR else 2.23e9) * _SEASON[mo] / wsum, 0.04))
        otp = round(_jit(rng, _OTP_LY if yr == _LAST_YEAR else _OTP_CY, 0.02), 1)
        # operating vs net: operating margin softening YoY (the real story)
        op_margin = _jit(rng, 0.135 if yr == _LAST_YEAR else 0.088, 0.05)
        op_profit = int(revenue * op_margin)
        rows.append({
            "PerfId": i + 1,
            "Month": datetime(yr, mo, 1),
            "Year": yr,
            "MonthNum": mo,
            "RevenueSgd": revenue,
            "OperatingProfitSgd": op_profit,
            "PassengersCarried": pax,
            "LoadFactorPct": plf,
            "YieldCentsPerRpk": yld,
            "AskMillion": round(ask / 1e6, 1),
            "RpkMillion": round(rpk / 1e6, 1),
            "CargoLoadFactorPct": cargo_lf,
            "CargoRevenueSgd": cargo_rev,
            "OnTimePerformancePct": otp,
            "TenantId": params.tenant_id,
        })
        hist_rev.append(revenue); hist_pax.append(pax); hist_plf.append(plf); hist_yield.append(yld)

    for i, r in enumerate(rows):
        if i >= 12:
            r["PriorYearRevenueSgd"] = hist_rev[i - 12]
            r["PriorYearPassengers"] = hist_pax[i - 12]
            r["PriorYearLoadFactorPct"] = hist_plf[i - 12]
            r["PriorYearYield"] = hist_yield[i - 12]
        else:
            r["PriorYearRevenueSgd"] = 0
            r["PriorYearPassengers"] = 0
            r["PriorYearLoadFactorPct"] = 0.0
            r["PriorYearYield"] = 0.0
    return pd.DataFrame(rows)


# ─── region_performance (snapshot for Route/Network page) ───────────────────
def _build_regions(params: SingaporeAirParameters, rng) -> pd.DataFrame:
    rows = []
    for i, (region, share, plf, yidx, growth) in enumerate(_REGIONS, 1):
        rev = int(_jit(rng, _REVENUE_CY * share, 0.03))
        pax = int(_jit(rng, _PAX_CY * share, 0.04))
        rows.append({
            "RegionId": i,
            "Region": region,
            "RevenueSgd": rev,
            "PassengersCarried": pax,
            "LoadFactorPct": round(_jit(rng, plf, 0.01), 1),
            "YieldIndex": round(_jit(rng, yidx, 0.02), 2),
            "CapacitySharePct": round(share * 100, 1),
            "GrowthYoYPct": round(_jit(rng, growth, 0.10), 1),
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── destinations (bubble-map snapshot) ─────────────────────────────────────
def _build_destinations(params: SingaporeAirParameters, rng) -> pd.DataFrame:
    dests = [dict(zip(_DEST_KEYS, d)) for d in _DESTINATIONS]
    wsum = sum(d["weight"] for d in dests)
    rows = []
    for i, d in enumerate(dests, 1):
        share = d["weight"] / wsum
        pax = int(_jit(rng, _PAX_CY * share, 0.05))
        rev = int(_jit(rng, _REVENUE_CY * share, 0.05))
        # metro/long-haul premium destinations fuller; hub itself high throughput
        base_plf = 86.0 + (d["weight"] - 2.5) * 0.6
        plf = round(min(92.0, max(80.0, _jit(rng, base_plf, 0.02))), 1)
        rows.append({
            "DestId": i,
            "City": d["city"],
            "Iata": d["iata"],
            "Region": d["region"],
            "Lat": d["lat"],
            "Lon": d["lon"],
            "PassengersCarried": pax,
            "RevenueSgd": rev,
            "LoadFactorPct": plf,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── cabin_class (revenue mix for Customer page) ────────────────────────────
def _build_cabins(params: SingaporeAirParameters, rng) -> pd.DataFrame:
    cabins = [dict(zip(_CABIN_KEYS, c)) for c in _CABINS]
    total_pax_rev = _REVENUE_CY * 0.885  # ~88.5% of group revenue is passenger
    rows = []
    for i, c in enumerate(cabins, 1):
        rev = int(_jit(rng, total_pax_rev * c["rev_share"], 0.03))
        # pax in cabin ≈ seat_share weighted by plf, scaled to group pax
        pax = int(_jit(rng, _PAX_CY * c["seat_share"] * (c["plf"] / 87.0), 0.04))
        rows.append({
            "CabinId": i,
            "CabinClass": c["cabin"],
            "RevenueSgd": rev,
            "PassengersCarried": pax,
            "RevenueSharePct": round(c["rev_share"] * 100, 1),
            "SeatSharePct": round(c["seat_share"] * 100, 1),
            "YieldIndex": round(_jit(rng, c["yield_idx"], 0.02), 2),
            "LoadFactorPct": round(_jit(rng, c["plf"], 0.01), 1),
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── loyalty_krisflyer (month grain) ────────────────────────────────────────
def _build_loyalty(params: SingaporeAirParameters, rng) -> pd.DataFrame:
    months = _months()
    n = len(months)
    # tier mix (share of members): base / silver / gold / PPS
    tier_share = (0.72, 0.16, 0.10, 0.02)
    rows = []
    prev = None
    for i, (yr, mo) in enumerate(months):
        frac = i / (n - 1)
        members = int(_jit(rng, _KF_START + (_KF_END - _KF_START) * frac, 0.004))
        net_adds = (members - prev) if prev is not None else int(members * 0.007)
        prev = members
        redemptions = int(_jit(rng, members * 0.018, 0.06))  # redemptions/month
        ancillary = int(_jit(rng, 92e6 * _SEASON[mo] / (sum(_SEASON.values()) / 12), 0.05))
        rows.append({
            "LoyaltyId": i + 1,
            "Month": datetime(yr, mo, 1),
            "Year": yr,
            "MonthNum": mo,
            "TotalMembers": members,
            "NetNewMembers": net_adds,
            "BaseMembers": int(members * tier_share[0]),
            "SilverMembers": int(members * tier_share[1]),
            "GoldMembers": int(members * tier_share[2]),
            "PpsMembers": int(members * tier_share[3]),
            "Redemptions": redemptions,
            "AncillaryRevenueSgd": ancillary,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


# ─── metric_dictionary ───────────────────────────────────────────────────────
def _build_dictionary(params: SingaporeAirParameters) -> pd.DataFrame:
    src = ("Singapore Airlines FY2024/25 results (calibrated)",
           "https://www.singaporeair.com/en_UK/sg/corporate/newsroom/")
    defs: tuple[tuple, ...] = (
        ("RevenueSgd", "Total group revenue", "SGD", "Monthly",
         "Total operating revenue of the group (passenger + cargo + other).", "up"),
        ("OperatingProfitSgd", "Operating profit", "SGD", "Monthly",
         "Operating profit before non-operating items and tax.", "up"),
        ("PassengersCarried", "Passengers carried", "pax", "Monthly",
         "Number of revenue passengers flown (group, incl. Scoot).", "up"),
        ("LoadFactorPct", "Passenger load factor (PLF)", "%", "Monthly",
         "Revenue passenger-km as a percentage of available seat-km.", "up"),
        ("YieldCentsPerRpk", "Passenger yield", "cents/RPK", "Monthly",
         "Passenger revenue per revenue passenger-kilometre.", "up"),
        ("AskMillion", "Available seat-km (ASK)", "million", "Monthly",
         "Total seat capacity flown (seats × distance).", "up"),
        ("RpkMillion", "Revenue passenger-km (RPK)", "million", "Monthly",
         "Passenger traffic (passengers × distance flown).", "up"),
        ("CargoLoadFactorPct", "Cargo load factor", "%", "Monthly",
         "Cargo load carried as a percentage of available cargo capacity.", "up"),
        ("CargoRevenueSgd", "Cargo revenue", "SGD", "Monthly",
         "Revenue from the cargo (freight) business.", "up"),
        ("OnTimePerformancePct", "On-time performance", "%", "Monthly",
         "Percentage of flights departing/arriving within 15 minutes of schedule.", "up"),
        ("YieldIndex", "Yield index", "index", "Snapshot",
         "Relative revenue per passenger vs Economy baseline (=1.0).", "up"),
        ("CapacitySharePct", "Capacity share", "%", "Snapshot",
         "Region's share of total network capacity.", "neutral"),
        ("GrowthYoYPct", "Growth YoY", "%", "Snapshot",
         "Year-over-year growth in the region's traffic/revenue.", "up"),
        ("TotalMembers", "KrisFlyer members", "members", "Monthly",
         "Total enrolled KrisFlyer loyalty members.", "up"),
        ("NetNewMembers", "Net new members", "members", "Monthly",
         "Net KrisFlyer members added in the month.", "up"),
        ("Redemptions", "Award redemptions", "count", "Monthly",
         "Number of KrisFlyer miles redemptions in the month.", "up"),
        ("AncillaryRevenueSgd", "Ancillary revenue", "SGD", "Monthly",
         "Non-ticket revenue (seats, baggage, upgrades, partners).", "up"),
        ("RevenueSharePct", "Revenue share", "%", "Snapshot",
         "Cabin class's share of total passenger revenue.", "neutral"),
        ("SeatSharePct", "Seat share", "%", "Snapshot",
         "Cabin class's share of total seat capacity.", "neutral"),
    )
    rows = []
    for i, (key, name, unit, cadence, definition, fav) in enumerate(defs, 1):
        rows.append({
            "DictId": i,
            "MetricKey": key,
            "MetricName": name,
            "Unit": unit,
            "Cadence": cadence,
            "Definition": definition,
            "FavorableDirection": fav,
            "Source": src[0],
            "SourceUrl": src[1],
            "MockData": 1,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)
