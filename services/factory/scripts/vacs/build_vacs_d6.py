"""D6 — Bảng Điểm theo Hãng & Đường Bay (Per-Airline & Per-Route Scorecard).

MonthlySummary for the airline complaint-index ranking; Complaints for the
route breakdown; Compliments for the staff-in-honour recognition.

Run: uv run python scripts/vacs/build_vacs_d6.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table


def build():
    V.reset_zids()
    MS = Table("MonthlySummary")
    CP = Table("Complaints")
    CM = Table("Compliments")

    # KPI row (whole-network)
    k_air = Calc("MonthlySummary", "0600000001", "Số hãng phục vụ", "integer", "measure", "quantitative",
                 "COUNTD([AirlineName])", "n#,##0")
    k_worst = Calc("MonthlySummary", "0600000002", "Chỉ số KN cao nhất", "real", "measure", "quantitative",
                   # network-wide max monthly? show overall index instead — simpler & meaningful
                   'SUM([Complaints]) / SUM([Meals]) * 1000000', "n#,##0.0")
    k_route = Calc("Complaints", "0600000003", "Số chặng bay", "integer", "measure", "quantitative",
                   "COUNTD([Route])", "n#,##0")
    k_compl = Calc("Compliments", "0600000004", "Lời khen", "integer", "measure", "quantitative",
                   "COUNTD([ComplimentId])", "n#,##0")

    # airline complaint index (per airline) — COUNTD-safe via MonthlySummary sums
    k_idx_air = Calc("MonthlySummary", "0600000010", "Chỉ số KN (PPM)", "real", "measure", "quantitative",
                     'SUM([Complaints]) / SUM([Meals]) * 1000000', "n#,##0")
    k_comp_air = Calc("MonthlySummary", "0600000011", "Khiếu nại", "integer", "measure", "quantitative",
                      'SUM([Complaints])', "n#,##0")
    # complaints by route (Complaints table)
    k_route_cnt = Calc("Complaints", "0600000012", "Khiếu nại", "integer", "measure", "quantitative",
                       "COUNTD([ComplaintId])", "n#,##0")
    # compliments by department
    k_dept = Calc("Compliments", "0600000013", "Lời khen", "integer", "measure", "quantitative",
                  "COUNTD([ComplimentId])", "n#,##0")

    calcs = [k_air, k_worst, k_route, k_compl, k_idx_air, k_comp_air, k_route_cnt, k_dept]

    sheets = []
    sheets.append(V.kpi_card("KPI So hang", k_air, "Số hãng phục vụ", value_color=V.BRAND))
    sheets.append(V.kpi_card("KPI Chi so mang", k_worst, "Chỉ số KN toàn mạng (PPM)"))
    sheets.append(V.kpi_card("KPI So chang", k_route, "Số chặng bay", value_color=V.BRAND))
    sheets.append(V.kpi_card("KPI Loi khen", k_compl, "Lời khen ghi nhận", value_color=V.GOOD))

    # Airline complaint index ranking (PPM) — the scorecard hero
    sheets.append(V.chart(
        "Chi so theo hang", "Chỉ số khiếu nại theo hãng (PPM) — cao = cần chú ý", "MonthlySummary",
        deps=[MS.dep("AirlineName", caption="Hãng"), k_idx_air.dep_col().strip()],
        insts=[MS.dim_inst("AirlineName"), k_idx_air.inst().strip()],
        rows=MS.dim("AirlineName"), cols=k_idx_air.ref(), mark="Bar",
        encodings=[("color", k_idx_air.ref())], color_palette="VACS Sequential Blue",
        data_label=k_idx_air.ref(), computed_sort=(MS.dim("AirlineName"), k_idx_air.ref(), "DESC")))

    # Complaints by route (top)
    sheets.append(V.chart(
        "Khieu nai theo chang", "Khiếu nại theo chặng bay (Top)", "Complaints",
        deps=[CP.dep("Route", caption="Chặng"), k_route_cnt.dep_col().strip()],
        insts=[CP.dim_inst("Route"), k_route_cnt.inst().strip()],
        rows=CP.dim("Route"), cols=k_route_cnt.ref(), mark="Bar",
        encodings=[("color", k_route_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_route_cnt.ref(), computed_sort=(CP.dim("Route"), k_route_cnt.ref(), "DESC")))

    # Compliments by department (celebrate strong teams)
    sheets.append(V.chart(
        "Loi khen theo bo phan", "Lời khen theo bộ phận", "Compliments",
        deps=[CM.dep("Department", caption="Bộ phận"), k_dept.dep_col().strip()],
        insts=[CM.dim_inst("Department"), k_dept.inst().strip()],
        rows=CM.dim("Department"), cols=k_dept.ref(), mark="Bar",
        encodings=[("color", k_dept.ref())], color_palette="VACS Sequential Blue",
        data_label=k_dept.ref(), computed_sort=(CM.dim("Department"), k_dept.ref(), "DESC")))

    names = ["KPI So hang", "KPI Chi so mang", "KPI So chang", "KPI Loi khen",
             "Chi so theo hang", "Khieu nai theo chang", "Loi khen theo bo phan"]
    dash = V.dashboard("VACS - Bang Diem Hang Bay", [
        V.header_band("Bảng điểm theo Hãng & Đường bay", "Chỉ số khiếu nại · Chặng nóng · Ghi nhận bộ phận"),
        V.hrow(["KPI So hang", "KPI Chi so mang", "KPI So chang", "KPI Loi khen"], 15000, kpi=True),
        V.hrow(["Chi so theo hang"], 44000, minw=200),
        V.hrow(["Khieu nai theo chang", "Loi khen theo bo phan"], 37000, minw=160),
    ], height=1220)
    xml = V.workbook(["MonthlySummary", "Complaints", "Compliments"], calcs, sheets, names, dash,
                     "VACS - Bang Diem Hang Bay")
    print(f"D6: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Bang Diem Hang Bay")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Bang Diem Hang Bay")
        V.render(wb_id, "d6")
