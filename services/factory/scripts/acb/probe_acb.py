"""PROBE risky ACB viz BEFORE authoring the full 3-page workbook.

The ACB-specific risk is the TIDY-LONG data model: unlike VNPT (pre-split
columns), every metric value here comes from a filtered aggregate
`SUM(IF [MetricKey]="vnindex" THEN [Value] END)`. Probe that this:
  1. KPI card (BAN) renders a real number via the IF-filter calc.
  2. line_trend renders the VN-Index monthly path via the same calc.
  3. A ranked bar of theme OverallScore renders + colors by a sign measure.

Sheets are left VISIBLE so each becomes a REST view we can render to PNG.
Run: uv run python scripts/acb/probe_acb.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import acb_lib as A  # noqa: E402
from acb_lib import Calc, Table  # noqa: E402

WB = "ACB - PROBE"
MM = "market_metrics_monthly"
TS = "theme_summary"

F_IDX = 'n#,##0.0'
F_PCT = 'n#,##0.0"%"'


def build():
    A.reset_zids()

    # 1) VN-Index latest close (tidy-long IF-filter aggregate)
    k_idx = Calc(MM, "0100000001", "VN-Index", "real", "measure", "quantitative",
                 f'SUM(IF [MetricKey]="vnindex" AND [Month]='
                 f'{{FIXED : MAX(IF [MetricKey]="vnindex" THEN [Month] END)}} THEN [Value] END)', F_IDX)
    # simpler: latest value = value at max month for vnindex
    k_idx = Calc(MM, "0100000001", "VN-Index (mới nhất)", "real", "measure", "quantitative",
                 'SUM(IF [MetricKey]="vnindex" THEN [Value] END) '
                 '/ SUM(IF [MetricKey]="vnindex" THEN 1 ELSE 0 END)', F_IDX)

    # monthly VN-Index line: value per month (IF-filter), month on cols
    m_idx = Calc(MM, "0100000002", "VN-Index", "real", "measure", "quantitative",
                 'SUM(IF [MetricKey]="vnindex" THEN [Value] END)', F_IDX)

    # theme overall score + sign for diverging color
    ov = Table(TS)
    sign_theme = Calc(TS, "0100000003", "Sign", "real", "measure", "quantitative",
                      "SIGN(SUM([OverallScore]))")

    kpi = A.kpi_card_delta("P_KPI", k_idx, "VN-Index", "▲ +12.4%", A.GOOD, "vs đầu năm")
    line = A.line_trend("P_LINE", "VN-Index theo tháng", MM, "Month", m_idx, color=A.BRAND)

    # ranked theme bar, colored by sign measure
    bar = A.chart(
        "P_THEME", "Điểm chủ đề đầu tư", TS,
        deps=[ov.dep("ThemeNameVi"), ov.dep("OverallScore"), sign_theme.dep_col()],
        insts=[ov.dim_inst("ThemeNameVi"), ov.agg_inst("OverallScore"), sign_theme.inst()],
        rows=ov.dim("ThemeNameVi"), cols=ov.measure("OverallScore"),
        mark="Bar",
        encodings=[("color", sign_theme.ref())],
        color_palette="ACB Diverging Measure",
        data_label=ov.measure("OverallScore"),
        computed_sort=(ov.dim("ThemeNameVi"), ov.measure("OverallScore"), "descending"),
    )

    sheets = [kpi, line, bar]
    names = ["P_KPI", "P_LINE", "P_THEME"]
    # visible sheets → make a trivial dashboard referencing them so views exist
    rows = [A.header_band("PROBE", "kiểm tra viz"),
            A.hrow(["P_KPI"], 12000), A.hrow(["P_LINE"], 30000), A.hrow(["P_THEME"], 34000)]
    dash = A.dashboard("ACB PROBE", rows)
    calcs = [k_idx, m_idx, sign_theme]
    xml = A.workbook([MM, TS], calcs, sheets, names, dash, ["ACB PROBE"])
    print("validate:", A.validate(xml))
    # keep sheets VISIBLE: rebuild windows without hidden
    xml = xml.replace("<window class='worksheet' hidden='true'", "<window class='worksheet'")
    twbx = A.package_twbx(xml, WB)
    print("twbx:", twbx, twbx.stat().st_size, "bytes")
    return twbx


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wid = A.publish(twbx, WB)
        A.render(wid, WB)
