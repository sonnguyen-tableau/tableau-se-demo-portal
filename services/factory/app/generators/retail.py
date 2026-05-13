"""Retail / E-commerce synthetic data generator.

Contract: emits a `RetailDataset` whose column names match
`packages/factory-schema/retail-ecommerce.schema.json` exactly. The numbers
are vectorized via NumPy to hit ~200K rows in <1s. Faker is used only for
small dimension tables (Customers, Products, Stores).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker


@dataclass
class RetailParameters:
    tenant_id: str
    start_date: date
    end_date: date
    base_daily_orders: int = 70
    seed: int = 42
    yoy_growth_pct: float = 12.0
    # Multipliers applied around specific dates to simulate market events.
    market_events: tuple[tuple[date, float], ...] = (
        (date(2024, 11, 29), 4.2),  # Black Friday 2024
        (date(2024, 12, 26), 2.8),  # Boxing Day
        (date(2025, 2, 10), 2.2),  # Lunar NY peak
        (date(2025, 11, 28), 4.5),  # Black Friday 2025
        (date(2025, 12, 26), 3.0),  # Boxing Day 2025
    )
    # Channel mix: online / retail / wholesale.
    channel_mix: tuple[float, float, float] = (0.62, 0.30, 0.08)
    geographies: tuple[str, ...] = ("NA", "EMEA", "APAC")


@dataclass
class RetailDataset:
    customers: pd.DataFrame
    products: pd.DataFrame
    stores: pd.DataFrame
    channels: pd.DataFrame
    orders: pd.DataFrame
    order_lines: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Customers": self.customers,
            "Products": self.products,
            "Stores": self.stores,
            "Channels": self.channels,
            "Orders": self.orders,
            "OrderLines": self.order_lines,
        }


def generate_retail(params: RetailParameters) -> RetailDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker()
    Faker.seed(params.seed)

    channels = pd.DataFrame(
        {
            "ChannelId": [1, 2, 3],
            "ChannelName": ["Online", "Retail", "Wholesale"],
        }
    )

    n_customers = 4_500
    customers = pd.DataFrame(
        {
            "CustomerId": np.arange(1, n_customers + 1, dtype=np.int32),
            "CustomerName": [fake.unique.name() for _ in range(n_customers)],
            "Segment": rng.choice(
                ["Hobbyist", "Enthusiast", "Pro"], size=n_customers, p=[0.55, 0.30, 0.15]
            ),
            "Region": rng.choice(
                list(params.geographies),
                size=n_customers,
                p=_normalize_probs(len(params.geographies)),
            ),
            "AcquisitionDate": [
                _random_date_between(rng, params.start_date - timedelta(days=365), params.end_date)
                for _ in range(n_customers)
            ],
            "TenantId": params.tenant_id,
        }
    )

    n_products = 320
    categories = ["Bikes", "Apparel", "Accessories", "Components", "Service"]
    products = pd.DataFrame(
        {
            "ProductId": np.arange(1, n_products + 1, dtype=np.int32),
            "Sku": [f"SKU-{i:05d}" for i in range(1, n_products + 1)],
            "ProductName": [fake.bs().title()[:60] for _ in range(n_products)],
            "Category": rng.choice(categories, size=n_products),
            "SubCategory": rng.choice(
                ["A", "B", "C", "D"], size=n_products, p=[0.4, 0.3, 0.2, 0.1]
            ),
            "ListPrice": np.round(rng.lognormal(mean=4.0, sigma=0.8, size=n_products), 2),
            "Cost": np.zeros(n_products, dtype=np.float64),
        }
    )
    products["Cost"] = np.round(products["ListPrice"] * rng.uniform(0.35, 0.65, size=n_products), 2)

    n_stores = 28
    stores = pd.DataFrame(
        {
            "StoreId": np.arange(1, n_stores + 1, dtype=np.int32),
            "StoreName": [f"Store {i:02d}" for i in range(1, n_stores + 1)],
            "Region": rng.choice(
                list(params.geographies),
                size=n_stores,
                p=_normalize_probs(len(params.geographies)),
            ),
            "Country": rng.choice(["US", "DE", "FR", "JP", "AU"], size=n_stores),
            "Type": rng.choice(["Flagship", "Standard", "Outlet"], size=n_stores, p=[0.2, 0.6, 0.2]),
            "OpenDate": [
                _random_date_between(
                    rng,
                    params.start_date - timedelta(days=5 * 365),
                    params.start_date - timedelta(days=30),
                )
                for _ in range(n_stores)
            ],
        }
    )

    # Build the time series of order counts per day with growth + seasonality.
    days = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(days)

    base = np.full(n_days, float(params.base_daily_orders))
    growth = np.linspace(1.0, 1.0 + params.yoy_growth_pct / 100, n_days)
    dow = np.array([d.dayofweek for d in days])
    dow_mult = np.where(
        dow <= 4, 1.0, np.where(dow == 5, 1.2, 0.85)
    )  # weekday baseline, Sat peak, Sun dip
    month = np.array([d.month for d in days])
    month_mult = np.where(np.isin(month, [11, 12]), 1.4, np.where(np.isin(month, [6, 7, 8]), 1.15, 1.0))

    event_mult = np.ones(n_days)
    for ev_date, ev_mult in params.market_events:
        if params.start_date <= ev_date <= params.end_date:
            idx = (ev_date - params.start_date).days
            for offset, scale in ((-1, 0.6), (0, 1.0), (1, 0.4)):
                j = idx + offset
                if 0 <= j < n_days:
                    event_mult[j] = max(event_mult[j], 1 + (ev_mult - 1) * scale)

    daily_orders = np.maximum(
        rng.poisson(lam=base * growth * dow_mult * month_mult * event_mult), 1
    )

    total_orders = int(daily_orders.sum())
    order_dates = np.repeat(days.values, daily_orders).astype("datetime64[D]")
    order_ids = np.arange(1, total_orders + 1, dtype=np.int64)

    # Each order's tenant-aware dimensions.
    customer_ids = rng.integers(1, n_customers + 1, size=total_orders, dtype=np.int32)
    store_ids = rng.integers(1, n_stores + 1, size=total_orders, dtype=np.int32)
    channel_ids = rng.choice(
        [1, 2, 3], size=total_orders, p=list(params.channel_mix)
    ).astype(np.int8)
    status = rng.choice(
        ["Completed", "Refunded", "Cancelled"],
        size=total_orders,
        p=[0.93, 0.04, 0.03],
    )

    orders = pd.DataFrame(
        {
            "OrderId": order_ids,
            "OrderDate": order_dates,
            "CustomerId": customer_ids,
            "StoreId": store_ids,
            "ChannelId": channel_ids,
            "Status": status,
        }
    )

    # Order lines — 1 to 5 per order, log-normal quantity bias toward 1.
    line_counts = rng.poisson(lam=1.6, size=total_orders) + 1
    line_index = np.repeat(order_ids, line_counts)
    n_lines = int(line_counts.sum())
    product_ids = rng.integers(1, n_products + 1, size=n_lines, dtype=np.int32)
    quantities = (rng.poisson(lam=0.8, size=n_lines) + 1).astype(np.int16)

    prices = products.set_index("ProductId").loc[product_ids, "ListPrice"].to_numpy()
    costs = products.set_index("ProductId").loc[product_ids, "Cost"].to_numpy()
    discount = np.round(rng.beta(a=2, b=12, size=n_lines), 4)
    unit_price = np.round(prices * (1 - discount), 2)
    line_total = np.round(unit_price * quantities, 2)
    line_cost = np.round(costs * quantities, 2)

    order_lines = pd.DataFrame(
        {
            "OrderLineId": np.arange(1, n_lines + 1, dtype=np.int64),
            "OrderId": line_index,
            "ProductId": product_ids,
            "Quantity": quantities,
            "UnitPrice": unit_price,
            "Discount": discount,
            "LineTotal": line_total,
            "LineCost": line_cost,
        }
    )

    return RetailDataset(
        customers=customers,
        products=products,
        stores=stores,
        channels=channels,
        orders=orders,
        order_lines=order_lines,
    )


def _normalize_probs(n: int) -> list[float]:
    """Default geographic skew: 60/30/10 truncated to n entries, renormalized."""
    base = [0.60, 0.30, 0.10][:n]
    s = sum(base)
    return [x / s for x in base]


def _random_date_between(
    rng: np.random.Generator, start: date, end: date
) -> datetime:
    delta_days = (end - start).days
    offset = int(rng.integers(0, max(delta_days, 1)))
    return datetime.combine(start + timedelta(days=offset), datetime.min.time())
