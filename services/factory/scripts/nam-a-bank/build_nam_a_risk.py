#!/usr/bin/env python3
"""Build /tmp/wb-nam-a-risk.twb — Nam A Bank "Rủi ro Tín dụng & NPL Radar" dashboard.

Layout: 5 KPI strip (each 20% wide, h=16000) on top; 6 charts in 2x3 (w=33334, h=42000).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "/tmp")

from nam_a_lib import (  # type: ignore
    DS_NAME,
    calc_name,
    calc_col_ref,
    raw_col,
    inst_dim,
    inst_agg,
    inst_month,
    inst_calc_usr,
    kpi_sheet,
    chart_sheet,
    dashboard_zone,
    dashboard_xml,
    workbook_xml,
)


# ---------------------------------------------------------------------------
# KPI sheets (D2 Risk block: 92000001..92000005)
# ---------------------------------------------------------------------------
KPI_DEFS = [
    ("KPI - Tỷ lệ NPL",       92000001, "Tỷ lệ NPL",       "Tỷ lệ NPL",       "p0.00%"),
    ("KPI - Nợ nhóm 2",       92000002, "Nợ nhóm 2",       "Nợ nhóm 2",       "p0.00%"),
    ("KPI - Bao phủ nợ xấu",  92000003, "Bao phủ nợ xấu",  "LLR / Bao phủ",   "p0.0%"),
    ("KPI - Chi phí rủi ro",  92000004, "Chi phí rủi ro",  "CoR",             "p0.00%"),
    ("KPI - Khách rủi ro",    92000005, "Khách rủi ro",    "Khách rủi ro",    "n#,##0"),
]

kpi_sheets_xml = [
    kpi_sheet(name, cid, cap, title, fmt) for (name, cid, cap, title, fmt) in KPI_DEFS
]
kpi_names = [d[0] for d in KPI_DEFS]


# ---------------------------------------------------------------------------
# Chart 1 — Xu hướng NPL theo tháng (line)
# cols=MONTH([OriginationDate]), rows=Calculation_92000001
# ---------------------------------------------------------------------------
c1_name = "Xu hướng NPL theo tháng"
c1_deps = [
    raw_col("OriginationDate", aggregation="Year", dt="datetime", role="dimension", ct="ordinal"),
    calc_col_ref("Tỷ lệ NPL", 92000001, fmt="p0.00%"),
]
c1_insts = [
    inst_month("OriginationDate"),
    inst_calc_usr(92000001, "qk"),
]
c1_cols = f"[{DS_NAME}].[md:OriginationDate:mn]"
c1_rows = f"[{DS_NAME}].[usr:{calc_name(92000001)}:qk]"
chart1 = chart_sheet(
    name=c1_name,
    title_vn="Xu hướng NPL theo tháng",
    deps=c1_deps,
    insts=c1_insts,
    rows=c1_rows,
    cols=c1_cols,
    mark="Line",
)


# ---------------------------------------------------------------------------
# Chart 2 — NPL theo Sản phẩm (bar)
# rows=[ProductName], cols=Calculation_92000001, color by calc
# ---------------------------------------------------------------------------
c2_name = "NPL theo Sản phẩm"
c2_deps = [
    raw_col("ProductName", aggregation="User", dt="string", role="dimension", ct="nominal"),
    calc_col_ref("Tỷ lệ NPL", 92000001, fmt="p0.00%"),
]
c2_insts = [
    inst_dim("ProductName"),
    inst_calc_usr(92000001, "qk"),
]
c2_rows = f"[{DS_NAME}].[none:ProductName:nk]"
c2_cols = f"[{DS_NAME}].[usr:{calc_name(92000001)}:qk]"
chart2 = chart_sheet(
    name=c2_name,
    title_vn="NPL theo Sản phẩm",
    deps=c2_deps,
    insts=c2_insts,
    rows=c2_rows,
    cols=c2_cols,
    mark="Bar",
    encodings=[f"<color column='[{DS_NAME}].[usr:{calc_name(92000001)}:qk]' />"],
)


# ---------------------------------------------------------------------------
# Chart 3 — Phân bố Trạng thái Khoản vay (donut/pie)
# color=[Status (Loans)], angle=SUM([OutstandingBalance])
# ---------------------------------------------------------------------------
c3_name = "Phân bố Trạng thái Khoản vay"
c3_deps = [
    raw_col("Status (Loans)", aggregation="User", dt="string", role="dimension", ct="nominal"),
    raw_col("OutstandingBalance", aggregation="Sum", dt="real", role="measure", ct="quantitative"),
]
c3_insts = [
    inst_dim("Status (Loans)"),
    inst_agg("OutstandingBalance", "Sum"),
]
chart3 = chart_sheet(
    name=c3_name,
    title_vn="Phân bố Trạng thái Khoản vay",
    deps=c3_deps,
    insts=c3_insts,
    rows="",
    cols="",
    mark="Pie",
    encodings=[
        f"<color column='[{DS_NAME}].[none:Status (Loans):nk]' />",
        f"<angle column='[{DS_NAME}].[sum:OutstandingBalance:qk]' />",
    ],
)


# ---------------------------------------------------------------------------
# Chart 4 — AI Watchlist (bar)
# rows=[CustomerName], cols=AVG([PdScore]), color=[RiskBand], tooltip=[TopReason]
# ---------------------------------------------------------------------------
c4_name = "AI Watchlist"
c4_deps = [
    raw_col("CustomerName", aggregation="User", dt="string", role="dimension", ct="nominal"),
    raw_col("PdScore", aggregation="Avg", dt="real", role="measure", ct="quantitative"),
    raw_col("RiskBand", aggregation="User", dt="string", role="dimension", ct="nominal"),
    raw_col("TopReason", aggregation="User", dt="string", role="dimension", ct="nominal"),
]
c4_insts = [
    inst_dim("CustomerName"),
    inst_agg("PdScore", "Avg"),
    inst_dim("RiskBand"),
    inst_dim("TopReason"),
]
c4_rows = f"[{DS_NAME}].[none:CustomerName:nk]"
c4_cols = f"[{DS_NAME}].[avg:PdScore:qk]"
chart4 = chart_sheet(
    name=c4_name,
    title_vn="AI Watchlist",
    deps=c4_deps,
    insts=c4_insts,
    rows=c4_rows,
    cols=c4_cols,
    mark="Bar",
    encodings=[
        f"<color column='[{DS_NAME}].[none:RiskBand:nk]' />",
        f"<tooltip column='[{DS_NAME}].[none:TopReason:nk]' />",
    ],
)


# ---------------------------------------------------------------------------
# Chart 5 — Phân bố Days Past Due (histogram bar)
# cols=AVG([DaysPastDue]), rows=CNT([LoanId])
# ---------------------------------------------------------------------------
c5_name = "Phân bố Days Past Due"
c5_deps = [
    raw_col("DaysPastDue", aggregation="Avg", dt="integer", role="measure", ct="quantitative"),
    raw_col("LoanId", aggregation="Count", dt="string", role="measure", ct="quantitative"),
]
c5_insts = [
    inst_agg("DaysPastDue", "Avg"),
    inst_agg("LoanId", "Cnt"),
]
c5_cols = f"[{DS_NAME}].[avg:DaysPastDue:qk]"
c5_rows = f"[{DS_NAME}].[cnt:LoanId:qk]"
chart5 = chart_sheet(
    name=c5_name,
    title_vn="Phân bố Days Past Due",
    deps=c5_deps,
    insts=c5_insts,
    rows=c5_rows,
    cols=c5_cols,
    mark="Bar",
)


# ---------------------------------------------------------------------------
# Chart 6 — Phân bố Nhóm Rủi ro AI (bar)
# rows=[RiskBand], cols=CNTD([CustomerId (RiskScores)])
# ---------------------------------------------------------------------------
c6_name = "Phân bố Nhóm Rủi ro AI"
c6_deps = [
    raw_col("RiskBand", aggregation="User", dt="string", role="dimension", ct="nominal"),
    raw_col("CustomerId (RiskScores)", aggregation="CntD", dt="string", role="measure", ct="quantitative"),
]
c6_insts = [
    inst_dim("RiskBand"),
    inst_agg("CustomerId (RiskScores)", "CntD"),
]
c6_rows = f"[{DS_NAME}].[none:RiskBand:nk]"
c6_cols = f"[{DS_NAME}].[cntd:CustomerId (RiskScores):qk]"
chart6 = chart_sheet(
    name=c6_name,
    title_vn="Phân bố Nhóm Rủi ro AI",
    deps=c6_deps,
    insts=c6_insts,
    rows=c6_rows,
    cols=c6_cols,
    mark="Bar",
)


chart_sheets_xml = [chart1, chart2, chart3, chart4, chart5, chart6]
chart_names = [c1_name, c2_name, c3_name, c4_name, c5_name, c6_name]


# ---------------------------------------------------------------------------
# Dashboard layout
#   Grid: total width = 100000, height = 100000 (Tableau logical units).
#   KPI strip: y=0, h=16000, each w=20000 (5 * 20000 = 100000)
#   Charts 2x3: start y=16000, w=33334, h=42000
#      row 1 y=16000  (h=42000)
#      row 2 y=58000  (h=42000) -> ends at 100000
#      col 1 x=0, col 2 x=33333, col 3 x=66666
# ---------------------------------------------------------------------------
zones = []
zid = 100

# KPI strip
for i, kname in enumerate(kpi_names):
    zones.append(dashboard_zone(zid, kname, x=i * 20000, y=0, w=20000, h=16000))
    zid += 1

# 6 charts in 2x3
chart_positions = [
    (0,        16000),
    (33333,    16000),
    (66666,    16000),
    (0,        58000),
    (33333,    58000),
    (66666,    58000),
]
for (x, y), cname in zip(chart_positions, chart_names):
    zones.append(dashboard_zone(zid, cname, x=x, y=y, w=33334, h=42000))
    zid += 1


dash_name = "Rủi ro Tín dụng & NPL Radar"
dash_body = dashboard_xml(dash_name, zones)

all_sheets_xml = kpi_sheets_xml + chart_sheets_xml
all_sheet_names = kpi_names + chart_names

wb = workbook_xml(
    sheets_xml=all_sheets_xml,
    sheet_names=all_sheet_names,
    dashboard_xml=dash_body,
    dash_names=[dash_name],
)

out = Path("/tmp/wb-nam-a-risk.twb")
out.write_text(wb, encoding="utf-8")
print(f"Wrote {out} ({len(wb):,} bytes)")
