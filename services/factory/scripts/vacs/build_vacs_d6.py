"""D6 — Bảng Điểm theo Hãng & Đường Bay (V1 scorecard + spark KPIs).

KPI row = spark cards on MonthlySummary (network index, compliments) + delta
cards for cross-table counts. Airline complaint-index ranking (hero), route
breakdown, compliments-by-department.

Run: uv run python scripts/vacs/build_vacs_d6.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

CUR = 2026


def build():
    V.reset_zids()
    MS = Table("MonthlySummary")
    CP = Table("Complaints")
    CM = Table("Compliments")

    # Network KPIs on MonthlySummary (spark-able)
    k_idx_net = Calc("MonthlySummary", "0600000001", "Chỉ số KN toàn mạng", "real", "measure", "quantitative",
                     f'SUM(IF [Year]={CUR} THEN [Complaints] END) / SUM(IF [Year]={CUR} THEN [Meals] END) * 1000000', "n#,##0.0")
    k_idx_net_mo = Calc("MonthlySummary", "0600000011", "Chỉ số/tháng", "real", "measure", "quantitative",
                        "SUM([Complaints]) / SUM([Meals]) * 1000000", "n#,##0")
    k_compl = Calc("MonthlySummary", "0600000002", "Lời khen 2026", "integer", "measure", "quantitative",
                   f'SUM(IF [Year]={CUR} THEN [Compliments] END)', "n#,##0")
    k_compl_mo = Calc("MonthlySummary", "0600000012", "Khen/tháng", "integer", "measure", "quantitative",
                      "SUM([Compliments])", "n#,##0")
    # Count cards (delta only, no spark — different tables)
    k_air = Calc("MonthlySummary", "0600000003", "Số hãng phục vụ", "integer", "measure", "quantitative",
                 "COUNTD([AirlineName])", "n#,##0")
    k_route = Calc("Complaints", "0600000004", "Số chặng bay", "integer", "measure", "quantitative",
                   "COUNTD([Route])", "n#,##0")

    # ranking calcs
    k_idx_air = Calc("MonthlySummary", "0600000020", "Chỉ số KN (PPM)", "real", "measure", "quantitative",
                     'SUM([Complaints]) / SUM([Meals]) * 1000000', "n#,##0")
    k_route_cnt = Calc("Complaints", "0600000021", "Khiếu nại", "integer", "measure", "quantitative",
                       "COUNTD([ComplaintId])", "n#,##0")
    k_dept = Calc("Compliments", "0600000022", "Lời khen", "integer", "measure", "quantitative",
                  "COUNTD([ComplimentId])", "n#,##0")
    calcs = [k_idx_net, k_idx_net_mo, k_compl, k_compl_mo, k_air, k_route,
             k_idx_air, k_route_cnt, k_dept]

    sheets = []
    # 2 spark cards + 2 delta cards
    sheets.append(V.kpi_card_delta("N Chi so net", k_idx_net, "Chỉ số KN toàn mạng (PPM)", "▲ 16,8%", V.BAD, "vs cùng kỳ 2025", value_color=V.BRAND))
    sheets.append(V.sparkline("S Chi so net", "MonthlySummary", "Month", k_idx_net_mo, color=V.BRAND))
    sheets.append(V.kpi_card_delta("N Loi khen net", k_compl, "Lời khen 2026", "▲ 22,7%", V.GOOD, "vs cùng kỳ", value_color=V.GOOD))
    sheets.append(V.sparkline("S Loi khen net", "MonthlySummary", "Month", k_compl_mo, color=V.GOOD))
    # plain KPI (no spark) cards for the two count metrics
    sheets.append(V.kpi_card("N So hang", k_air, "Số hãng phục vụ", value_color=V.NAVY))
    sheets.append(V.kpi_card("N So chang", k_route, "Số chặng bay", value_color=V.NAVY))

    # Airline complaint-index ranking (hero)
    sheets.append(V.chart(
        "Chi so theo hang", "Chỉ số khiếu nại theo hãng (PPM) — cao = cần chú ý", "MonthlySummary",
        deps=[MS.dep("AirlineName", caption="Hãng"), k_idx_air.dep_col().strip()],
        insts=[MS.dim_inst("AirlineName"), k_idx_air.inst().strip()],
        rows=MS.dim("AirlineName"), cols=k_idx_air.ref(), mark="Bar",
        encodings=[("color", k_idx_air.ref())], color_palette="VACS Sequential Blue",
        data_label=k_idx_air.ref(), computed_sort=(MS.dim("AirlineName"), k_idx_air.ref(), "DESC")))

    sheets.append(V.chart(
        "Khieu nai theo chang", "Khiếu nại theo chặng bay (Top)", "Complaints",
        deps=[CP.dep("Route", caption="Chặng"), k_route_cnt.dep_col().strip()],
        insts=[CP.dim_inst("Route"), k_route_cnt.inst().strip()],
        rows=CP.dim("Route"), cols=k_route_cnt.ref(), mark="Bar",
        encodings=[("color", k_route_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_route_cnt.ref(), computed_sort=(CP.dim("Route"), k_route_cnt.ref(), "DESC")))

    sheets.append(V.chart(
        "Loi khen theo bo phan", "Lời khen theo bộ phận", "Compliments",
        deps=[CM.dep("Department", caption="Bộ phận"), k_dept.dep_col().strip()],
        insts=[CM.dim_inst("Department"), k_dept.inst().strip()],
        rows=CM.dim("Department"), cols=k_dept.ref(), mark="Bar",
        encodings=[("color", k_dept.ref())], color_palette="VACS Sequential Blue",
        data_label=k_dept.ref(), computed_sort=(CM.dim("Department"), k_dept.ref(), "DESC")))

    names = ["N Chi so net", "S Chi so net", "N Loi khen net", "S Loi khen net", "N So hang", "N So chang",
             "Chi so theo hang", "Khieu nai theo chang", "Loi khen theo bo phan"]
    dash = V.dashboard("VACS - Bang Diem Hang Bay", [
        V.header_band("Bảng điểm theo Hãng & Đường bay", "Chỉ số khiếu nại · Chặng nóng · Ghi nhận bộ phận"),
        # 2 spark cards + 2 plain KPI cards in one row
        V.spark_hrow([("N Chi so net", "S Chi so net"), ("N Loi khen net", "S Loi khen net")], 26000),
        V.hrow(["N So hang", "N So chang"], 10000, kpi=True),
        V.hrow(["Chi so theo hang"], 34000, minw=200),
        V.hrow(["Khieu nai theo chang", "Loi khen theo bo phan"], 30000, minw=160),
    ], height=1300)
    xml = V.workbook(["MonthlySummary", "Complaints", "Compliments"], calcs, sheets, names, dash,
                     "VACS - Bang Diem Hang Bay")
    print(f"D6: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Bang Diem Hang Bay")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Bang Diem Hang Bay")
        V.render(wb_id, "d6")
