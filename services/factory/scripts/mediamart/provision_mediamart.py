"""MediaMart provisioning — data -> .hyper -> .tdsx -> publish Cloud datasource.

Full rebuild of the MediaMart tenant on the self-contained extract-workbook
pattern proven on VACS/SHB: the 7 tables are packed into ONE .hyper embedded in
a flat federated .tds, so NO Tableau Desktop relationship-drawing step is needed
(the original mediamart datasource required the user to hand-draw 7 relationships
on the Desktop canvas — this replaces that entirely).

The published `mediamart` datasource is what the MCP AI agent queries for
retail next-best-action advisory (see apps/web/lib/system-prompt.ts
`advisory: "retail-actions"`).

Run:
  uv run python scripts/mediamart/provision_mediamart.py            # build .hyper + .tdsx
  uv run python scripts/mediamart/provision_mediamart.py --publish  # + publish datasource
  uv run python scripts/mediamart/provision_mediamart.py --probe    # + print extract sanity checks
"""
from __future__ import annotations

import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.generators.mediamart import (  # noqa: E402
    MediaMartDataset,
    MediaMartParameters,
    generate_mediamart,
)
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "mediamart"
OUT_DIR = Path("/tmp/mediamart")
HYPER = OUT_DIR / "mediamart.hyper"
TDSX = OUT_DIR / "mediamart.tdsx"
PROJECT = "Demo/MediaMart"

# ── Analysis tables (DENORMALIZED) ───────────────────────────────────────────
# MediaMart is a 7-table star schema, but the VACS/SHB self-contained-extract
# pattern requires each table to be SELF-SUFFICIENT: a datasource with many
# unjoined sibling <relation>s renders BLANK on Cloud strict-mode, and
# hand-authored workbook relationships were repeatedly rejected. So we pre-join
# in pandas (reliable, no Desktop step) into 3 wide analysis tables, each of
# which a dashboard zone can read with BARE field names and NO render-time join:
#   - SalesFact         (order-line grain + all dims)  → D1 revenue/margin, D4 stores
#   - CustomerSummary    (customer grain + revenue rollup) → D2 Customer-360 / churn
#   - InventorySnapshot  (store×category×brand + store dims) → D3 supply chain / OOS
TABLES = ("SalesFact", "CustomerSummary", "InventorySnapshot")

_STORE_DIMS = ["StoreId", "StoreName", "City", "Province", "Region", "Type", "Latitude", "Longitude"]

# Stable demo window: 24 months ending 2026-06-30 (covers Black Friday 2024/2025
# + Tet 2025/2026, the seasonality peaks the generator injects). Fixed dates so
# rebuilds are reproducible instead of drifting with date.today().
START_DATE = date(2024, 7, 1)
END_DATE = date(2026, 6, 30)


def denormalize(ds: MediaMartDataset) -> dict[str, pd.DataFrame]:
    """Pre-join the star schema into 3 self-sufficient analysis tables so the
    extract needs NO render-time relationships (VACS/SHB constraint)."""
    ol = ds.order_lines
    orders = ds.orders
    cust = ds.customers
    prod = ds.products
    stores = ds.stores
    chan = ds.channels

    # ── SalesFact — one row per order line, all dims flattened in ────────────
    sales = ol.merge(
        orders[["OrderId", "OrderDate", "CustomerId", "StoreId", "ChannelId", "Status", "PaymentMethod"]],
        on="OrderId", how="left",
    )
    sales = sales.merge(
        prod[["ProductId", "ProductName", "Category", "SubCategory", "Brand"]],
        on="ProductId", how="left",
    )
    sales = sales.merge(
        cust[["CustomerId", "CustomerName", "Tier", "Segment", "ChurnRiskScore"]],
        on="CustomerId", how="left",
    )
    sales = sales.merge(stores[_STORE_DIMS], on="StoreId", how="left")
    sales = sales.merge(chan.rename(columns={"ChannelName": "Channel"}), on="ChannelId", how="left")
    # GrossProfit precomputed so the workbook only needs SUM() (no cross-table math).
    sales["GrossProfit"] = sales["LineTotal"] - sales["LineCost"]

    # ── CustomerSummary — customer grain + revenue/order rollup ──────────────
    completed = orders[orders["Status"] == "Completed"]
    rev_by_cust = (
        ol.merge(completed[["OrderId", "CustomerId"]], on="OrderId", how="inner")
        .groupby("CustomerId")
        .agg(RevenueToDate=("LineTotal", "sum"), LoyaltyPointsUsed=("LoyaltyPointsUsed", "sum"))
        .reset_index()
    )
    orders_by_cust = (
        completed.groupby("CustomerId").agg(OrderCount=("OrderId", "nunique")).reset_index()
    )
    cust_sum = cust.merge(rev_by_cust, on="CustomerId", how="left").merge(
        orders_by_cust, on="CustomerId", how="left"
    )
    cust_sum[["RevenueToDate", "LoyaltyPointsUsed", "OrderCount"]] = (
        cust_sum[["RevenueToDate", "LoyaltyPointsUsed", "OrderCount"]].fillna(0)
    )
    # Churn band for a clean categorical split in the dashboard.
    cust_sum["ChurnBand"] = pd.cut(
        cust_sum["ChurnRiskScore"],
        bins=[-1, 30, 60, 101],
        labels=["Thấp", "Trung bình", "Cao"],
    ).astype(str)

    # ── InventorySnapshot — store × category × brand + store dims ────────────
    inv = ds.inventory.merge(stores[_STORE_DIMS], on="StoreId", how="left")
    inv["OosGap"] = inv["CampaignTargetQuantity"] - inv["StockQuantity"]
    inv["IsOos"] = (inv["StockQuantity"] < inv["CampaignTargetQuantity"]).astype("int8")
    inv["StockStatus"] = inv["IsOos"].map({1: "Thiếu hàng", 0: "Đủ hàng"})

    return {
        "SalesFact": sales,
        "CustomerSummary": cust_sum,
        "InventorySnapshot": inv,
    }


def build_tds_xml(hyper_filename: str) -> bytes:
    ds = Element(
        "datasource",
        attrib={"formatted-name": DS_NAME, "inline": "true", "version": "18.1"},
    )
    conn = SubElement(ds, "connection", attrib={"class": "federated"})
    named = SubElement(conn, "named-connections")
    nc = SubElement(
        named, "named-connection", attrib={"caption": DS_NAME, "name": "hyperconn"}
    )
    SubElement(
        nc,
        "connection",
        attrib={
            "class": "hyper",
            "authentication": "auth-none",
            "dbname": f"Data/Datasources/{hyper_filename}",
            "schema": "Extract",
            "server": "",
            "default-settings": "yes",
        },
    )
    for t in TABLES:
        SubElement(
            conn,
            "relation",
            attrib={
                "connection": "hyperconn",
                "name": t,
                "table": f"[Extract].[{t}]",
                "type": "table",
            },
        )
    return b'<?xml version="1.0" encoding="utf-8" ?>\n' + tostring(ds, encoding="utf-8")


def build() -> dict[str, pd.DataFrame]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ds = generate_mediamart(
        MediaMartParameters(
            tenant_id="mediamart",
            start_date=START_DATE,
            end_date=END_DATE,
        )
    )
    tables = denormalize(ds)
    total = 0
    for name in TABLES:  # deterministic order
        df = tables[name]
        total += len(df)
        print(f"  {name:18s} {len(df):>8,} rows  ({len(df.columns)} cols)")
    print(f"  {'TOTAL':18s} {total:>8,} rows")
    write_hyper(tables, HYPER)
    print(f"hyper -> {HYPER}  ({HYPER.stat().st_size:,} bytes)")
    tds = build_tds_xml(HYPER.name)
    with zipfile.ZipFile(TDSX, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{DS_NAME}.tds", tds)
        zf.write(HYPER, arcname=f"Data/Datasources/{HYPER.name}")
    print(f"tdsx  -> {TDSX}  ({TDSX.stat().st_size:,} bytes)")
    return tables


def probe(tables: dict[str, pd.DataFrame]) -> None:
    """Print a few sanity aggregates so we can eyeball the extract before publish."""
    sales = tables["SalesFact"]
    cust = tables["CustomerSummary"]
    inv = tables["InventorySnapshot"]
    rev = float(sales["LineTotal"].sum())
    margin = float(sales["GrossProfit"].sum() / sales["LineTotal"].sum())
    oos = int(inv["IsOos"].sum())
    print("\n── probe ───────────────────────────────────────────")
    print(f"  SalesFact rows          : {len(sales):,}")
    print(f"  Revenue (LineTotal sum) : {rev/1e9:,.1f} tỷ")
    print(f"  Gross margin %          : {margin*100:,.1f}%")
    print(f"  Date range              : {sales['OrderDate'].min()} → {sales['OrderDate'].max()}")
    print(f"  Rev by Category (top3)  : "
          f"{(sales.groupby('Category')['LineTotal'].sum()/1e9).round(0).nlargest(3).to_dict()}")
    print(f"  Channels                : {sorted(sales['Channel'].dropna().unique())}")
    print(f"  Customers               : {len(cust):,}")
    print(f"  Tier mix                : {cust['Tier'].value_counts().to_dict()}")
    print(f"  ChurnBand mix           : {cust['ChurnBand'].value_counts().to_dict()}")
    print(f"  Rev@risk (churn Cao) tỷ : "
          f"{cust.loc[cust['ChurnBand']=='Cao','RevenueToDate'].sum()/1e9:,.0f}")
    print(f"  Inventory rows          : {len(inv):,}  (OOS: {oos:,} = {oos/len(inv)*100:.0f}%)")


def _env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def publish() -> str:
    import tableauserverclient as tsc

    env = _env()
    auth = tsc.PersonalAccessTokenAuth(
        env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"]
    )
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        all_projects, _ = server.projects.get()
        parent_id = None
        for part in ("Demo", "MediaMart"):
            found = next(
                (
                    p
                    for p in all_projects
                    if p.name == part and (getattr(p, "parent_id", None) == parent_id)
                ),
                None,
            )
            if found:
                parent_id = found.id
            else:
                proj = tsc.ProjectItem(name=part)
                if parent_id:
                    proj.parent_id = parent_id
                created = server.projects.create(proj)
                all_projects, _ = server.projects.get()
                parent_id = created.id
        print(f"project {PROJECT} id={parent_id}")
        item = tsc.DatasourceItem(project_id=parent_id, name=DS_NAME)
        published = server.datasources.publish(
            item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite
        )
        print(
            f"PUBLISHED datasource: {published.name}  id={published.id}  "
            f"project={published.project_name}"
        )
        return published.id


if __name__ == "__main__":
    built = build()
    if "--probe" in sys.argv:
        probe(built)
    if "--publish" in sys.argv:
        publish()
