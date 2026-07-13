"""Probe 2 — confirm the FIXES before baking into the dashboard:
  - diverging_month_bar with a SIGN MEASURE color driver (measure pills bind)
  - ranked horizontal service-revenue bar (replaces the cramped donut)
Run: uv run python scripts/vnpt/probe2.py --publish
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vnpt_lib as V
from vnpt_lib import Calc, Table

CY = 2025


def build():
    V.reset_zids()
    MS = Table("MonthlyService")

    # net adds diverging (sign as a MEASURE: SIGN(SUM(NetAdds)))
    net = Calc("MonthlyTotals", "9100020", "Phát triển ròng", "integer", "measure", "quantitative",
               "SUM([NetAdds])", "n#,##0")
    net_k = Calc("MonthlyTotals", "9100021", "Ròng (nghìn)", "real", "measure", "quantitative",
                 "SUM([NetAdds])/1000", 'n#,##0"K"')
    sign = Calc("MonthlyTotals", "9100022", "Chiều", "real", "measure", "quantitative",
                "SIGN(SUM([NetAdds]))", "n#,##0")

    # ranked service revenue bar (CY 2025)
    s_rev = Calc("MonthlyService", "9100010", "Doanh thu 2025", "real", "measure", "quantitative",
                 f"SUM(IF [Year]={CY} THEN [RevenueVnd] END)", 'n#,##0,,,.1"T ₫"')

    calcs = [net, net_k, sign, s_rev]

    sheets = []
    sheets.append(V.diverging_month_bar("P2 Net adds", "Phát triển thuê bao ròng theo tháng (nghìn TB)",
                                        "MonthlyTotals", "Month", net, sign, label_calc=net_k))
    sheets.append(V.chart(
        "P2 Service bar", "Doanh thu theo dịch vụ 2025", "MonthlyService",
        deps=[MS.dep("ServiceName", caption="Dịch vụ"), s_rev.dep_col().strip()],
        insts=[MS.dim_inst("ServiceName"), s_rev.inst().strip()],
        rows=MS.dim("ServiceName"), cols=s_rev.ref(), mark="Bar",
        encodings=[("color", s_rev.ref())], color_palette="VNPT Sequential Blue",
        data_label=s_rev.ref(), computed_sort=(MS.dim("ServiceName"), s_rev.ref(), "DESC"),
        bar_size=0.7))

    names = ["P2 Net adds", "P2 Service bar"]
    dash = V.dashboard("VNPT - PROBE2", [
        V.header_band("PROBE2", "kiểm tra fix"),
        V.hrow(["P2 Net adds"], 42000, minw=200),
        V.hrow(["P2 Service bar"], 42000, minw=200),
    ], height=1160)
    xml = V.workbook(["MonthlyTotals", "MonthlyService"], calcs, sheets, names, dash, "VNPT - PROBE2")
    xml = xml.replace("<window class='worksheet' hidden='true'", "<window class='worksheet'")
    print(f"PROBE2: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VNPT - PROBE2")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VNPT - PROBE2")
        V.render(wb_id, "probe2")
