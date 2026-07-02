"""
build_nam_a_deposit.py - Build the Nam A Bank Huy động & Cross-sell dashboard.

Uses /tmp/nam_a_lib.py helpers. Produces /tmp/wb-nam-a-deposit.twb.

Dashboard: Huy động & Cross-sell Happy Combo
  5 KPIs:
    - Tổng huy động       (91000002)
    - Tỷ lệ CASA          (93000001)
    - Số SP/KH            (93000002)
    - Doanh thu NBO       (93000003)
    - MAU Digital         (94000001)
  6 charts:
    1. CASA vs Term       (donut; color ProductSubGroup, angle SUM(Balance))
    2. Segment × Product  (heatmap; rows SegmentVN, cols ProductGroup,
                           color CNTD(AccountId))
    3. Phân bố NBO        (bar; rows OfferName, cols CNTD(CustomerId NBO))
    4. NBO Loại chiến dịch(bar; rows OfferCategory, cols SUM(EstimatedRevenue))
    5. Khách theo Segment (horizontal bar; rows SegmentVN,
                           cols CNTD(CustomerId Customers), color SegmentVN)
    6. Happy Combo        (bar; rows HappyComboEnrolled,
                           cols CNTD(CustomerId Customers))

Layout (1400x800 dashboard basic grid ~ 100 units w/h → we use w=20 per KPI):
  KPI strip:  y=0..h_kpi        (5 zones side-by-side, w=20 each)
  6 charts:   2 columns x 3 rows below KPI strip.

The task specifies "h=16000" for the KPI strip and w=20% each. In this
codebase (see MediaMart pattern) dashboard zones use hundredths, so KPI
h=16 (out of 100). We keep the requested h=16 semantics as h=16 units.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "/tmp")
from nam_a_lib import (  # type: ignore
    DS_NAME,
    calc_name,
    kpi_sheet,
    chart_sheet,
    raw_col,
    calc_col_ref,
    inst_dim,
    inst_agg,
    inst_calc_usr,
    dashboard_zone,
    dashboard_xml,
    workbook_xml,
)


# ---------------------------------------------------------------------------
# KPI worksheets
# ---------------------------------------------------------------------------

kpi_specs = [
    # (sheet_name, calc_id, caption, title_vn, fmt)
    ("KPI Tổng huy động", 91000002, "Tổng huy động",
     "Tổng huy động", 'n#,##0,,,.0B" ₫"'),
    ("KPI Tỷ lệ CASA", 93000001, "Tỷ lệ CASA",
     "Tỷ lệ CASA", "p0.00%"),
    ("KPI Số SP-KH", 93000002, "Số SP/khách hàng",
     "Số SP/KH", "0.00"),
    ("KPI Doanh thu NBO", 93000003, "Doanh thu NBO ước tính",
     "Doanh thu NBO", 'n#,##0,,,.0B" ₫"'),
    ("KPI MAU Digital", 94000001, "MAU Digital",
     "MAU Digital", "n#,##0"),
]

kpi_sheets = [kpi_sheet(n, cid, cap, ttl, fmt)
              for (n, cid, cap, ttl, fmt) in kpi_specs]
kpi_names = [n for (n, *_r) in kpi_specs]


# ---------------------------------------------------------------------------
# Chart worksheets
# ---------------------------------------------------------------------------

# --- 1. Donut: CASA vs Term ---
# Pie mark with color=ProductSubGroup, angle=SUM(Balance).
donut_deps = [
    raw_col("ProductSubGroup", aggregation="Count", dt="string",
            role="dimension", ct="nominal", caption="Product Sub Group"),
    raw_col("Balance", aggregation="Sum", dt="real",
            role="measure", ct="quantitative"),
]
donut_insts = [
    inst_dim("ProductSubGroup"),
    inst_agg("Balance", "Sum"),
]
donut_encodings = [
    f"<color column='[{DS_NAME}].[none:ProductSubGroup:nk]' />",
    f"<size column='[{DS_NAME}].[sum:Balance:qk]' />",
]
donut_sheet = chart_sheet(
    name="Donut CASA vs Term",
    title_vn="CASA vs Term",
    deps=donut_deps,
    insts=donut_insts,
    rows="",
    cols="",
    mark="Pie",
    encodings=donut_encodings,
)

# --- 2. Heatmap: SegmentVN x ProductGroup, color CNTD(AccountId) ---
# AccountId is the aggregate cell metric — use Accounts join column.
heat_deps = [
    raw_col("SegmentVN", aggregation="Count", dt="string",
            role="dimension", ct="nominal", caption="Segment VN"),
    raw_col("ProductGroup", aggregation="Count", dt="string",
            role="dimension", ct="nominal", caption="Product Group"),
    raw_col("AccountId (Accounts)", aggregation="Count", dt="integer",
            role="dimension", ct="ordinal"),
]
heat_insts = [
    inst_dim("SegmentVN"),
    inst_dim("ProductGroup"),
    (
        f"            <column-instance column='[AccountId (Accounts)]' "
        f"derivation='CountD' name='[ctd:AccountId (Accounts):qk]' "
        f"pivot='key' type='quantitative' />"
    ),
]
heat_encodings = [
    f"<color column='[{DS_NAME}].[ctd:AccountId (Accounts):qk]' />",
]
heatmap_sheet = chart_sheet(
    name="Heatmap Segment x Product",
    title_vn="Ma trận Cross-sell Segment × Sản phẩm",
    deps=heat_deps,
    insts=heat_insts,
    rows=f"[{DS_NAME}].[none:SegmentVN:nk]",
    cols=f"[{DS_NAME}].[none:ProductGroup:nk]",
    mark="Square",
    encodings=heat_encodings,
)

# --- 3. Bar: OfferName x CNTD(CustomerId (NBORecommendations)) ---
nbo_dist_deps = [
    raw_col("OfferName", aggregation="Count", dt="string",
            role="dimension", ct="nominal", caption="Offer Name"),
    raw_col("CustomerId (NBORecommendations)", aggregation="Count",
            dt="integer", role="dimension", ct="ordinal"),
]
nbo_dist_insts = [
    inst_dim("OfferName"),
    (
        f"            <column-instance column='[CustomerId (NBORecommendations)]' "
        f"derivation='CountD' name='[ctd:CustomerId (NBORecommendations):qk]' "
        f"pivot='key' type='quantitative' />"
    ),
]
nbo_dist_sheet = chart_sheet(
    name="Bar NBO Phan bo",
    title_vn="Phân bố Đề xuất NBO",
    deps=nbo_dist_deps,
    insts=nbo_dist_insts,
    rows=f"[{DS_NAME}].[none:OfferName:nk]",
    cols=f"[{DS_NAME}].[ctd:CustomerId (NBORecommendations):qk]",
    mark="Bar",
    encodings=None,
)

# --- 4. Bar: OfferCategory x SUM(EstimatedRevenue) ---
nbo_cat_deps = [
    raw_col("OfferCategory", aggregation="Count", dt="string",
            role="dimension", ct="nominal", caption="Offer Category"),
    raw_col("EstimatedRevenue", aggregation="Sum", dt="real",
            role="measure", ct="quantitative", caption="Estimated Revenue"),
]
nbo_cat_insts = [
    inst_dim("OfferCategory"),
    inst_agg("EstimatedRevenue", "Sum"),
]
nbo_cat_sheet = chart_sheet(
    name="Bar NBO Loai",
    title_vn="NBO theo Loại chiến dịch",
    deps=nbo_cat_deps,
    insts=nbo_cat_insts,
    rows=f"[{DS_NAME}].[none:OfferCategory:nk]",
    cols=f"[{DS_NAME}].[sum:EstimatedRevenue:qk]",
    mark="Bar",
    encodings=None,
)

# --- 5. Horizontal bar: SegmentVN, CNTD(CustomerId (Customers)),
#        color SegmentVN ---
seg_deps = [
    raw_col("SegmentVN", aggregation="Count", dt="string",
            role="dimension", ct="nominal", caption="Segment VN"),
    raw_col("CustomerId (Customers)", aggregation="Count",
            dt="integer", role="dimension", ct="ordinal"),
]
seg_insts = [
    inst_dim("SegmentVN"),
    (
        f"            <column-instance column='[CustomerId (Customers)]' "
        f"derivation='CountD' name='[ctd:CustomerId (Customers):qk]' "
        f"pivot='key' type='quantitative' />"
    ),
]
seg_encodings = [
    f"<color column='[{DS_NAME}].[none:SegmentVN:nk]' />",
]
segment_sheet = chart_sheet(
    name="Bar Khach theo Segment",
    title_vn="Khách hàng theo Phân khúc",
    deps=seg_deps,
    insts=seg_insts,
    rows=f"[{DS_NAME}].[none:SegmentVN:nk]",
    cols=f"[{DS_NAME}].[ctd:CustomerId (Customers):qk]",
    mark="Bar",
    encodings=seg_encodings,
)

# --- 6. Bar: HappyComboEnrolled x CNTD(CustomerId (Customers)) ---
happy_deps = [
    raw_col("HappyComboEnrolled", aggregation="Count", dt="boolean",
            role="dimension", ct="nominal", caption="Happy Combo Enrolled"),
    raw_col("CustomerId (Customers)", aggregation="Count",
            dt="integer", role="dimension", ct="ordinal"),
]
happy_insts = [
    inst_dim("HappyComboEnrolled"),
    (
        f"            <column-instance column='[CustomerId (Customers)]' "
        f"derivation='CountD' name='[ctd:CustomerId (Customers):qk]' "
        f"pivot='key' type='quantitative' />"
    ),
]
happy_sheet = chart_sheet(
    name="Bar Happy Combo",
    title_vn="Khách Happy Combo",
    deps=happy_deps,
    insts=happy_insts,
    rows=f"[{DS_NAME}].[none:HappyComboEnrolled:nk]",
    cols=f"[{DS_NAME}].[ctd:CustomerId (Customers):qk]",
    mark="Bar",
    encodings=None,
)


chart_sheets = [
    donut_sheet,
    heatmap_sheet,
    nbo_dist_sheet,
    nbo_cat_sheet,
    segment_sheet,
    happy_sheet,
]
chart_names = [
    "Donut CASA vs Term",
    "Heatmap Segment x Product",
    "Bar NBO Phan bo",
    "Bar NBO Loai",
    "Bar Khach theo Segment",
    "Bar Happy Combo",
]

all_sheets = kpi_sheets + chart_sheets
all_sheet_names = kpi_names + chart_names


# ---------------------------------------------------------------------------
# Dashboard layout
# ---------------------------------------------------------------------------
# Dashboard box is 100 x 100 hundredths. KPI strip y=0..16, each w=20.
# Below: y=16..100 → 84 units for 3 rows of charts. Rows h=28 each,
# cols w=50 each.
H_KPI = 16
H_CHART_ROW = (100 - H_KPI) // 3  # 28
W_CHART = 50

zones = []
zid = 10
# KPI strip
for i, name in enumerate(kpi_names):
    zones.append(dashboard_zone(zid, name, x=i * 20, y=0, w=20, h=H_KPI))
    zid += 1

# Chart grid: 2 cols x 3 rows
for i, name in enumerate(chart_names):
    row = i // 2
    col = i % 2
    x = col * W_CHART
    y = H_KPI + row * H_CHART_ROW
    zones.append(dashboard_zone(zid, name,
                                x=x, y=y, w=W_CHART, h=H_CHART_ROW))
    zid += 1

DASH_NAME = "Huy động & Cross-sell Happy Combo"
dash_body = dashboard_xml(DASH_NAME, zones)


# ---------------------------------------------------------------------------
# Assemble workbook
# ---------------------------------------------------------------------------

wb = workbook_xml(
    sheets_xml=all_sheets,
    sheet_names=all_sheet_names,
    dashboard_xml=dash_body,
    dash_names=[DASH_NAME],
)

out_path = Path("/tmp/wb-nam-a-deposit.twb")
out_path.write_text(wb, encoding="utf-8")
print(f"Wrote {out_path} ({len(wb):,} chars)")

# Quick verification: parse the XML.
import xml.etree.ElementTree as ET
try:
    root = ET.fromstring(wb)
except ET.ParseError as e:
    print(f"PARSE ERROR: {e}")
    raise SystemExit(1)

# Count structural elements.
ws = root.findall(".//worksheet")
db = root.findall(".//dashboard")
print(f"Worksheets: {len(ws)} (expected {len(all_sheet_names)})")
print(f"Dashboards: {len(db)} (expected 1)")

# Verify each expected sheet appears.
found_names = {w.get("name") for w in ws}
missing = [n for n in all_sheet_names if n not in found_names]
if missing:
    print(f"Missing worksheets: {missing}")
    raise SystemExit(1)

# Verify each dashboard zone points to a real sheet.
zone_names = {z.get("name") for z in root.findall(".//zone[@name]")}
missing_zones = [n for n in all_sheet_names if n not in zone_names]
if missing_zones:
    print(f"Missing dashboard zone for: {missing_zones}")
    raise SystemExit(1)

# Verify all 5 KPI calc ids appear in the datasource.
wb_text = wb
for cid in (91000002, 93000001, 93000002, 93000003, 94000001):
    cname = calc_name(cid)
    if cname not in wb_text:
        print(f"MISSING calc {cname} in workbook")
        raise SystemExit(1)

print("OK: workbook is well-formed and complete.")
