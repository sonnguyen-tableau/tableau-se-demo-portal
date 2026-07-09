"""Build MediaMart D1 — Doanh thu & Lợi nhuận (revenue & profit control tower).

Zones (per approved mockup control-tower-v1.html, D1 band):
  - Title block (clean, red accent — no colored band)
  - 6 spark-KPI cards: Doanh thu, Biên LN%, Số đơn, Giá trị ĐH TB, Tỷ lệ trả, DT/CH
  - Emphasis monthly revenue chart (max month darkest, sequential red)
  - Category bullet ranking: revenue by Category (sequential emphasis)

Data: SalesFact (self-sufficient denormalized table). All KPIs are calc fields
that recompute per-month for the sparkline. Currency shown in tỷ (÷1e9).

Run:  uv run python scripts/mediamart/build_mediamart_d1.py [--publish] [--render]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mediamart_lib as L  # noqa: E402

WB_NAME = "MediaMart Control Tower - D1 Doanh Thu"
DASH_NAME = "D1 Doanh Thu"
TABLE = "SalesFact"

# ── Calc fields (all on SalesFact; ':Completed' guard where relevant) ────────
# IMPORTANT (learned on the extract path): trailing-comma format scaling
# (`,,,` = ÷1e9) is IGNORED on this federated-extract Cloud path — the raw VND
# renders instead. So bake the ÷1e9 / ÷1e6 scaling into the FORMULA and use a
# plain format with a literal unit suffix. (AOV already did this and rendered
# correctly; revenue did not and overflowed the card.)
FMT_TY = 'n#,##0.0" tỷ"'
FMT_PCT = "p0.0%"
FMT_INT = "n#,##0"
FMT_TR = 'n#,##0.0" tr"'

C_REV = L.Calc(TABLE, "0210010001", "Doanh thu (tỷ)", "real", "measure", "quantitative",
               "SUM(IF [Status]='Completed' THEN [LineTotal] END) / 1e9", fmt=FMT_TY)
C_GP = L.Calc(TABLE, "0210010002", "Biên LN %", "real", "measure", "quantitative",
              "SUM(IF [Status]='Completed' THEN [GrossProfit] END) / "
              "SUM(IF [Status]='Completed' THEN [LineTotal] END)", fmt=FMT_PCT)
C_ORDERS = L.Calc(TABLE, "0210010003", "Số đơn hàng", "integer", "measure", "quantitative",
                  "COUNTD(IF [Status]='Completed' THEN [OrderId] END)", fmt=FMT_INT)
C_AOV = L.Calc(TABLE, "0210010004", "Giá trị ĐH TB (tr)", "real", "measure", "quantitative",
               "SUM(IF [Status]='Completed' THEN [LineTotal] END) / "
               "COUNTD(IF [Status]='Completed' THEN [OrderId] END) / 1e6", fmt=FMT_TR)
C_RETURN = L.Calc(TABLE, "0210010005", "Tỷ lệ trả/huỷ %", "real", "measure", "quantitative",
                  "COUNTD(IF [Status]!='Completed' THEN [OrderId] END) / COUNTD([OrderId])", fmt=FMT_PCT)
C_UNITS = L.Calc(TABLE, "0210010006", "Sản lượng bán", "integer", "measure", "quantitative",
                 "SUM(IF [Status]='Completed' THEN [Quantity] END)", fmt=FMT_INT)

# Emphasis chart / label uses the same revenue calc (already tỷ).
CALCS = [C_REV, C_GP, C_ORDERS, C_AOV, C_RETURN, C_UNITS]

# ── KPI cards (number) + sparklines (monthly recompute) ──────────────────────
# Each KPI: a BAN card + a sparkline of the same calc trended by OrderDate month.
KPI_DEFS = [
    ("KPI Doanh thu", "Spark Doanh thu", C_REV, "Doanh thu 24T", L.INK, 24),
    ("KPI Bien LN", "Spark Bien LN", C_GP, "Biên lợi nhuận gộp", L.INK, 24),
    ("KPI So don", "Spark So don", C_ORDERS, "Số đơn hoàn tất", L.INK, 24),
    ("KPI AOV", "Spark AOV", C_AOV, "Giá trị đơn TB", L.INK, 24),
    ("KPI Tra hang", "Spark Tra hang", C_RETURN, "Tỷ lệ trả/huỷ", L.INK, 24),
    ("KPI San luong", "Spark San luong", C_UNITS, "Sản lượng bán", L.INK, 24),
]


def build_twb() -> str:
    L.reset_zids()
    sheets = []
    sheet_names = []

    for num_sheet, spark_sheet, calc, title, color, size in KPI_DEFS:
        sheets.append(L.kpi_card(num_sheet, calc, title, value_color=color, size=size))
        sheets.append(L.sparkline(spark_sheet, TABLE, "OrderDate", calc, color=L.BRAND))
        sheet_names += [num_sheet, spark_sheet]

    # Emphasis monthly revenue (max month darkest — built-in red sequential).
    emph = L.emphasis_month_chart(
        "DT theo thang", "Doanh thu theo tháng — cao điểm Tết & Black Friday tô đậm",
        TABLE, "OrderDate", value_calc=C_REV)
    sheets.append(emph)
    sheet_names.append("DT theo thang")

    # Category ranking (revenue by Category, sequential emphasis).
    rank = L.ranking_bar(
        "DT theo nganh hang", "Doanh thu theo ngành hàng (tỷ)",
        TABLE, dim_col="Category", value_calc=C_REV)
    sheets.append(rank)
    sheet_names.append("DT theo nganh hang")

    # ── Dashboard layout ─────────────────────────────────────────────────────
    rows = []
    rows.append(L.title_block("· D1 Doanh thu & Lợi nhuận",
                              "Tổng quan kết quả kinh doanh bán lẻ điện máy · 24 tháng"))
    rows.append(L.spark_hrow([(n, s) for n, s, *_ in KPI_DEFS], h=26000))
    # Two-panel content row: emphasis month (wider) + category ranking.
    rows.append(_two_panel("DT theo thang", "DT theo nganh hang", h=64000))

    dash = L.dashboard(DASH_NAME, rows, width=1560, height=1180)
    return L.workbook([TABLE], CALCS, sheets, sheet_names, dash, DASH_NAME)


def _two_panel(left_sheet, right_sheet, h):
    """A horizontal flow of two card leaves, left wider than right (1.5:1)."""
    left = L.leaf(left_sheet, w=60000)
    right = L.leaf(right_sheet, w=40000)
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
            L.render(wb_id, "d1")
