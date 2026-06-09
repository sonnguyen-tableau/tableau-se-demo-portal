"""VinCommerce Retail & Mall Leasing synthetic data generator.

Contract: emits a `VinCommerceDataset` whose column names match
`packages/factory-schema/retail-mall.schema.json` exactly.

Two sub-verticals:
  - Retail: WinMart (siêu thị) + WinMart+ (cửa hàng tiện lợi)
  - Mall Leasing: Vincom Center portfolio — unit occupancy + monthly revenue

Seasonality is tuned for Vietnam:
  - Tết (Jan/Feb): sales spike 2.8–3.5×, mall traffic +40%
  - Back-to-school (Aug–Sep): +20%
  - Mid-Autumn Festival (Sep): +15%
  - 12/12 / 11/11 online-to-offline: +30%
  - Black Friday (Nov last week): +25%
  - Year-end (Dec): +35%
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
import pandas as pd
from faker import Faker
from faker.providers import address, company


# ── Parameters ────────────────────────────────────────────────────────────────

@dataclass
class VinCommerceParameters:
    tenant_id: str
    start_date: date
    end_date: date
    n_winmart: int = 12
    n_winmart_plus: int = 85
    n_malls: int = 6
    n_products: int = 3_000
    n_lessees: int = 280
    base_daily_sales_winmart: int = 1_800      # transactions/day/store
    base_daily_sales_winmart_plus: int = 320   # transactions/day/store
    target_occupancy_rate: float = 0.87
    yoy_growth_pct: float = 8.0
    seed: int = 42
    provinces: tuple[str, ...] = ("Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Cần Thơ", "Bình Dương", "Hải Phòng")
    mall_names: tuple[str, ...] = (
        "Vincom Center Bà Triệu",
        "Vincom Mega Mall Royal City",
        "Vincom Center Đồng Khởi",
        "Vincom Mega Mall Smart City",
        "Vincom Center Đà Nẵng",
        "Vincom Center Cần Thơ",
    )
    mall_provinces: tuple[str, ...] = ("Hà Nội", "Hà Nội", "Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ")


# ── Dataset ───────────────────────────────────────────────────────────────────

@dataclass
class VinCommerceDataset:
    # Retail sub-vertical
    stores: pd.DataFrame
    products: pd.DataFrame
    sales_transactions: pd.DataFrame
    inventory: pd.DataFrame
    # Mall leasing sub-vertical
    malls: pd.DataFrame
    leasable_units: pd.DataFrame
    lessees: pd.DataFrame
    lease_contracts: pd.DataFrame
    monthly_rental_revenue: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Stores": self.stores,
            "Products": self.products,
            "SalesTransactions": self.sales_transactions,
            "Inventory": self.inventory,
            "Malls": self.malls,
            "LeasableUnits": self.leasable_units,
            "Lessees": self.lessees,
            "LeaseContracts": self.lease_contracts,
            "MonthlyRentalRevenue": self.monthly_rental_revenue,
        }


# ── Seasonality helpers ───────────────────────────────────────────────────────

def _seasonality_multiplier(dates: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Return a per-day multiplier array shaped like `dates`."""
    mult = np.ones(len(dates), dtype=np.float64)

    for i, d in enumerate(dates):
        # d is a numpy datetime64; convert via pd.Timestamp
        ts = pd.Timestamp(d)
        m, day = ts.month, ts.day

        # Tết window: late Jan through mid-Feb  (peak: Jan 25 – Feb 15)
        if (m == 1 and day >= 20) or (m == 2 and day <= 15):
            mult[i] *= rng.uniform(2.6, 3.5)
        # Back-to-school: Aug–Sep
        elif m in (8, 9):
            mult[i] *= rng.uniform(1.15, 1.30)
        # Mid-Autumn Festival: Sep (15th of lunar ≈ Sep 17–30 Gregorian)
        elif m == 9 and day >= 15:
            mult[i] *= rng.uniform(1.10, 1.20)
        # 11/11 online-to-offline
        elif m == 11 and 9 <= day <= 13:
            mult[i] *= rng.uniform(1.25, 1.40)
        # Black Friday: last week of Nov
        elif m == 11 and day >= 24:
            mult[i] *= rng.uniform(1.20, 1.35)
        # 12/12 sale
        elif m == 12 and 10 <= day <= 14:
            mult[i] *= rng.uniform(1.25, 1.40)
        # Year-end / Christmas
        elif m == 12 and day >= 20:
            mult[i] *= rng.uniform(1.30, 1.45)
        # General weekend lift (Sat/Sun)
        if ts.dayofweek >= 5:
            mult[i] *= rng.uniform(1.12, 1.22)

    return mult


# ── Main generator ────────────────────────────────────────────────────────────

def generate_vincommerce(params: VinCommerceParameters) -> VinCommerceDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker("vi_VN")
    Faker.seed(params.seed)

    # ── Stores ────────────────────────────────────────────────────────────────
    n_stores = params.n_winmart + params.n_winmart_plus
    store_types = (["WinMart"] * params.n_winmart) + (["WinMart+"] * params.n_winmart_plus)
    area_sqm = np.where(
        np.array(store_types) == "WinMart",
        rng.integers(2_000, 6_000, size=n_stores),
        rng.integers(150, 600, size=n_stores),
    )
    province_ids = rng.integers(0, len(params.provinces), size=n_stores)
    open_dates = [
        params.start_date - timedelta(days=int(rng.integers(30, 1800)))
        for _ in range(n_stores)
    ]
    stores = pd.DataFrame({
        "StoreId": np.arange(1, n_stores + 1, dtype=np.int32),
        "StoreName": [f"{st} {fake.street_name()[:20]}" for st in store_types],
        "StoreType": store_types,
        "Province": [params.provinces[i] for i in province_ids],
        "District": [fake.administrative_unit() for _ in range(n_stores)],
        "OpenDate": [d.isoformat() for d in open_dates],
        "CloseDate": [None] * n_stores,
        "AreaSqm": area_sqm.astype(np.int32),
        "TenantId": params.tenant_id,
    })

    # ── Products ──────────────────────────────────────────────────────────────
    categories = [
        ("Thực phẩm tươi sống", ["Rau củ quả", "Thịt cá", "Hải sản"]),
        ("Thực phẩm khô & đóng gói", ["Gạo & ngũ cốc", "Mì & bún", "Đồ hộp"]),
        ("Đồ uống", ["Nước giải khát", "Bia & rượu", "Sữa & dairy"]),
        ("Chăm sóc cá nhân", ["Mỹ phẩm", "Dưỡng da", "Vệ sinh cá nhân"]),
        ("Gia dụng & tạp hóa", ["Chất tẩy rửa", "Dụng cụ bếp", "Đồ dùng nhà"]),
        ("Bánh kẹo & snack", ["Bánh", "Kẹo chocolate", "Snack mặn"]),
    ]
    cat_labels, subcat_pool = [], []
    for cat, subcats in categories:
        cat_labels.extend([cat] * len(subcats))
        subcat_pool.extend(subcats)
    cat_idx = rng.integers(0, len(subcat_pool), size=params.n_products)
    cost_price = rng.uniform(5_000, 250_000, size=params.n_products)
    margin_mult = rng.uniform(1.10, 1.45, size=params.n_products)
    is_private_label = rng.random(size=params.n_products) < 0.18  # ~18% private label
    products = pd.DataFrame({
        "ProductId": np.arange(1, params.n_products + 1, dtype=np.int32),
        "Sku": [f"SKU-{i:06d}" for i in range(1, params.n_products + 1)],
        "ProductName": [fake.bs().title()[:40] for _ in range(params.n_products)],
        "Category": [cat_labels[i] for i in cat_idx],
        "SubCategory": [subcat_pool[i] for i in cat_idx],
        "Brand": [fake.company()[:30] for _ in range(params.n_products)],
        "CostPrice": np.round(cost_price, 0).astype(np.int64),
        "SellPrice": np.round(cost_price * margin_mult, 0).astype(np.int64),
        "IsPrivateLabel": is_private_label,
    })

    # ── SalesTransactions ─────────────────────────────────────────────────────
    # One row per (store × product × date) sample — we subsample to keep size manageable
    date_range = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(date_range)
    date_arr = date_range.values

    all_tx_rows = []
    tx_id = 1
    for _, store_row in stores.iterrows():
        sid = int(store_row["StoreId"])
        stype = store_row["StoreType"]
        base = params.base_daily_sales_winmart if stype == "WinMart" else params.base_daily_sales_winmart_plus
        season = _seasonality_multiplier(date_arr, rng)
        # YoY growth applied linearly over the period
        growth_factor = np.linspace(1.0, 1 + params.yoy_growth_pct / 100, n_days)

        n_products_per_day = max(1, int(base * 0.02))  # ~2% of base = active SKUs/day
        for day_idx, (tx_date, mult, gf) in enumerate(zip(date_arr, season, growth_factor)):
            day_vol = max(1, int(base * mult * gf))
            pids = rng.choice(products["ProductId"].values, size=n_products_per_day, replace=False)
            for pid in pids:
                product = products[products["ProductId"] == pid].iloc[0]
                qty = rng.integers(1, 25)
                sell_price = float(product["SellPrice"])
                cost_price_val = float(product["CostPrice"])
                discount_pct = rng.choice([0, 0, 0, 0.05, 0.10, 0.15], p=[0.55, 0.20, 0.10, 0.07, 0.05, 0.03])
                revenue = round(qty * sell_price * (1 - discount_pct))
                cogs = round(qty * cost_price_val)
                all_tx_rows.append({
                    "TxId": tx_id,
                    "TxDate": pd.Timestamp(tx_date).date().isoformat(),
                    "StoreId": sid,
                    "ProductId": int(pid),
                    "Qty": int(qty),
                    "Revenue": int(revenue),
                    "COGS": int(cogs),
                    "Discount": int(round(qty * sell_price * discount_pct)),
                    "TenantId": params.tenant_id,
                })
                tx_id += 1
            # Keep row count manageable — stop after sample
            if tx_id > 300_000:
                break
        if tx_id > 300_000:
            break

    sales_transactions = pd.DataFrame(all_tx_rows)

    # ── Inventory ─────────────────────────────────────────────────────────────
    weekly_dates = pd.date_range(params.start_date, params.end_date, freq="W-MON")
    inv_rows = []
    for snap_date in weekly_dates:
        # Sample ~5% of store×product combinations each week
        sampled_stores = rng.choice(stores["StoreId"].values, size=min(10, n_stores), replace=False)
        sampled_products = rng.choice(products["ProductId"].values, size=50, replace=False)
        for sid in sampled_stores:
            for pid in sampled_products:
                stock = int(rng.integers(0, 200))
                days_on_hand = round(stock / max(1, rng.integers(5, 30)), 1)
                inv_rows.append({
                    "SnapshotDate": snap_date.date().isoformat(),
                    "StoreId": int(sid),
                    "ProductId": int(pid),
                    "StockQty": stock,
                    "DaysOnHand": days_on_hand,
                    "TenantId": params.tenant_id,
                })
    inventory = pd.DataFrame(inv_rows)

    # ── Malls ─────────────────────────────────────────────────────────────────
    n_malls = min(params.n_malls, len(params.mall_names))
    total_areas = rng.integers(30_000, 180_000, size=n_malls)
    leasable_pct = rng.uniform(0.55, 0.70, size=n_malls)
    malls = pd.DataFrame({
        "MallId": np.arange(1, n_malls + 1, dtype=np.int32),
        "MallName": list(params.mall_names[:n_malls]),
        "Province": list(params.mall_provinces[:n_malls]),
        "TotalAreaSqm": total_areas.astype(np.int32),
        "LeasableAreaSqm": np.round(total_areas * leasable_pct).astype(np.int32),
        "FloorCount": rng.integers(3, 7, size=n_malls).astype(np.int32),
        "OpenYear": rng.integers(2010, 2022, size=n_malls).astype(np.int32),
        "TenantId": params.tenant_id,
    })

    # ── LeasableUnits ─────────────────────────────────────────────────────────
    unit_types = ["Anchor", "Standard", "F&B", "Fashion", "Entertainment", "Services"]
    unit_type_probs = [0.05, 0.40, 0.20, 0.20, 0.08, 0.07]
    facing_types = ["Corridor", "Atrium", "External", "Corner"]
    unit_rows = []
    unit_id = 1
    units_per_mall: dict[int, list[int]] = {}
    for _, mall_row in malls.iterrows():
        mall_id = int(mall_row["MallId"])
        leasable_area = int(mall_row["LeasableAreaSqm"])
        floors = int(mall_row["FloorCount"])
        n_units = int(rng.integers(60, 200))
        units_per_mall[mall_id] = []
        for _ in range(n_units):
            utype = rng.choice(unit_types, p=unit_type_probs)
            area = int(rng.integers(25, 800) if utype == "Anchor" else rng.integers(20, 200))
            unit_rows.append({
                "UnitId": unit_id,
                "MallId": mall_id,
                "Floor": int(rng.integers(1, floors + 1)),
                "AreaSqm": area,
                "UnitType": utype,
                "FacingType": str(rng.choice(facing_types)),
                "TenantId": params.tenant_id,
            })
            units_per_mall[mall_id].append(unit_id)
            unit_id += 1
    leasable_units = pd.DataFrame(unit_rows)
    total_units = len(leasable_units)

    # ── Lessees ───────────────────────────────────────────────────────────────
    lessee_categories = ["Thời trang", "Ẩm thực", "Điện tử & CN", "Làm đẹp & SPA", "Giải trí", "Dịch vụ", "Siêu thị nhỏ"]
    lessee_cat_probs = [0.28, 0.22, 0.15, 0.12, 0.10, 0.08, 0.05]
    lessees = pd.DataFrame({
        "LesseeId": np.arange(1, params.n_lessees + 1, dtype=np.int32),
        "LesseeName": [fake.company()[:40] for _ in range(params.n_lessees)],
        "Brand": [fake.company()[:30] for _ in range(params.n_lessees)],
        "Category": rng.choice(lessee_categories, size=params.n_lessees, p=lessee_cat_probs),
        "IsForeign": rng.random(size=params.n_lessees) < 0.22,
        "TenantId": params.tenant_id,
    })

    # ── LeaseContracts ────────────────────────────────────────────────────────
    # Assign lessees to units; ~87% occupancy target, contracts span 1–3 years
    contract_rows = []
    contract_id = 1
    n_occupied = int(total_units * params.target_occupancy_rate)
    unit_ids_all = leasable_units["UnitId"].values.tolist()
    occupied_unit_ids = rng.choice(unit_ids_all, size=n_occupied, replace=False).tolist()

    lease_statuses = ["Active", "Expired", "Renewed", "Terminated"]
    lease_status_probs = [0.72, 0.10, 0.13, 0.05]

    for uid in occupied_unit_ids:
        unit_row = leasable_units[leasable_units["UnitId"] == uid].iloc[0]
        area = int(unit_row["AreaSqm"])
        utype = unit_row["UnitType"]

        # Base rent per m² varies by unit type
        base_rent_per_sqm = {
            "Anchor": rng.uniform(200_000, 350_000),
            "Standard": rng.uniform(400_000, 700_000),
            "F&B": rng.uniform(500_000, 850_000),
            "Fashion": rng.uniform(450_000, 750_000),
            "Entertainment": rng.uniform(250_000, 450_000),
            "Services": rng.uniform(350_000, 600_000),
        }.get(utype, rng.uniform(350_000, 650_000))
        base_rent = int(base_rent_per_sqm * area)
        cam_fee = int(base_rent * rng.uniform(0.08, 0.15))

        # Contract timeline
        contract_dur_years = int(rng.choice([1, 2, 3], p=[0.25, 0.45, 0.30]))
        days_into_period = int(rng.integers(0, 730))
        start_dt = params.start_date - timedelta(days=days_into_period)
        end_dt = start_dt + timedelta(days=contract_dur_years * 365)
        status = str(rng.choice(lease_statuses, p=lease_status_probs))
        is_renewal = bool(rng.random() < 0.35)

        lessee_id = int(rng.integers(1, params.n_lessees + 1))
        contract_rows.append({
            "ContractId": contract_id,
            "UnitId": uid,
            "LesseeId": lessee_id,
            "StartDate": start_dt.isoformat(),
            "EndDate": end_dt.isoformat(),
            "BaseRentVND": base_rent,
            "CAMFeeVND": cam_fee,
            "DepositMonths": int(rng.choice([1, 2, 3])),
            "Status": status,
            "IsRenewal": is_renewal,
            "TenantId": params.tenant_id,
        })
        contract_id += 1
    lease_contracts = pd.DataFrame(contract_rows)

    # ── MonthlyRentalRevenue ──────────────────────────────────────────────────
    month_range = pd.date_range(params.start_date, params.end_date, freq="MS")
    rev_rows = []
    active_contracts = lease_contracts[lease_contracts["Status"].isin(["Active", "Renewed"])]
    for _, contract in active_contracts.iterrows():
        cid = int(contract["ContractId"])
        uid = int(contract["UnitId"])
        unit_mall_id = int(leasable_units[leasable_units["UnitId"] == uid]["MallId"].iloc[0])
        base_rent = int(contract["BaseRentVND"])
        cam_fee = int(contract["CAMFeeVND"])
        contract_start = date.fromisoformat(str(contract["StartDate"]))
        contract_end = date.fromisoformat(str(contract["EndDate"]))

        for month_ts in month_range:
            month_date = month_ts.date()
            if month_date < contract_start or month_date > contract_end:
                continue
            # Arrears: ~4% of contracts have some arrears each month
            arrears = int(base_rent * rng.uniform(0.5, 1.2)) if rng.random() < 0.04 else 0
            total = base_rent + cam_fee + arrears
            rev_rows.append({
                "Month": month_ts.date().isoformat(),
                "ContractId": cid,
                "UnitId": uid,
                "MallId": unit_mall_id,
                "BaseRent": base_rent,
                "CAMFee": cam_fee,
                "Arrears": arrears,
                "TotalRevenue": total,
                "TenantId": params.tenant_id,
            })
    monthly_rental_revenue = pd.DataFrame(rev_rows)

    return VinCommerceDataset(
        stores=stores,
        products=products,
        sales_transactions=sales_transactions,
        inventory=inventory,
        malls=malls,
        leasable_units=leasable_units,
        lessees=lessees,
        lease_contracts=lease_contracts,
        monthly_rental_revenue=monthly_rental_revenue,
    )
