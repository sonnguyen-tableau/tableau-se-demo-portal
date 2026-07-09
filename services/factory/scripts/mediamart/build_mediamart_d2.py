"""Build MediaMart D2 — Customer 360 & Churn.

Data: CustomerSummary (customer-grain snapshot). SNAPSHOT table → NO sparklines
(honest-data rule from meygroup: sparkline only where a real time dimension
exists). KPI cards are plain BANs; the churn condition is baked into calc fields
so ranking charts group by Tier / NextBestOffer without a sheet-level filter.

Zones (per approved mockup, D2 band):
  - Title block
  - 6 KPI cards: Tổng KH, Diamond+Platinum, % churn Cao, KH nguy cơ Cao,
    DT rủi ro (churn Cao), Điểm loyalty TB
  - 3 ranking panels: KH nguy cơ Cao theo hạng · DT rủi ro theo hạng ·
    NextBestOffer nên kích hoạt (top offers cho nhóm churn Cao)

Run:  uv run python scripts/mediamart/build_mediamart_d2.py [--publish] [--render]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mediamart_lib as L  # noqa: E402

WB_NAME = "MediaMart Control Tower - D2 Customer 360"
DASH_NAME = "D2 Customer 360"
TABLE = "CustomerSummary"

FMT_TY = 'n#,##0.0" tỷ"'
FMT_PCT = "p0.0%"
FMT_INT = "n#,##0"

# ── KPI calcs (snapshot; ':Cao' churn condition baked in) ────────────────────
C_TOTAL = L.Calc(TABLE, "0220010001", "Tổng KH", "integer", "measure", "quantitative",
                 "COUNTD([CustomerId])", fmt=FMT_INT)
C_VIP = L.Calc(TABLE, "0220010002", "KH Diamond+Platinum", "integer", "measure", "quantitative",
               "COUNTD(IF [Tier]='Diamond' OR [Tier]='Platinum' THEN [CustomerId] END)", fmt=FMT_INT)
C_CAO_PCT = L.Calc(TABLE, "0220010003", "% KH nguy cơ Cao", "real", "measure", "quantitative",
                   "COUNTD(IF [ChurnBand]='Cao' THEN [CustomerId] END) / COUNTD([CustomerId])", fmt=FMT_PCT)
C_CAO_N = L.Calc(TABLE, "0220010004", "KH nguy cơ Cao", "integer", "measure", "quantitative",
                 "COUNTD(IF [ChurnBand]='Cao' THEN [CustomerId] END)", fmt=FMT_INT)
C_RISK_REV = L.Calc(TABLE, "0220010005", "DT rủi ro (tỷ)", "real", "measure", "quantitative",
                    "SUM(IF [ChurnBand]='Cao' THEN [RevenueToDate] END) / 1e9", fmt=FMT_TY)
C_LOYALTY = L.Calc(TABLE, "0220010006", "Điểm loyalty TB", "integer", "measure", "quantitative",
                   "AVG([LoyaltyPointsBalance])", fmt=FMT_INT)

CALCS = [C_TOTAL, C_VIP, C_CAO_PCT, C_CAO_N, C_RISK_REV, C_LOYALTY]

# KPI cards: plain BAN (no spark). Risk cards use BAD red value color.
KPI_DEFS = [
    ("KPI Tong KH", C_TOTAL, "Tổng khách hàng", L.INK),
    ("KPI VIP", C_VIP, "KH Diamond + Platinum", L.INK),
    ("KPI Cao Pct", C_CAO_PCT, "Tỷ lệ KH nguy cơ cao", L.BAD),
    ("KPI Cao N", C_CAO_N, "Số KH nguy cơ cao", L.BAD),
    ("KPI Risk Rev", C_RISK_REV, "DT rủi ro (churn cao)", L.BAD),
    ("KPI Loyalty", C_LOYALTY, "Điểm loyalty trung bình", L.INK),
]


def build_twb() -> str:
    L.reset_zids()
    sheets = []
    sheet_names = []

    for name, calc, title, color in KPI_DEFS:
        sheets.append(L.kpi_card(name, calc, title, value_color=color, size=24))
        sheet_names.append(name)

    # Ranking 1 — KH nguy cơ Cao theo hạng thẻ (Standard dominates).
    r1 = L.ranking_bar("KH Cao theo hang", "KH nguy cơ rời bỏ cao theo hạng thẻ",
                       TABLE, dim_col="Tier", value_calc=C_CAO_N)
    # Ranking 2 — DT rủi ro theo hạng (where win-back pays off).
    r2 = L.ranking_bar("DT rui ro theo hang", "Doanh thu rủi ro theo hạng thẻ (tỷ)",
                       TABLE, dim_col="Tier", value_calc=C_RISK_REV)
    # Ranking 3 — NextBestOffer nên kích hoạt cho nhóm churn Cao.
    # NOTE: no top_n — the hand-authored top-N categorical filter is rejected by
    # Cloud strict-mode ("Error parsing filter"); DESC computed-sort already puts
    # the biggest offers on top, and all 12 offers are demo-meaningful.
    r3 = L.ranking_bar("NBO nen kich hoat", "Ưu đãi nên kích hoạt cho nhóm nguy cơ cao",
                       TABLE, dim_col="NextBestOffer", value_calc=C_CAO_N)
    sheets += [r1, r2, r3]
    sheet_names += ["KH Cao theo hang", "DT rui ro theo hang", "NBO nen kich hoat"]

    rows = []
    rows.append(L.title_block("· D2 Customer 360 & Churn",
                              "Chân dung khách hàng · nguy cơ rời bỏ · doanh thu rủi ro · snapshot 30/06/2026"))
    rows.append(L.hrow([n for n, *_ in KPI_DEFS], h=14000, kpi=True))
    rows.append(_three_panel("KH Cao theo hang", "DT rui ro theo hang", "NBO nen kich hoat", h=75000))

    dash = L.dashboard(DASH_NAME, rows, width=1560, height=1180)
    return L.workbook([TABLE], CALCS, sheets, sheet_names, dash, DASH_NAME)


def _three_panel(a, b, c, h):
    la, lb, lc = L.leaf(a, w=33000), L.leaf(b, w=33000), L.leaf(c, w=34000)
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
            L.render(wb_id, "d2")
