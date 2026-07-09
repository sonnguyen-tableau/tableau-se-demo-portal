"""D4 — Hiệu Suất Giao Suất Ăn (COF: Sản lượng & Chuyến bay).

Single-table on MonthlySummary. The requirement-doc "COF Monthly Figure":
meal units + flights this vs last month, avg meals/day, meals-per-flight.

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

    # This month (Jun 2026) meal units + MoM
    k_meals = Calc("MonthlySummary", "0400000001", "Suất ăn tháng này", "integer", "measure", "quantitative",
                   f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END)', "n#,##0")
    k_flts = Calc("MonthlySummary", "0400000002", "Chuyến bay tháng này", "integer", "measure", "quantitative",
                  f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Flights] END)', "n#,##0")
    # MoM % meals
    k_mom = Calc("MonthlySummary", "0400000003", "MoM suất ăn", "real", "measure", "quantitative",
                 f'(SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END) - SUM(IF [Year]={CUR} AND [MonthNum]={MAY} THEN [Meals] END)) / SUM(IF [Year]={CUR} AND [MonthNum]={MAY} THEN [Meals] END)', "p0.0%;-p0.0%")
    # avg meals/day this month (Jun = 30 days)
    k_avgday = Calc("MonthlySummary", "0400000004", "TB suất ăn/ngày", "integer", "measure", "quantitative",
                    f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END) / 30', "n#,##0")
    # meals per flight
    k_mpf = Calc("MonthlySummary", "0400000005", "Suất/chuyến", "integer", "measure", "quantitative",
                 f'SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Meals] END) / SUM(IF [Year]={CUR} AND [MonthNum]={JUN} THEN [Flights] END)', "n#,##0")
    # monthly series
    k_meals_mo = Calc("MonthlySummary", "0400000010", "Suất ăn (triệu)", "real", "measure", "quantitative",
                      'SUM([Meals]) / 1000000', "n#,##0.00")
    k_flts_mo = Calc("MonthlySummary", "0400000011", "Chuyến bay", "integer", "measure", "quantitative",
                     'SUM([Flights])', "n#,##0")
    calcs = [k_meals, k_flts, k_mom, k_avgday, k_mpf, k_meals_mo, k_flts_mo]

    sheets = []
    sheets.append(V.kpi_card("KPI Suat an", k_meals, "Suất ăn tháng 6/2026"))
    sheets.append(V.kpi_card("KPI Chuyen bay", k_flts, "Chuyến bay tháng 6/2026", value_color=V.BRAND))
    sheets.append(V.kpi_card("KPI MoM", k_mom, "So với tháng trước", value_color=V.GOOD))
    sheets.append(V.kpi_card("KPI TB ngay", k_avgday, "TB suất ăn/ngày"))
    sheets.append(V.kpi_card("KPI Suat chuyen", k_mpf, "Suất ăn/chuyến", value_color=V.GOLD))

    # Meals by month (both years) colored by Year
    sheets.append(V.chart(
        "San luong thang", "Sản lượng suất ăn theo tháng (triệu suất) — 2025 vs 2026", "MonthlySummary",
        deps=[MS.dep("Month", caption="Tháng"), MS.dep("Year", caption="Năm"), k_meals_mo.dep_col().strip()],
        insts=[MS.month_inst("Month"), MS.dim_inst("Year"), k_meals_mo.inst().strip()],
        rows=k_meals_mo.ref(), cols=MS.month("Month"), mark="Bar",
        encodings=[("color", MS.dim("Year"))], color_palette="VACS Categorical"))

    # Flights by month
    sheets.append(V.chart(
        "Chuyen bay thang", "Số chuyến bay theo tháng — 2025 vs 2026", "MonthlySummary",
        deps=[MS.dep("Month", caption="Tháng"), MS.dep("Year", caption="Năm"), k_flts_mo.dep_col().strip()],
        insts=[MS.month_inst("Month"), MS.dim_inst("Year"), k_flts_mo.inst().strip()],
        rows=k_flts_mo.ref(), cols=MS.month("Month"), mark="Line",
        encodings=[("color", MS.dim("Year"))], color_palette="VACS Categorical"))

    # Meals by airline (top) — who we cater the most for
    k_meals_all = Calc("MonthlySummary", "0400000020", "Suất ăn", "integer", "measure", "quantitative",
                       'SUM([Meals])', "n#,##0")
    calcs.append(k_meals_all)
    sheets.append(V.chart(
        "Suat an theo hang", "Sản lượng suất ăn theo hãng bay", "MonthlySummary",
        deps=[MS.dep("AirlineName", caption="Hãng"), k_meals_all.dep_col().strip()],
        insts=[MS.dim_inst("AirlineName"), k_meals_all.inst().strip()],
        rows=MS.dim("AirlineName"), cols=k_meals_all.ref(), mark="Bar",
        encodings=[("color", k_meals_all.ref())], color_palette="VACS Sequential Blue",
        data_label=k_meals_all.ref(), computed_sort=(MS.dim("AirlineName"), k_meals_all.ref(), "DESC")))

    names = ["KPI Suat an", "KPI Chuyen bay", "KPI MoM", "KPI TB ngay", "KPI Suat chuyen",
             "San luong thang", "Chuyen bay thang", "Suat an theo hang"]
    dash = V.dashboard("VACS - COF San Luong", [
        V.header_band("Hiệu suất Giao suất ăn (COF)", "Sản lượng · Chuyến bay · So sánh tháng"),
        V.hrow(["KPI Suat an", "KPI Chuyen bay", "KPI MoM", "KPI TB ngay", "KPI Suat chuyen"], 15000, kpi=True),
        V.hrow(["San luong thang", "Chuyen bay thang"], 40000, minw=180),
        V.hrow(["Suat an theo hang"], 41000, minw=200),
    ], height=1180)
    xml = V.workbook(["MonthlySummary"], calcs, sheets, names, dash, "VACS - COF San Luong")
    print(f"D4: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - COF San Luong")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - COF San Luong")
        V.render(wb_id, "d4")
