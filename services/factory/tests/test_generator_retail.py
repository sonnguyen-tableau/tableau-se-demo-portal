from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from app.generators.retail import RetailParameters, generate_retail


def _params(end: date | None = None) -> RetailParameters:
    end = end or date(2026, 1, 1)
    return RetailParameters(
        tenant_id="tenant-test",
        start_date=end - timedelta(days=730),
        end_date=end,
        seed=123,
    )


def test_generator_produces_expected_tables() -> None:
    ds = generate_retail(_params())
    tables = ds.all_tables()
    assert set(tables) == {
        "Customers",
        "Products",
        "Stores",
        "Channels",
        "Orders",
        "OrderLines",
    }


def test_orders_have_foreign_keys_inside_dimensions() -> None:
    ds = generate_retail(_params())
    assert ds.orders["CustomerId"].isin(ds.customers["CustomerId"]).all()
    assert ds.orders["StoreId"].isin(ds.stores["StoreId"]).all()
    assert ds.orders["ChannelId"].isin(ds.channels["ChannelId"]).all()


def test_order_lines_reference_existing_orders_and_products() -> None:
    ds = generate_retail(_params())
    assert ds.order_lines["OrderId"].isin(ds.orders["OrderId"]).all()
    assert ds.order_lines["ProductId"].isin(ds.products["ProductId"]).all()


def test_revenue_is_positive() -> None:
    ds = generate_retail(_params())
    revenue = ds.order_lines["LineTotal"].sum()
    assert revenue > 0


def test_row_count_within_budget() -> None:
    ds = generate_retail(_params())
    total_rows = sum(len(t) for t in ds.all_tables().values())
    # Budget per plan: 150K-300K total. The seed should land in that window.
    assert 100_000 <= total_rows <= 600_000, f"unexpected row count: {total_rows}"


def test_seasonality_includes_q4_peak() -> None:
    ds = generate_retail(_params())
    # November + December order count should exceed the average month.
    monthly = (
        ds.orders.assign(month=pd.to_datetime(ds.orders["OrderDate"]).dt.month)
        .groupby("month")
        .size()
    )
    avg = monthly.mean()
    assert monthly[11] > avg, "Q4 (November) should peak above average"
    assert monthly[12] > avg, "Q4 (December) should peak above average"


def test_deterministic_with_seed() -> None:
    a = generate_retail(_params())
    b = generate_retail(_params())
    assert len(a.orders) == len(b.orders)
    assert a.orders["OrderId"].equals(b.orders["OrderId"])
    assert a.order_lines["LineTotal"].equals(b.order_lines["LineTotal"])


def test_tenant_id_threaded_through() -> None:
    ds = generate_retail(_params())
    assert (ds.customers["TenantId"] == "tenant-test").all()
