"""Probe the RISKY VNPT vizzes on the extract path BEFORE building the dashboard:
  - map_custom  (own Lat/Lon as geo fields → one dot per province, sized/colored)
  - map_geocoded (province name → generated lat/long)   [comparison]
  - donut       (revenue mix by service)
  - diverging_month_bar (net adds green/red)
Publishes a workbook with these sheets VISIBLE (not hidden) so each is exposed as
a REST view, renders each to PNG. Inspect the PNGs to pick what works.

Run: uv run python scripts/vnpt/probe_extract.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vnpt_lib as V
from vnpt_lib import Calc, Table

CY = 2025


def build():
    V.reset_zids()
    PS = Table("ProvinceSummary")
    MS = Table("MonthlyService")
    MT = Table("MonthlyTotals")

    # ── map size/color calcs (ProvinceSummary) ──
    p_rev = Calc("ProvinceSummary", "9000001", "Doanh thu", "real", "measure", "quantitative",
                 "SUM([RevenueVnd])", 'n#,##0,,,.1"T ₫"')
    p_churn = Calc("ProvinceSummary", "9000002", "Churn %", "real", "measure", "quantitative",
                   "AVG([ChurnRatePct])", "n#,##0.00")

    # ── donut: service revenue share (MonthlyService, CY) ──
    s_rev = Calc("MonthlyService", "9000010", "Doanh thu DV", "real", "measure", "quantitative",
                 f"SUM(IF [Year]={CY} THEN [RevenueVnd] END)", 'n#,##0,,,.1"T ₫"')

    # ── diverging net adds (MonthlyTotals) ──
    net = Calc("MonthlyTotals", "9000020", "Phát triển ròng", "integer", "measure", "quantitative",
               "SUM([NetAdds])", "n#,##0")
    net_k = Calc("MonthlyTotals", "9000021", "Ròng (nghìn)", "real", "measure", "quantitative",
                 "SUM([NetAdds])/1000", 'n#,##0"K"')
    sign = Calc("MonthlyTotals", "9000022", "Chiều", "string", "dimension", "nominal",
                'IF SUM([NetAdds]) >= 0 THEN "Tăng" ELSE "Giảm" END')

    calcs = [p_rev, p_churn, s_rev, net, net_k, sign]

    sheets = []
    sheets.append(V.map_custom("P Map custom", "Doanh thu theo tỉnh (custom lat/lon)",
                               "ProvinceSummary", "Lat", "Lon", p_rev, "Province",
                               color_calc=p_churn, color_palette="VNPT Sequential Blue"))
    sheets.append(V.map_geocoded("P Map geo", "Doanh thu theo tỉnh (geocoded name)",
                                 "ProvinceSummary", p_rev, color_calc=p_churn))
    sheets.append(V.donut("P Donut", "Cơ cấu doanh thu theo dịch vụ 2025",
                          "MonthlyService", "ServiceName", s_rev,
                          color_palette="VNPT Categorical", label_calc=s_rev))
    sheets.append(V.diverging_month_bar("P Net adds", "Phát triển thuê bao ròng theo tháng",
                                        "MonthlyTotals", "Month", net, sign,
                                        label_calc=net_k))

    names = ["P Map custom", "P Map geo", "P Donut", "P Net adds"]
    dash = V.dashboard("VNPT - PROBE", [
        V.header_band("PROBE", "kiểm tra viz rủi ro"),
        V.hrow(["P Map custom", "P Map geo"], 46000, minw=200),
        V.hrow(["P Donut", "P Net adds"], 40000, minw=200),
    ], height=1200)
    xml = V.workbook(["ProvinceSummary", "MonthlyService", "MonthlyTotals"],
                     calcs, sheets, names, dash, "VNPT - PROBE")
    # keep sheets VISIBLE so each renders as a REST view
    xml = xml.replace("<window class='worksheet' hidden='true'", "<window class='worksheet'")
    print(f"PROBE: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VNPT - PROBE")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VNPT - PROBE")
        V.render(wb_id, "probe")
