"""
build_nam_a_portfolio.py

Builds /tmp/wb-nam-a-portfolio.twb — a single-dashboard Nam A Bank retail
portfolio overview using the nam_a_lib helpers.

Dashboard: "Tổng quan Ngân hàng Bán lẻ"
  Top strip : 5 KPI cards (Tổng dư nợ, Tổng huy động, LDR, Số KH bán lẻ, Số CN)
  Grid 2x3  : 6 charts
    1. Dư nợ theo Sản phẩm   — bar, rows=[ProductName], cols=SUM([OutstandingBalance])
    2. Huy động theo Kỳ hạn  — bar, rows=[ProductSubGroup], cols=SUM(IF ProductGroup='Deposit' Balance)
    3. Bản đồ Dư nợ theo Tỉnh — symbol map, Avg(Lat) x Avg(Long), size=SUM(OB), detail=[Province (Branches)]
    4. Dư nợ theo Miền        — bar, rows=[Region (Branches)], cols=SUM([OutstandingBalance])
    5. Top Chi nhánh          — bar, rows=[BranchName], cols=SUM([OutstandingBalance])
    6. Chi nhánh vs ONEBANK   — bar, rows=[BranchType], cnt([BranchId (Branches)])
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "/tmp")

import nam_a_lib as lib
from nam_a_lib import (
    DS_NAME,
    calc_name,
    kpi_sheet,
    chart_sheet,
    raw_col,
    inst_dim,
    inst_agg,
    dashboard_zone,
    dashboard_xml,
    workbook_xml,
)

OUT_PATH = Path("/tmp/wb-nam-a-portfolio.twb")


# ---------------------------------------------------------------------------
# Sheet definitions
# ---------------------------------------------------------------------------

def build_kpi_sheets():
    """5 KPI cards."""
    specs = [
        # (sheet_name, calc_id, caption, title_vn, fmt)
        ("KPI Tổng dư nợ", 91000001, "Tổng dư nợ bán lẻ",
         "Tổng dư nợ bán lẻ", 'n#,##0,,,.0B" ₫";-#,##0,,,.0B" ₫"'),
        ("KPI Tổng huy động", 91000002, "Tổng huy động",
         "Tổng huy động", 'n#,##0,,,.0B" ₫"'),
        ("KPI LDR", 91000003, "LDR",
         "LDR", "p0.0%"),
        ("KPI Số khách hàng bán lẻ", 91000004, "Số khách hàng bán lẻ",
         "Số khách hàng bán lẻ", "n#,##0"),
        ("KPI Số chi nhánh", 91000005, "Số chi nhánh",
         "Số chi nhánh", "n#,##0"),
    ]
    sheets = [kpi_sheet(*s) for s in specs]
    names = [s[0] for s in specs]
    return sheets, names


def sheet_du_no_theo_san_pham():
    """Chart 1: bar chart, rows=[ProductName], cols=SUM([OutstandingBalance])
    — WITH the raw datasource-dependency column for OutstandingBalance."""
    name = "Dư nợ theo Sản phẩm"
    deps = [
        raw_col("ProductName", aggregation="Count", dt="string", role="dimension"),
        raw_col("OutstandingBalance", aggregation="Sum", dt="real", role="measure"),
    ]
    insts = [
        inst_dim("ProductName"),
        inst_agg("OutstandingBalance", agg="Sum"),
    ]
    rows = f"[{DS_NAME}].[none:ProductName:nk]"
    cols = f"[{DS_NAME}].[sum:OutstandingBalance:qk]"
    return chart_sheet(name, name, deps, insts, rows, cols, mark="Bar"), name


def sheet_huy_dong_theo_ky_han():
    """Chart 2: bar chart, rows=[ProductSubGroup],
    cols=SUM(IF ProductGroup='Deposit' THEN Balance END).

    We register a lightweight user calc INLINE by using calc id 91000010 that
    is NOT in the registry — instead we rely on the datasource-dependency
    inline form: emit a <column> with an embedded <calculation> for the
    aggregate. The clean way is to use one of the existing registered
    calcs — Tổng huy động (91000002) already computes SUM(IF ProductGroup=
    'Deposit' THEN Balance END), so we reuse it."""
    name = "Huy động theo Kỳ hạn"
    calc_id = 91000002  # Tổng huy động
    calc = calc_name(calc_id)
    deps = [
        raw_col("ProductSubGroup", aggregation="Count", dt="string", role="dimension"),
        # Reference the pre-registered calc (formula lives on the datasource).
        f"            <column caption='Tổng huy động' datatype='real' "
        f"default-format='n#,##0,,,.0B&quot; ₫&quot;' name='[{calc}]' "
        f"role='measure' type='quantitative' />",
    ]
    insts = [
        inst_dim("ProductSubGroup"),
        f"            <column-instance column='[{calc}]' derivation='User' "
        f"name='[usr:{calc}:qk]' pivot='key' type='quantitative' />",
    ]
    rows = f"[{DS_NAME}].[none:ProductSubGroup:nk]"
    cols = f"[{DS_NAME}].[usr:{calc}:qk]"
    return chart_sheet(name, name, deps, insts, rows, cols, mark="Bar"), name


def sheet_ban_do_du_no():
    """Chart 3: symbol map. AVG(Latitude) x AVG(Longitude),
    size = SUM([OutstandingBalance]), detail = [Province (Branches)]."""
    name = "Bản đồ Dư nợ theo Tỉnh"
    deps = [
        raw_col("Latitude", aggregation="Avg", dt="real", role="measure"),
        raw_col("Longitude", aggregation="Avg", dt="real", role="measure"),
        raw_col("OutstandingBalance", aggregation="Sum", dt="real", role="measure"),
        raw_col("Province (Branches)", aggregation="Count", dt="string", role="dimension"),
    ]
    insts = [
        inst_agg("Latitude", agg="Avg"),
        inst_agg("Longitude", agg="Avg"),
        inst_agg("OutstandingBalance", agg="Sum"),
        inst_dim("Province (Branches)"),
    ]
    # Map convention: Longitude on cols, Latitude on rows.
    rows = f"[{DS_NAME}].[avg:Latitude:qk]"
    cols = f"[{DS_NAME}].[avg:Longitude:qk]"
    encodings = [
        f"<size column='[{DS_NAME}].[sum:OutstandingBalance:qk]' />",
        f"<detail column='[{DS_NAME}].[none:Province (Branches):nk]' />",
    ]
    return chart_sheet(name, name, deps, insts, rows, cols,
                       mark="Shape", encodings=encodings), name


def sheet_du_no_theo_mien():
    """Chart 4: bar, rows=[Region (Branches)], cols=SUM([OutstandingBalance])."""
    name = "Dư nợ theo Miền"
    deps = [
        raw_col("Region (Branches)", aggregation="Count", dt="string", role="dimension"),
        raw_col("OutstandingBalance", aggregation="Sum", dt="real", role="measure"),
    ]
    insts = [
        inst_dim("Region (Branches)"),
        inst_agg("OutstandingBalance", agg="Sum"),
    ]
    rows = f"[{DS_NAME}].[none:Region (Branches):nk]"
    cols = f"[{DS_NAME}].[sum:OutstandingBalance:qk]"
    return chart_sheet(name, name, deps, insts, rows, cols, mark="Bar"), name


def sheet_top_chi_nhanh():
    """Chart 5: bar top-N, rows=[BranchName], cols=SUM([OutstandingBalance])."""
    name = "Top Chi nhánh"
    deps = [
        raw_col("BranchName", aggregation="Count", dt="string", role="dimension"),
        raw_col("OutstandingBalance", aggregation="Sum", dt="real", role="measure"),
    ]
    insts = [
        inst_dim("BranchName"),
        inst_agg("OutstandingBalance", agg="Sum"),
    ]
    rows = f"[{DS_NAME}].[none:BranchName:nk]"
    cols = f"[{DS_NAME}].[sum:OutstandingBalance:qk]"
    return chart_sheet(name, name, deps, insts, rows, cols, mark="Bar"), name


def sheet_chi_nhanh_vs_onebank():
    """Chart 6: bar, rows=[BranchType], cols=CNT([BranchId (Branches)])."""
    name = "Chi nhánh vs ONEBANK"
    deps = [
        raw_col("BranchType", aggregation="Count", dt="string", role="dimension"),
        raw_col("BranchId (Branches)", aggregation="Count", dt="string", role="dimension"),
    ]
    insts = [
        inst_dim("BranchType"),
        # Count of BranchId — use aggregation="Count" on a dimension field.
        f"            <column-instance column='[BranchId (Branches)]' derivation='Count' "
        f"name='[cnt:BranchId (Branches):qk]' pivot='key' type='quantitative' />",
    ]
    rows = f"[{DS_NAME}].[none:BranchType:nk]"
    cols = f"[{DS_NAME}].[cnt:BranchId (Branches):qk]"
    return chart_sheet(name, name, deps, insts, rows, cols, mark="Bar"), name


# ---------------------------------------------------------------------------
# Dashboard layout
# ---------------------------------------------------------------------------

def build_dashboard(kpi_names, chart_names):
    """Layout:
      Top strip: 5 KPIs, each 20% width, h=16000 (rows).
      Grid 2x3: 6 charts, w=33333, h=42000 each.
    Coordinate space: 100000 x 100000 typical Tableau dashboard zone units,
    but the outer zone here uses 100 x 100 with the parent size 1400x800.
    We'll place zones within the outer 100x100 layout box.
    """
    # Per task: KPI height 16000, chart rows h=42000, width 33333. That's
    # in Tableau's 100000-unit coordinate space (dashboard internal units).
    # But our outer zone uses w=100 h=100 (percentage). Tableau still supports
    # child-zone x/y/w/h in the 100000 scale even when parent is 100 — but
    # the safe idiom is to keep parent-child in the same scale. We'll flip
    # the outer container to 100000 units.
    #
    # For simplicity, keep the parent 100x100 and use proportional child
    # sizing: KPI strip h=16 (of 100), grid rows h=42 each -> ~84 total,
    # matching 100 total. Widths: 5 x 20 = 100 for KPI, 3 x 33 for grid.
    zones = []
    zid = 10

    # ---- KPI strip: y=0, h=16, x=0/20/40/60/80, w=20 each ----
    for i, name in enumerate(kpi_names):
        zones.append(dashboard_zone(zid, name, x=i * 20, y=0, w=20, h=16))
        zid += 1

    # ---- 2x3 chart grid: 6 charts, starting y=16 ----
    # Rows: y=16 and y=58 (each 42 tall).
    # Cols: x=0, 33, 66 (widths 33, 33, 34 to sum to 100).
    grid_positions = [
        (0, 16, 33), (33, 16, 33), (66, 16, 34),
        (0, 58, 33), (33, 58, 33), (66, 58, 34),
    ]
    for name, (x, y, w) in zip(chart_names, grid_positions):
        zones.append(dashboard_zone(zid, name, x=x, y=y, w=w, h=42))
        zid += 1

    return dashboard_xml("Tổng quan Ngân hàng Bán lẻ", zones)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # KPIs.
    kpi_sheets, kpi_names = build_kpi_sheets()

    # Charts.
    chart_builders = [
        sheet_du_no_theo_san_pham,
        sheet_huy_dong_theo_ky_han,
        sheet_ban_do_du_no,
        sheet_du_no_theo_mien,
        sheet_top_chi_nhanh,
        sheet_chi_nhanh_vs_onebank,
    ]
    chart_sheets = []
    chart_names = []
    for fn in chart_builders:
        s, n = fn()
        chart_sheets.append(s)
        chart_names.append(n)

    all_sheets = kpi_sheets + chart_sheets
    all_names = kpi_names + chart_names

    dash_xml = build_dashboard(kpi_names, chart_names)
    dash_name = "Tổng quan Ngân hàng Bán lẻ"

    wb = workbook_xml(
        sheets_xml=all_sheets,
        sheet_names=all_names,
        dashboard_xml=dash_xml,
        dash_names=[dash_name],
    )

    OUT_PATH.write_text(wb, encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size // 1024
    print(f"Wrote {OUT_PATH} ({size_kb} KB, {len(all_sheets)} sheets, 1 dashboard)")


if __name__ == "__main__":
    main()
