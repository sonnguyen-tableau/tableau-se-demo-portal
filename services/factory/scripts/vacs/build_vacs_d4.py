"""D4 — Hiệu Suất Giao Suất Ăn (V1 COF Monthly Figure + spark KPIs).

The requirement-doc COF board with MoM comparison baked into the KPI delta lines
(Jun vs May 2026): meals +4.3%, flights +4.8%. Spark-KPIs + emphasis monthly.

Run: uv run python scripts/vacs/build_vacs_d4.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

CUR = 2026
JUN, MAY = 6, 5


def build():
    V.reset_zids()
    MS = Table("MonthlySummary")

    # This-month (Jun 2026) figures + monthly-trend twins
    k_meals = Calc("MonthlySummary", "0400000001", "Suất ăn tháng này", "integer", "measure", "quantitative",
                   f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END)', "n#,##0")
    k_meals_mo = Calc("MonthlySummary", "0400000011", "Suất/tháng", "integer", "measure", "quantitative",
                      f'SUM(IF [Year]={CUR} THEN [Meals] END)', "n#,##0")
    k_flts = Calc("MonthlySummary", "0400000002", "Chuyến bay tháng này", "integer", "measure", "quantitative",
                  f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Flights] END)', "n#,##0")
    k_flts_mo = Calc("MonthlySummary", "0400000012", "Chuyến/tháng", "integer", "measure", "quantitative",
                     f'SUM(IF [Year]={CUR} THEN [Flights] END)', "n#,##0")
    k_avgday = Calc("MonthlySummary", "0400000003", "TB suất ăn/ngày", "integer", "measure", "quantitative",
                    f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END) / 30', "n#,##0")
    k_avgday_mo = Calc("MonthlySummary", "0400000013", "TB ngày/tháng", "integer", "measure", "quantitative",
                       f'SUM(IF [Year]={CUR} THEN [Meals] END) / 30', "n#,##0")
    k_mpf = Calc("MonthlySummary", "0400000004", "Suất/chuyến", "integer", "measure", "quantitative",
                 f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END) / SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Flights] END)', "n#,##0")
    k_mpf_mo = Calc("MonthlySummary", "0400000014", "Suất/chuyến/tháng", "integer", "measure", "quantitative",
                    "SUM([Meals]) / SUM([Flights])", "n#,##0")
    # emphasis + ranking
    k_meals_emph = Calc("MonthlySummary", "0400000021", "Suất ăn", "integer", "measure", "quantitative",
                        f'SUM(IF [Year]={CUR} THEN [Meals] END)', "n#,##0")
    k_meals_all = Calc("MonthlySummary", "0400000022", "Suất ăn", "integer", "measure", "quantitative",
                       'SUM([Meals])', "n#,##0")
    calcs = [k_meals, k_meals_mo, k_flts, k_flts_mo, k_avgday, k_avgday_mo, k_mpf, k_mpf_mo,
             k_meals_emph, k_meals_all]

    sheets = []
    sheets.append(V.kpi_card_delta("N Suat an", k_meals, "Suất ăn tháng 6/2026", "▲ 4,3%", V.GOOD, "so tháng 5"))
    sheets.append(V.sparkline("S Suat an", "MonthlySummary", "Month", k_meals_mo))
    sheets.append(V.kpi_card_delta("N Chuyen bay", k_flts, "Chuyến bay tháng 6", "▲ 4,8%", V.GOOD, "so tháng 5", value_color=V.BRAND))
    sheets.append(V.sparkline("S Chuyen bay", "MonthlySummary", "Month", k_flts_mo, color=V.BRAND))
    sheets.append(V.kpi_card_delta("N TB ngay", k_avgday, "TB suất ăn/ngày", "tháng 6", V.BODY, "≈ công suất bếp"))
    sheets.append(V.sparkline("S TB ngay", "MonthlySummary", "Month", k_avgday_mo))
    sheets.append(V.kpi_card_delta("N Suat chuyen", k_mpf, "Suất ăn/chuyến", "tháng 6", V.BODY, "load factor", value_color=V.GOLD))
    sheets.append(V.sparkline("S Suat chuyen", "MonthlySummary", "Month", k_mpf_mo, color=V.GOLD))

    # emphasis monthly meals (2026)
    sheets.append(V.emphasis_month_chart(
        "San luong thang", "Sản lượng suất ăn theo tháng 2026 · tháng cao nhất = đậm nhất",
        "MonthlySummary", "Month", k_meals_emph))

    # meals by airline ranking
    sheets.append(V.chart(
        "Suat an theo hang", "Sản lượng suất ăn theo hãng bay", "MonthlySummary",
        deps=[MS.dep("AirlineName", caption="Hãng"), k_meals_all.dep_col().strip()],
        insts=[MS.dim_inst("AirlineName"), k_meals_all.inst().strip()],
        rows=MS.dim("AirlineName"), cols=k_meals_all.ref(), mark="Bar",
        encodings=[("color", k_meals_all.ref())], color_palette="VACS Sequential Blue",
        data_label=k_meals_all.ref(), computed_sort=(MS.dim("AirlineName"), k_meals_all.ref(), "DESC")))

    names = ["N Suat an", "S Suat an", "N Chuyen bay", "S Chuyen bay", "N TB ngay", "S TB ngay",
             "N Suat chuyen", "S Suat chuyen", "San luong thang", "Suat an theo hang"]
    dash = V.dashboard("VACS - COF San Luong", [
        V.header_band("Hiệu suất Giao suất ăn (COF)", "Sản lượng · Chuyến bay · So sánh tháng (MoM)"),
        V.spark_hrow([("N Suat an", "S Suat an"), ("N Chuyen bay", "S Chuyen bay"),
                      ("N TB ngay", "S TB ngay"), ("N Suat chuyen", "S Suat chuyen")], 28000),
        V.hrow(["San luong thang"], 34000, minw=200),
        V.hrow(["Suat an theo hang"], 38000, minw=200),
    ], height=1240)
    xml = V.workbook(["MonthlySummary"], calcs, sheets, names, dash, "VACS - COF San Luong")
    print(f"D4: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - COF San Luong")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - COF San Luong")
        V.render(wb_id, "d4")
