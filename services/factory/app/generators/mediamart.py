"""Retail / Consumer-Electronics (MediaMart) synthetic data generator.

Powers the MediaMart Control Tower demo: Customer 360 (Tier + ChurnRisk + NBO +
Loyalty), Supply Chain (multi-store inventory vs campaign target with realistic
OOS rate), and Vietnamese geography (8 cities with lat/long jitter).

Contract: emits a `MediaMartDataset` whose column names match
`packages/factory-schema/retail-mediamart.schema.json` exactly.

Seasonality calibrated for VN consumer electronics:
- Tet (Lunar New Year) spike — late Jan/early Feb
- Black Friday late November
- Back-to-school late August
- Summer dip in early July (post-Tet wallet recovery + heat)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

_CATALOG_PATH = Path(__file__).parent.parent / "data" / "mediamart-catalog.json"


# ─── Parameters ───────────────────────────────────────────────────────────────


# Tier → (mean churn risk, std). Diamond churns rarely; Standard often.
_TIER_CHURN_MEAN_STD: tuple[tuple[str, int, int], ...] = (
    ("Diamond", 12, 6),
    ("Platinum", 22, 8),
    ("Gold", 42, 12),
    ("Silver", 62, 14),
    ("Standard", 78, 12),
)

# Tier mix: realistic retail pyramid (most customers Standard/Silver).
_TIER_PROBS: tuple[float, ...] = (0.04, 0.10, 0.18, 0.30, 0.38)

# Vietnam cities: (city, province, lat, lon, store_weight).
# Weight drives how many stores end up here when n_stores >= len(cities).
_VN_CITIES: tuple[tuple[str, str, float, float, int], ...] = (
    ("Hanoi", "Hanoi", 21.0285, 105.8542, 6),
    ("Ho Chi Minh City", "TP HCM", 10.7769, 106.7009, 7),
    ("Da Nang", "Da Nang", 16.0544, 108.2022, 3),
    ("Hai Phong", "Hai Phong", 20.8449, 106.6881, 2),
    ("Can Tho", "Can Tho", 10.0452, 105.7469, 2),
    ("Nha Trang", "Khanh Hoa", 12.2388, 109.1967, 2),
    ("Hue", "Thua Thien Hue", 16.4637, 107.5909, 1),
    ("Vung Tau", "Ba Ria-Vung Tau", 10.346, 107.0843, 1),
    ("Bien Hoa", "Dong Nai", 10.9472, 106.8420, 1),
    ("Buon Ma Thuot", "Dak Lak", 12.6797, 108.0378, 1),
)

# Next-Best-Offer pool — realistic MediaMart promotion catalog.
_NBO_POOL: tuple[str, ...] = (
    "Premium TV Upgrade Bundle 15%",
    "iPhone 16 Pre-order + 5M trade-in",
    "Loyalty Points 2x Weekend",
    "Win-back Voucher 20%",
    "Home Appliance Bundle 12%",
    "VIP Concierge — Free Install + 24mo Warranty",
    "Free Shipping + Extended Warranty",
    "Audio Premium Upgrade Path",
    "Smartphone Trade-in 3M Bonus",
    "Laptop Refresh Program 10%",
    "Smart Home Starter Bundle",
    "Re-engagement Email Series",
)

# Category catalog — top consumer-electronics verticals in VN.
_CATEGORIES: tuple[str, ...] = (
    "Television",
    "Smartphone",
    "Laptop",
    "Audio",
    "Home Appliance",
    "Kitchen Appliance",
    "Camera",
    "Gaming",
    "Accessory",
)

# Brand pool per category (top brands MediaMart actually carries).
_BRAND_POOL: dict[str, tuple[str, ...]] = {
    "Television": ("Samsung", "LG", "Sony", "TCL", "Casper"),
    "Smartphone": ("Apple", "Samsung", "Xiaomi", "OPPO", "Vivo"),
    "Laptop": ("Apple", "Asus", "Dell", "HP", "Lenovo", "Acer"),
    "Audio": ("JBL", "Sony", "Bose", "Marshall", "Harman Kardon"),
    "Home Appliance": ("Panasonic", "Toshiba", "Electrolux", "LG", "Sharp"),
    "Kitchen Appliance": ("Bluestone", "Philips", "Sunhouse", "Lock&Lock"),
    "Camera": ("Canon", "Sony", "Nikon", "Fujifilm"),
    "Gaming": ("Sony", "Nintendo", "Microsoft", "Razer"),
    "Accessory": ("Anker", "Belkin", "Logitech", "Xiaomi", "Baseus"),
}


@dataclass
class MediaMartParameters:
    tenant_id: str
    start_date: date
    end_date: date
    n_customers: int = 4_500
    n_stores: int = 28
    n_products: int = 320
    base_daily_orders: int = 90
    yoy_growth_pct: float = 16.0
    # Fraction of (store × category) pairs that should be Out-Of-Stock at the
    # most recent snapshot. Tuned for demo: 0.25 gives ~kịch tính cảnh báo.
    oos_rate: float = 0.25
    seed: int = 42
    # Channel mix: in-store + online + app (VN retail is shifting to app).
    channel_mix: tuple[float, float, float] = (0.55, 0.25, 0.20)
    # Vietnamese consumer-electronics seasonality.
    market_events: tuple[tuple[date, float], ...] = field(
        default_factory=lambda: (
            (date(2024, 11, 29), 3.8),  # Black Friday 2024
            (date(2025, 1, 28), 4.2),   # Tet 2025 (peak)
            (date(2025, 8, 25), 1.8),   # Back-to-school 2025
            (date(2025, 11, 28), 4.0),  # Black Friday 2025
            (date(2026, 2, 17), 4.5),   # Tet 2026
        )
    )


@dataclass
class MediaMartDataset:
    customers: pd.DataFrame
    products: pd.DataFrame
    stores: pd.DataFrame
    channels: pd.DataFrame
    orders: pd.DataFrame
    order_lines: pd.DataFrame
    inventory: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Customers": self.customers,
            "Products": self.products,
            "Stores": self.stores,
            "Channels": self.channels,
            "Orders": self.orders,
            "OrderLines": self.order_lines,
            "Inventory": self.inventory,
        }


# ─── Generator ────────────────────────────────────────────────────────────────


def _load_catalog() -> dict[str, dict[str, list[str]]] | None:
    """Load scraped mediamart.vn catalog. Returns dict keyed by category_en →
    {"brands": [...], "sample_products": [...]} or None if file missing."""
    if not _CATALOG_PATH.exists():
        return None
    try:
        raw = json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None
    out: dict[str, dict[str, list[str]]] = {}
    for c in raw.get("categories", []):
        cat = c.get("category_en")
        if not isinstance(cat, str):
            continue
        out[cat] = {
            "brands": [b for b in c.get("brands", []) if isinstance(b, str)],
            "sample_products": [p for p in c.get("sample_products", []) if isinstance(p, str)],
        }
    return out or None


def generate_mediamart(params: MediaMartParameters) -> MediaMartDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker("vi_VN")
    Faker.seed(params.seed)
    catalog = _load_catalog()

    # ── Channels ──────────────────────────────────────────────────────────
    channels = pd.DataFrame(
        {
            "ChannelId": np.array([1, 2, 3], dtype=np.int32),
            "ChannelName": ["In-Store", "Online", "Mobile App"],
        }
    )

    # ── Stores ────────────────────────────────────────────────────────────
    stores = _build_stores(params, rng)

    # ── Products ──────────────────────────────────────────────────────────
    products = _build_products(params, rng, fake, catalog=catalog)

    # ── Customers ─────────────────────────────────────────────────────────
    customers = _build_customers(params, rng, fake, stores)

    # ── Orders & OrderLines (the fact tables) ─────────────────────────────
    orders, order_lines = _build_orders_and_lines(
        params, rng, customers=customers, products=products, stores=stores
    )

    # ── Inventory (current snapshot) ─────────────────────────────────────
    inventory = _build_inventory(params, rng, stores=stores, catalog=catalog)

    return MediaMartDataset(
        customers=customers,
        products=products,
        stores=stores,
        channels=channels,
        orders=orders,
        order_lines=order_lines,
        inventory=inventory,
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _build_stores(
    params: MediaMartParameters, rng: np.random.Generator
) -> pd.DataFrame:
    n = params.n_stores
    # Distribute stores across cities by weight, then jitter lat/long so multiple
    # stores in the same city don't overlap on the Symbol Map.
    weights = np.array([c[4] for c in _VN_CITIES], dtype=np.float64)
    probs = weights / weights.sum()
    city_idx = rng.choice(len(_VN_CITIES), size=n, p=probs)

    lat = np.empty(n, dtype=np.float64)
    lon = np.empty(n, dtype=np.float64)
    city_arr: list[str] = []
    province_arr: list[str] = []
    for i, idx in enumerate(city_idx):
        c = _VN_CITIES[idx]
        city_arr.append(c[0])
        province_arr.append(c[1])
        # Jitter ~1km radius — keeps stores in same city visually separated.
        lat[i] = c[2] + rng.normal(0, 0.012)
        lon[i] = c[3] + rng.normal(0, 0.012)

    return pd.DataFrame(
        {
            "StoreId": np.arange(1, n + 1, dtype=np.int32),
            "StoreName": [f"MediaMart {city_arr[i]} {i + 1:02d}" for i in range(n)],
            "City": city_arr,
            "Province": province_arr,
            "Region": [_vn_region(p) for p in province_arr],
            "Country": ["VN"] * n,
            "Type": rng.choice(
                ["Flagship", "Standard", "Compact"], size=n, p=[0.15, 0.65, 0.20]
            ),
            "Latitude": np.round(lat, 5),
            "Longitude": np.round(lon, 5),
            "OpenDate": [
                _random_dt_between(
                    rng,
                    params.start_date - timedelta(days=5 * 365),
                    params.start_date - timedelta(days=30),
                )
                for _ in range(n)
            ],
        }
    )


def _vn_region(province: str) -> str:
    """Coarse North/Central/South split for VN consumer-electronics analytics."""
    north = {
        "Hanoi",
        "Hai Phong",
        "Bac Ninh",
        "Quang Ninh",
        "Hai Duong",
        "Vinh Phuc",
        "Phu Tho",
    }
    central = {
        "Da Nang",
        "Thua Thien Hue",
        "Khanh Hoa",
        "Quang Nam",
        "Dak Lak",
    }
    if province in north:
        return "North"
    if province in central:
        return "Central"
    return "South"


def _build_products(
    params: MediaMartParameters,
    rng: np.random.Generator,
    fake: Faker,
    *,
    catalog: dict[str, dict[str, list[str]]] | None = None,
) -> pd.DataFrame:
    """Build product table. When `catalog` (scraped mediamart.vn data) is
    available, brands and product names come from real MediaMart inventory.
    Otherwise falls back to the hardcoded `_BRAND_POOL`."""
    n = params.n_products
    cat = rng.choice(
        list(_CATEGORIES),
        size=n,
        p=[0.16, 0.20, 0.14, 0.10, 0.12, 0.08, 0.04, 0.06, 0.10],
    )

    # Resolve brand pool per category — prefer scraped catalog.
    def _brands_for(c: str) -> tuple[str, ...]:
        if catalog and c in catalog and catalog[c]["brands"]:
            return tuple(catalog[c]["brands"])
        return _BRAND_POOL[c]

    brand = np.array(
        [rng.choice(_brands_for(c)) for c in cat], dtype=object
    )
    sub = rng.choice(["Entry", "Mid", "Premium", "Pro"], size=n, p=[0.35, 0.40, 0.20, 0.05])

    # Price scaled per category — TVs/laptops are pricier than accessories.
    cat_price_mean = {
        "Television": 15_000_000,
        "Smartphone": 12_000_000,
        "Laptop": 22_000_000,
        "Audio": 4_500_000,
        "Home Appliance": 8_000_000,
        "Kitchen Appliance": 2_500_000,
        "Camera": 18_000_000,
        "Gaming": 14_000_000,
        "Accessory": 800_000,
    }
    base_price = np.array([cat_price_mean[c] for c in cat], dtype=np.float64)
    # Lognormal jitter for realistic skew; "Pro" sub-category gets a multiplier.
    multiplier = np.where(sub == "Pro", 1.8, np.where(sub == "Premium", 1.35, np.where(sub == "Mid", 1.0, 0.65)))
    list_price = np.round(base_price * multiplier * rng.lognormal(0, 0.18, size=n), -3)
    # Cost margin 30-55% — VN consumer-electronics retail is razor-thin on
    # smartphones but healthy on accessories/home appliances.
    margin = rng.uniform(0.30, 0.55, size=n)
    cost = np.round(list_price * (1 - margin), -3)

    # Product name: prefer a real scraped sample for this (category, brand);
    # else synthesize from brand+category+sub+random suffix.
    def _name_for(i: int) -> str:
        c = str(cat[i])
        b = str(brand[i])
        if catalog and c in catalog:
            samples = [s for s in catalog[c]["sample_products"] if s.lower().startswith(b.lower())]
            if samples:
                base = str(rng.choice(samples))
            elif catalog[c]["sample_products"]:
                base = str(rng.choice(catalog[c]["sample_products"]))
            else:
                base = f"{b} {c} {sub[i]} {fake.lexify('???').upper()}"
        else:
            base = f"{b} {c} {sub[i]} {fake.lexify('???').upper()}"
        # Disambiguate by suffix so duplicates don't collapse — Tableau drops dup
        # rows on dim joins. Append a 3-letter randomized suffix.
        return f"{base[:70]} {fake.lexify('???').upper()}"

    return pd.DataFrame(
        {
            "ProductId": np.arange(1, n + 1, dtype=np.int32),
            "Sku": [f"MM-{i:06d}" for i in range(1, n + 1)],
            "ProductName": [_name_for(i) for i in range(n)],
            "Category": cat,
            "SubCategory": sub,
            "Brand": brand,
            "ListPrice": list_price,
            "Cost": cost,
        }
    )


def _build_customers(
    params: MediaMartParameters,
    rng: np.random.Generator,
    fake: Faker,
    stores: pd.DataFrame,
) -> pd.DataFrame:
    n = params.n_customers
    # Tier with realistic pyramid.
    tier = rng.choice([t[0] for t in _TIER_CHURN_MEAN_STD], size=n, p=list(_TIER_PROBS))
    # Churn risk per tier mean/std.
    mean_map = {t[0]: t[1] for t in _TIER_CHURN_MEAN_STD}
    std_map = {t[0]: t[2] for t in _TIER_CHURN_MEAN_STD}
    means = np.array([mean_map[t] for t in tier], dtype=np.float64)
    stds = np.array([std_map[t] for t in tier], dtype=np.float64)
    churn = np.clip(rng.normal(means, stds), 0, 100).round().astype(np.int16)

    # Lifetime Value correlates positively with Tier and inversely with Churn.
    tier_ltv = {"Diamond": 150_000_000, "Platinum": 80_000_000, "Gold": 32_000_000, "Silver": 12_000_000, "Standard": 4_500_000}
    ltv_base = np.array([tier_ltv[t] for t in tier], dtype=np.float64)
    ltv = np.round(
        ltv_base * rng.lognormal(0, 0.25, size=n) * (1.1 - churn / 200.0), -3
    ).astype(np.int64)

    # NBO assignment biased by tier:
    #  - Diamond/Platinum → premium upsell (Premium TV Upgrade, VIP Concierge, Laptop Refresh)
    #  - Gold/Silver → cross-sell / loyalty (Loyalty 2x, Audio Upgrade, Smart Home, Smartphone Trade-in)
    #  - Standard → win-back / engagement (Win-back Voucher, Re-engagement, Free Shipping)
    nbo_premium = [
        "Premium TV Upgrade Bundle 15%",
        "VIP Concierge — Free Install + 24mo Warranty",
        "Laptop Refresh Program 10%",
        "iPhone 16 Pre-order + 5M trade-in",
    ]
    nbo_crosssell = [
        "Loyalty Points 2x Weekend",
        "Audio Premium Upgrade Path",
        "Smartphone Trade-in 3M Bonus",
        "Smart Home Starter Bundle",
        "Home Appliance Bundle 12%",
    ]
    nbo_winback = [
        "Win-back Voucher 20%",
        "Re-engagement Email Series",
        "Free Shipping + Extended Warranty",
    ]

    nbo: list[str] = []
    for t in tier:
        if t in ("Diamond", "Platinum"):
            nbo.append(str(rng.choice(nbo_premium)))
        elif t in ("Gold", "Silver"):
            nbo.append(str(rng.choice(nbo_crosssell)))
        else:
            nbo.append(str(rng.choice(nbo_winback)))

    # Loyalty points balance correlates with tier (Diamond hoards points).
    tier_lp = {"Diamond": 25_000, "Platinum": 12_000, "Gold": 4_500, "Silver": 1_200, "Standard": 200}
    lp_base = np.array([tier_lp[t] for t in tier], dtype=np.float64)
    lp_balance = np.maximum(
        0, rng.normal(lp_base, lp_base * 0.4)
    ).astype(np.int32)

    # Customer home city sampled from stores' province distribution.
    home_idx = rng.integers(0, len(stores), size=n)
    home_city = stores.iloc[home_idx]["City"].to_numpy()
    home_province = stores.iloc[home_idx]["Province"].to_numpy()
    home_region = np.array([_vn_region(p) for p in home_province])

    return pd.DataFrame(
        {
            "CustomerId": np.arange(1, n + 1, dtype=np.int32),
            "CustomerName": [fake.unique.name() for _ in range(n)],
            "Tier": tier,
            "Segment": rng.choice(
                ["Family", "Young Professional", "Student", "Senior", "Pro Gamer"],
                size=n,
                p=[0.40, 0.28, 0.15, 0.12, 0.05],
            ),
            "Region": home_region,
            "City": home_city,
            "Province": home_province,
            "AcquisitionDate": [
                _random_dt_between(
                    rng,
                    params.start_date - timedelta(days=3 * 365),
                    params.end_date,
                )
                for _ in range(n)
            ],
            "ChurnRiskScore": churn,
            "LifetimeValue": ltv,
            "NextBestOffer": nbo,
            "LoyaltyPointsBalance": lp_balance,
            "TenantId": params.tenant_id,
        }
    )


def _build_orders_and_lines(
    params: MediaMartParameters,
    rng: np.random.Generator,
    *,
    customers: pd.DataFrame,
    products: pd.DataFrame,
    stores: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    days = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(days)

    base = np.full(n_days, float(params.base_daily_orders))
    growth = np.linspace(1.0, 1.0 + params.yoy_growth_pct / 100, n_days)
    dow = np.array([d.dayofweek for d in days])
    dow_mult = np.where(dow <= 4, 1.0, np.where(dow == 5, 1.30, 1.10))
    month = np.array([d.month for d in days])
    # VN seasonality: Tet (Jan/Feb) and BF/year-end (Nov/Dec) peaks; summer dip in Jul.
    month_mult = np.where(
        np.isin(month, [11, 12]), 1.50,
        np.where(np.isin(month, [1, 2]), 1.40,
                 np.where(month == 7, 0.85, 1.0)),
    )

    event_mult = np.ones(n_days)
    for ev_date, ev_mult in params.market_events:
        if params.start_date <= ev_date <= params.end_date:
            idx = (ev_date - params.start_date).days
            for offset, scale in ((-2, 0.5), (-1, 0.8), (0, 1.0), (1, 0.6), (2, 0.3)):
                j = idx + offset
                if 0 <= j < n_days:
                    event_mult[j] = max(event_mult[j], 1 + (ev_mult - 1) * scale)

    daily_orders = np.maximum(
        rng.poisson(lam=base * growth * dow_mult * month_mult * event_mult), 1
    )

    total_orders = int(daily_orders.sum())
    order_dates = np.repeat(days.values, daily_orders).astype("datetime64[D]")
    order_ids = np.arange(1, total_orders + 1, dtype=np.int64)

    # Customer assignment — Diamond/Platinum customers shop more often (Pareto skew).
    tier_weights = customers["Tier"].map(
        {"Diamond": 6.0, "Platinum": 4.0, "Gold": 2.5, "Silver": 1.3, "Standard": 1.0}
    ).to_numpy(dtype=np.float64)
    tier_probs = tier_weights / tier_weights.sum()
    customer_ids = rng.choice(
        customers["CustomerId"].to_numpy(), size=total_orders, p=tier_probs
    ).astype(np.int32)

    store_ids = rng.integers(1, len(stores) + 1, size=total_orders, dtype=np.int32)
    channel_ids = rng.choice(
        [1, 2, 3], size=total_orders, p=list(params.channel_mix)
    ).astype(np.int8)
    status = rng.choice(
        ["Completed", "Refunded", "Cancelled"], size=total_orders, p=[0.94, 0.04, 0.02]
    )
    payment_method = rng.choice(
        ["Credit Card", "Bank Transfer", "Cash", "Installment", "E-wallet"],
        size=total_orders,
        p=[0.30, 0.20, 0.15, 0.20, 0.15],
    )

    orders = pd.DataFrame(
        {
            "OrderId": order_ids,
            "OrderDate": order_dates,
            "CustomerId": customer_ids,
            "StoreId": store_ids,
            "ChannelId": channel_ids,
            "Status": status,
            "PaymentMethod": payment_method,
        }
    )

    # ── OrderLines ────────────────────────────────────────────────────────
    # 1-4 lines per order, Poisson centered around 1.
    line_counts = rng.poisson(lam=1.4, size=total_orders) + 1
    n_lines = int(line_counts.sum())
    line_order = np.repeat(order_ids, line_counts)
    product_ids = rng.integers(1, len(products) + 1, size=n_lines, dtype=np.int32)
    quantities = (rng.poisson(lam=0.5, size=n_lines) + 1).astype(np.int16)

    list_price_by_id = products.set_index("ProductId")["ListPrice"]
    cost_by_id = products.set_index("ProductId")["Cost"]
    prices = list_price_by_id.loc[product_ids].to_numpy()
    costs = cost_by_id.loc[product_ids].to_numpy()

    # Discount — Tet & BF orders get higher discount; otherwise modest.
    line_dates = orders.set_index("OrderId").loc[line_order, "OrderDate"].to_numpy()
    line_months = pd.to_datetime(line_dates).month
    base_discount = rng.beta(a=2.2, b=10, size=n_lines)
    promo_boost = np.where(np.isin(line_months, [1, 2, 11, 12]), 0.08, 0.0)
    discount = np.round(np.clip(base_discount + promo_boost, 0, 0.45), 4)

    unit_price = np.round(prices * (1 - discount), -2)  # round to 100 VND
    line_total = (unit_price * quantities).astype(np.float64)
    line_cost = (costs * quantities).astype(np.float64)

    # Loyalty points — Diamond/Platinum use a lot; Standard rarely.
    customer_tier = customers.set_index("CustomerId").loc[
        orders.set_index("OrderId").loc[line_order, "CustomerId"].to_numpy()
    ]["Tier"].to_numpy()
    tier_lp_mult = np.array(
        [
            {"Diamond": 0.60, "Platinum": 0.45, "Gold": 0.25, "Silver": 0.10, "Standard": 0.03}[t]
            for t in customer_tier
        ]
    )
    has_loyalty = rng.random(n_lines) < tier_lp_mult
    # Points scale with line total (1pt per 1000 VND, capped at 5000pt per line).
    raw_pts = np.clip(line_total / 1000.0, 0, 5000) * rng.uniform(0.3, 1.0, n_lines)
    loyalty_pts = np.where(has_loyalty, raw_pts, 0).astype(np.int32)

    order_lines = pd.DataFrame(
        {
            "OrderLineId": np.arange(1, n_lines + 1, dtype=np.int64),
            "OrderId": line_order,
            "ProductId": product_ids,
            "Quantity": quantities,
            "UnitPrice": unit_price,
            "Discount": discount,
            "LineTotal": line_total,
            "LineCost": line_cost,
            "LoyaltyPointsUsed": loyalty_pts,
        }
    )

    return orders, order_lines


def _build_inventory(
    params: MediaMartParameters,
    rng: np.random.Generator,
    *,
    stores: pd.DataFrame,
    catalog: dict[str, dict[str, list[str]]] | None = None,
) -> pd.DataFrame:
    """Current-snapshot inventory: one row per (Store × Category × Brand).

    OOS scenario: `oos_rate` fraction of rows have Stock < CampaignTarget so the
    Control Tower's Supply Chain panel surfaces realistic alerts.
    """
    rows: list[dict[str, object]] = []
    inv_id = 1
    snapshot_date = params.end_date
    for _, store in stores.iterrows():
        for cat in _CATEGORIES:
            # Sample 2-4 brands per (store × category). Prefer real scraped
            # brands for this category over the hardcoded fallback pool.
            brand_pool: tuple[str, ...] = (
                tuple(catalog[cat]["brands"])
                if catalog and cat in catalog and catalog[cat]["brands"]
                else _BRAND_POOL[cat]
            )
            brands = rng.choice(
                brand_pool,
                size=min(rng.integers(2, 5), len(brand_pool)),
                replace=False,
            )
            for brand in brands:
                target = int(rng.integers(20, 80))
                # ~oos_rate of rows are below target; rest are at/above.
                if rng.random() < params.oos_rate:
                    stock = int(rng.integers(0, target))  # below target → OOS
                else:
                    stock = int(rng.integers(target, max(target + 1, target * 2)))
                rows.append(
                    {
                        "InventoryId": inv_id,
                        "StoreId": int(store["StoreId"]),
                        "Category": cat,
                        "Brand": str(brand),
                        "StockQuantity": stock,
                        "CampaignTargetQuantity": target,
                        "ReorderPoint": int(target * 0.4),
                        "SnapshotDate": pd.Timestamp(snapshot_date),
                        "TenantId": params.tenant_id,
                    }
                )
                inv_id += 1

    return pd.DataFrame(rows)


def _random_dt_between(
    rng: np.random.Generator, start: date, end: date
) -> datetime:
    delta_days = (end - start).days
    offset = int(rng.integers(0, max(delta_days, 1)))
    return datetime.combine(start + timedelta(days=offset), datetime.min.time())
