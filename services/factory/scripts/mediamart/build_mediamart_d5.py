"""Build MediaMart D5 — AI Deep-Dive · Giữ chân & Bán chéo.

The decision-support companion to the portal's AI agent (advisory:
"retail-actions"). It frames the win-back / cross-sell opportunity the agent
reasons over, so a demo can point at the numbers then ask the agent
"đề xuất chiến dịch giữ chân". Data: CustomerSummary (snapshot → no sparklines).

Zones (per approved mockup, D5 band):
  - Title block
  - 4 KPI cards: DT rủi ro, DT rủi ro Standard+Silver, Thu hồi 15% (mô phỏng),
    KH nguy cơ Cao
  - 2 ranking panels: DT rủi ro theo phân khúc KH · Ưu đãi (NBO) nên kích hoạt

Run:  uv run python scripts/mediamart/build_mediamart_d5.py [--publish] [--render]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import mediamart_lib as L  # noqa: E402

WB_NAME = "MediaMart Control Tower - D5 AI Deep-Dive"
DASH_NAME = "D5 AI Deep-Dive"
TABLE = "CustomerSummary"

FMT_TY = 'n#,##0.0" tỷ"'
FMT_INT = "n#,##0"

CAO = "[ChurnBand]='Cao'"
SS = "([Tier]='Standard' OR [Tier]='Silver')"

C_RISK = L.Calc(TABLE, "0250010001", "DT rủi ro (tỷ)", "real", "measure", "quantitative",
                f"SUM(IF {CAO} THEN [RevenueToDate] END) / 1e9", fmt=FMT_TY)
C_RISK_SS = L.Calc(TABLE, "0250010002", "DT rủi ro S+S (tỷ)", "real", "measure", "quantitative",
                   f"SUM(IF {CAO} AND {SS} THEN [RevenueToDate] END) / 1e9", fmt=FMT_TY)
C_RECOVER = L.Calc(TABLE, "0250010003", "Thu hồi 15% (tỷ)", "real", "measure", "quantitative",
                   f"SUM(IF {CAO} AND {SS} THEN [RevenueToDate] END) * 0.15 / 1e9", fmt=FMT_TY)
C_CAO_N = L.Calc(TABLE, "0250010004", "KH nguy cơ Cao", "integer", "measure", "quantitative",
                 f"COUNTD(IF {CAO} THEN [CustomerId] END)", fmt=FMT_INT)

CALCS = [C_RISK, C_RISK_SS, C_RECOVER, C_CAO_N]

KPI_DEFS = [
    ("KPI Risk", C_RISK, "DT rủi ro (churn cao)", L.BAD),
    ("KPI Risk SS", C_RISK_SS, "DT rủi ro Standard+Silver", L.BAD),
    ("KPI Recover", C_RECOVER, "Thu hồi nếu win-back 15%", L.GOOD),
    ("KPI Cao N", C_CAO_N, "KH nguy cơ cao", L.BAD),
]


def build_twb() -> str:
    L.reset_zids()
    sheets = []
    sheet_names = []

    for name, calc, title, color in KPI_DEFS:
        sheets.append(L.kpi_card(name, calc, title, value_color=color, size=26))
        sheet_names.append(name)

    r1 = L.ranking_bar("DT rui ro theo phan khuc", "Doanh thu rủi ro theo phân khúc khách hàng (tỷ)",
                       TABLE, dim_col="Segment", value_calc=C_RISK)
    r2 = L.ranking_bar("NBO nen kich hoat", "Ưu đãi (NextBestOffer) nên kích hoạt cho nhóm nguy cơ cao",
                       TABLE, dim_col="NextBestOffer", value_calc=C_CAO_N)
    sheets += [r1, r2]
    sheet_names += ["DT rui ro theo phan khuc", "NBO nen kich hoat"]

    rows = []
    rows.append(L.title_block("· D5 AI Deep-Dive · Giữ chân & Bán chéo",
                              "Bàn đạp cho Trợ lý AI đề xuất chiến dịch bán lẻ · hỏi: “đề xuất chiến dịch giữ chân”"))
    rows.append(L.hrow([n for n, *_ in KPI_DEFS], h=14000, kpi=True))
    rows.append(_two_panel("DT rui ro theo phan khuc", "NBO nen kich hoat", h=74000))

    dash = L.dashboard(DASH_NAME, rows, width=1560, height=1180)
    return L.workbook([TABLE], CALCS, sheets, sheet_names, dash, DASH_NAME)


def _two_panel(left_sheet, right_sheet, h):
    left = L.leaf(left_sheet, w=45000)
    right = L.leaf(right_sheet, w=55000)
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
            L.render(wb_id, "d5")
