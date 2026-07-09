"""Build MediaMart D3 — Chuỗi cung ứng & Hết hàng (OOS).

Data: InventorySnapshot (store × category × brand snapshot). SNAPSHOT → NO
sparklines. "Color-as-alert" is expressed via the brand-red bars on OOS ranking
(magnitude = severity); the flat-red discipline holds.

Zones (per approved mockup, D3 band):
  - Title block
  - 6 KPI cards: Dòng hết hàng, Tổng dòng tồn, Tỷ lệ OOS, Cửa hàng cần điều
    chuyển (>=8 OOS), Tồn kho TB, Điểm chờ nhập (dưới reorder)
  - 2 ranking panels: Số dòng OOS theo ngành hàng · Top cửa hàng thiếu hàng

Run:  uv run python scripts/mediamart/build_mediamart_d3.py [--publish] [--render]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mediamart_lib as L  # noqa: E402

WB_NAME = "MediaMart Control Tower - D3 Chuoi Cung Ung"
DASH_NAME = "D3 Chuoi Cung Ung"
TABLE = "InventorySnapshot"

FMT_PCT = "p0.0%"
FMT_INT = "n#,##0"

C_OOS_N = L.Calc(TABLE, "0230010001", "Dòng hết hàng", "integer", "measure", "quantitative",
                 "SUM([IsOos])", fmt=FMT_INT)
C_ROWS = L.Calc(TABLE, "0230010002", "Tổng dòng tồn", "integer", "measure", "quantitative",
                "COUNTD([InventoryId])", fmt=FMT_INT)
C_OOS_PCT = L.Calc(TABLE, "0230010003", "Tỷ lệ OOS", "real", "measure", "quantitative",
                   "SUM([IsOos]) / COUNTD([InventoryId])", fmt=FMT_PCT)
C_STORES_ALERT = L.Calc(TABLE, "0230010004", "CH cần điều chuyển", "integer", "measure", "quantitative",
                        "COUNTD(IF [IsOos]=1 THEN [StoreId] END)", fmt=FMT_INT)
C_AVG_STOCK = L.Calc(TABLE, "0230010005", "Tồn kho TB", "integer", "measure", "quantitative",
                     "AVG([StockQuantity])", fmt=FMT_INT)
C_BELOW_REORDER = L.Calc(TABLE, "0230010006", "Điểm chờ nhập", "integer", "measure", "quantitative",
                         "COUNTD(IF [StockQuantity] < [ReorderPoint] THEN [InventoryId] END)", fmt=FMT_INT)

CALCS = [C_OOS_N, C_ROWS, C_OOS_PCT, C_STORES_ALERT, C_AVG_STOCK, C_BELOW_REORDER]

KPI_DEFS = [
    ("KPI OOS N", C_OOS_N, "Dòng hết hàng", L.BAD),
    ("KPI Rows", C_ROWS, "Tổng dòng tồn kho", L.INK),
    ("KPI OOS Pct", C_OOS_PCT, "Tỷ lệ hết hàng", L.BAD),
    ("KPI Stores Alert", C_STORES_ALERT, "Cửa hàng có OOS", L.BAD),
    ("KPI Avg Stock", C_AVG_STOCK, "Tồn kho TB/dòng", L.INK),
    ("KPI Below Reorder", C_BELOW_REORDER, "Dưới điểm đặt lại", L.WARN),
]


def build_twb() -> str:
    L.reset_zids()
    sheets = []
    sheet_names = []

    for name, calc, title, color in KPI_DEFS:
        sheets.append(L.kpi_card(name, calc, title, value_color=color, size=24))
        sheet_names.append(name)

    r1 = L.ranking_bar("OOS theo nganh", "Số dòng hết hàng theo ngành hàng — báo động cao nhất trên đầu",
                       TABLE, dim_col="Category", value_calc=C_OOS_N)
    r2 = L.ranking_bar("Top CH thieu hang", "Top cửa hàng thiếu hàng cần điều chuyển",
                       TABLE, dim_col="StoreName", value_calc=C_OOS_N,
                       keep_members=_top_oos_stores())
    sheets += [r1, r2]
    sheet_names += ["OOS theo nganh", "Top CH thieu hang"]

    rows = []
    rows.append(L.title_block("· D3 Chuỗi cung ứng & Hết hàng (OOS)",
                              "Tồn kho so với mục tiêu campaign · cảnh báo hết hàng · snapshot 30/06/2026"))
    rows.append(L.hrow([n for n, *_ in KPI_DEFS], h=13000, kpi=True))
    rows.append(_two_panel("OOS theo nganh", "Top CH thieu hang", h=75000))

    dash = L.dashboard(DASH_NAME, rows, width=1560, height=1180)
    return L.workbook([TABLE], CALCS, sheets, sheet_names, dash, DASH_NAME)


def _top_oos_stores() -> list[str]:
    """The stores to keep on the 'Top cửa hàng thiếu hàng' ranking. An explicit
    enumerate filter (parses on Cloud) since top-N filters do not."""
    return [
        "MediaMart Hanoi 05", "MediaMart Bac Giang 22", "MediaMart Son La 23",
        "MediaMart Hoa Binh 03", "MediaMart Thanh Hoa 16", "MediaMart Bac Ninh 07",
    ]


def _two_panel(left_sheet, right_sheet, h):
    left = L.leaf(left_sheet, w=50000)
    right = L.leaf(right_sheet, w=50000)
    return (f"          <zone h='{h}' id='{L._zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n"
            f"{left}\n{right}\n          </zone>")


if __name__ == "__main__":
    twb = build_twb()
    print("validate:", L.validate(twb))
    twbx = L.package_twbx(twb, WB_NAME)
    print(f"twbx -> {twbx} ({twbx.stat().st_size:,} bytes)")
    if "--publish" in sys.argv:
        wb_id = L.publish(twbx, WB_NAME)
        if "--render" in sys.argv:
            L.render(wb_id, "d3")
