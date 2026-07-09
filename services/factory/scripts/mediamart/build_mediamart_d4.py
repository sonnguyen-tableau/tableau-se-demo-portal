"""Build MediaMart D4 — Điểm bán & Khu vực (store network & channel).

Data: SalesFact. Time dimension exists here (OrderDate), so KPI cards COULD get
sparklines, but the story is store/channel comparison → use plain KPI cards +
three ranking panels (top stores, channel mix, payment mix) for a clean network
view. Currency in tỷ (÷1e9 baked into calc).

Zones (per approved mockup, D4 band):
  - Title block
  - 6 KPI cards: DT Bắc Bộ, DT Bắc Trung Bộ, Kênh In-Store, Online, Mobile App, Số CH
  - 3 ranking panels: Top cửa hàng (DT tỷ) · Doanh thu theo kênh · Phương thức thanh toán

Run:  uv run python scripts/mediamart/build_mediamart_d4.py [--publish] [--render]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mediamart_lib as L  # noqa: E402

WB_NAME = "MediaMart Control Tower - D4 Diem Ban"
DASH_NAME = "D4 Diem Ban"
TABLE = "SalesFact"

FMT_TY = 'n#,##0" tỷ"'
FMT_TY1 = 'n#,##0.0" tỷ"'
FMT_INT = "n#,##0"

W = "[Status]='Completed'"
C_REV_NORTH = L.Calc(TABLE, "0240010001", "DT Bắc Bộ (tỷ)", "real", "measure", "quantitative",
                     f"SUM(IF {W} AND [Region]='North' THEN [LineTotal] END) / 1e9", fmt=FMT_TY)
C_REV_NC = L.Calc(TABLE, "0240010002", "DT Bắc Trung Bộ (tỷ)", "real", "measure", "quantitative",
                  f"SUM(IF {W} AND [Region]='North Central' THEN [LineTotal] END) / 1e9", fmt=FMT_TY)
C_INSTORE = L.Calc(TABLE, "0240010003", "Kênh In-Store (tỷ)", "real", "measure", "quantitative",
                   f"SUM(IF {W} AND [Channel]='In-Store' THEN [LineTotal] END) / 1e9", fmt=FMT_TY)
C_ONLINE = L.Calc(TABLE, "0240010004", "Kênh Online (tỷ)", "real", "measure", "quantitative",
                  f"SUM(IF {W} AND [Channel]='Online' THEN [LineTotal] END) / 1e9", fmt=FMT_TY)
C_APP = L.Calc(TABLE, "0240010005", "Kênh Mobile App (tỷ)", "real", "measure", "quantitative",
               f"SUM(IF {W} AND [Channel]='Mobile App' THEN [LineTotal] END) / 1e9", fmt=FMT_TY)
C_STORES = L.Calc(TABLE, "0240010006", "Số cửa hàng", "integer", "measure", "quantitative",
                  "COUNTD([StoreId])", fmt=FMT_INT)

# Ranking measures
C_REV_TY = L.Calc(TABLE, "0240020001", "Doanh thu (tỷ)", "real", "measure", "quantitative",
                  f"SUM(IF {W} THEN [LineTotal] END) / 1e9", fmt=FMT_TY1)

CALCS = [C_REV_NORTH, C_REV_NC, C_INSTORE, C_ONLINE, C_APP, C_STORES, C_REV_TY]

KPI_DEFS = [
    ("KPI North", C_REV_NORTH, "Doanh thu Bắc Bộ", L.INK),
    ("KPI NC", C_REV_NC, "Doanh thu Bắc Trung Bộ", L.INK),
    ("KPI InStore", C_INSTORE, "Kênh In-Store", L.BRAND),
    ("KPI Online", C_ONLINE, "Kênh Online", L.INK),
    ("KPI App", C_APP, "Kênh Mobile App", L.INK),
    ("KPI Stores", C_STORES, "Số cửa hàng", L.INK),
]


def build_twb() -> str:
    L.reset_zids()
    sheets = []
    sheet_names = []

    for name, calc, title, color in KPI_DEFS:
        sheets.append(L.kpi_card(name, calc, title, value_color=color, size=24))
        sheet_names.append(name)

    r1 = L.ranking_bar("Top cua hang", "Top cửa hàng theo doanh thu (tỷ)",
                       TABLE, dim_col="StoreName", value_calc=C_REV_TY,
                       keep_members=_top_stores())
    r2 = L.ranking_bar("DT theo kenh", "Doanh thu theo kênh bán (tỷ)",
                       TABLE, dim_col="Channel", value_calc=C_REV_TY)
    r3 = L.ranking_bar("Phuong thuc TT", "Doanh thu theo phương thức thanh toán (tỷ)",
                       TABLE, dim_col="PaymentMethod", value_calc=C_REV_TY)
    sheets += [r1, r2, r3]
    sheet_names += ["Top cua hang", "DT theo kenh", "Phuong thuc TT"]

    rows = []
    rows.append(L.title_block("· D4 Điểm bán & Khu vực",
                              "Hiệu suất cửa hàng · kênh bán · phân bố Bắc Bộ / Bắc Trung Bộ · 24 tháng"))
    rows.append(L.hrow([n for n, *_ in KPI_DEFS], h=13000, kpi=True))
    rows.append(_three_panel("Top cua hang", "DT theo kenh", "Phuong thuc TT", h=75000))

    dash = L.dashboard(DASH_NAME, rows, width=1560, height=1180)
    return L.workbook([TABLE], CALCS, sheets, sheet_names, dash, DASH_NAME)


def _top_stores() -> list[str]:
    return [
        "MediaMart Hai Duong 20", "MediaMart Hanoi 05", "MediaMart Dong Hoi 12",
        "MediaMart Hoa Binh 03", "MediaMart Bac Ninh 01", "MediaMart Bac Ninh 21",
        "MediaMart Yen Bai 19", "MediaMart Hai Duong 13",
    ]


def _three_panel(a, b, c, h):
    la, lb, lc = L.leaf(a, w=40000), L.leaf(b, w=30000), L.leaf(c, w=30000)
    return (f"          <zone h='{h}' id='{L._zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n"
            f"{la}\n{lb}\n{lc}\n          </zone>")


if __name__ == "__main__":
    twb = build_twb()
    print("validate:", L.validate(twb))
    twbx = L.package_twbx(twb, WB_NAME)
    print(f"twbx -> {twbx} ({twbx.stat().st_size:,} bytes)")
    if "--publish" in sys.argv:
        wb_id = L.publish(twbx, WB_NAME)
        if "--render" in sys.argv:
            L.render(wb_id, "d4")
