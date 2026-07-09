"""D1 — Tổng Quan Chất Lượng & Khiếu Nại (Quality & Complaint Executive Overview).

Per-table datasources (each single-relation extract). KPIs on MonthlySummary,
category bar on Complaints.

Run: uv run python scripts/vacs/build_vacs_d1.py [--publish]
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

    # ── KPI calcs on MonthlySummary ──
    k_comp = Calc("MonthlySummary", "0100000001", "Khiếu nại 2026", "integer", "measure", "quantitative",
                  f'SUM(IF [Year] = {CUR} THEN [Complaints] END)', "n#,##0")
    k_idx = Calc("MonthlySummary", "0100000002", "Chỉ số KN (PPM)", "real", "measure", "quantitative",
                 f'SUM(IF [Year]={CUR} THEN [Complaints] END) / SUM(IF [Year]={CUR} THEN [Meals] END) * 1000000', "n#,##0.0")
    k_compl = Calc("MonthlySummary", "0100000003", "Lời khen 2026", "integer", "measure", "quantitative",
                   f'SUM(IF [Year]={CUR} THEN [Compliments] END)', "n#,##0")
    k_sla = Calc("MonthlySummary", "0100000004", "Phản hồi đúng hạn", "real", "measure", "quantitative",
                 f'SUM(IF [Year]={CUR} THEN [OnTimeReplies] END) / SUM(IF [Year]={CUR} THEN [RepliedTotal] END)', "p0.0%")
    k_fo = Calc("MonthlySummary", "0100000005", "Dị vật 2026", "integer", "measure", "quantitative",
                f'SUM(IF [Year]={CUR} THEN [FOComplaints] END)', "n#,##0")
    # monthly trend calcs
    k_idx_mo = Calc("MonthlySummary", "0100000010", "Chỉ số KN", "real", "measure", "quantitative",
                    'SUM([Complaints]) / SUM([Meals]) * 1000000', "n#,##0")
    k_meals_mo = Calc("MonthlySummary", "0100000011", "Sản lượng (triệu suất)", "real", "measure", "quantitative",
                      'SUM([Meals]) / 1000000', "n#,##0.00")
    # category count on Complaints
    k_ccount = Calc("Complaints", "0100000020", "Số khiếu nại", "integer", "measure", "quantitative",
                    "COUNTD([ComplaintId])", "n#,##0")

    ms_calcs = [k_comp, k_idx, k_compl, k_sla, k_fo, k_idx_mo, k_meals_mo]
    calcs = ms_calcs + [k_ccount]

    sheets = []
    sheets.append(V.kpi_card("KPI Khieu nai", k_comp, "Khiếu nại 2026"))
    sheets.append(V.kpi_card("KPI Chi so", k_idx, "Chỉ số KN (PPM)", value_color=V.BRAND))
    sheets.append(V.kpi_card("KPI Loi khen", k_compl, "Lời khen", value_color=V.GOOD))
    sheets.append(V.kpi_card("KPI SLA", k_sla, "Phản hồi đúng hạn", value_color=V.GOOD))
    sheets.append(V.kpi_card("KPI Di vat", k_fo, "Dị vật", value_color=V.GOLD))

    # Trend: complaint index by month, colored by Year
    sheets.append(V.chart(
        "Xu huong chi so", "Xu hướng chỉ số khiếu nại theo tháng (PPM)", "MonthlySummary",
        deps=[MS.dep("Month", caption="Tháng"), MS.dep("Year", caption="Năm"), k_idx_mo.dep_col().strip()],
        insts=[MS.month_inst("Month"), MS.dim_inst("Year"), k_idx_mo.inst().strip()],
        rows=k_idx_mo.ref(), cols=MS.month("Month"), mark="Line",
        encodings=[("color", MS.dim("Year"))], color_palette="VACS Categorical"))

    # Category bar (Complaints)
    sheets.append(V.chart(
        "Khieu nai theo nhom", "Khiếu nại theo nhóm (2 năm)", "Complaints",
        deps=[CP.dep("Category", caption="Nhóm"), k_ccount.dep_col().strip()],
        insts=[CP.dim_inst("Category"), k_ccount.inst().strip()],
        rows=CP.dim("Category"), cols=k_ccount.ref(), mark="Bar",
        encodings=[("color", k_ccount.ref())], color_palette="VACS Sequential Blue",
        data_label=k_ccount.ref(),
        computed_sort=(CP.dim("Category"), k_ccount.ref(), "DESC")))

    # Meals by month
    sheets.append(V.chart(
        "San luong theo thang", "Sản lượng suất ăn theo tháng (triệu suất)", "MonthlySummary",
        deps=[MS.dep("Month", caption="Tháng"), MS.dep("Year", caption="Năm"), k_meals_mo.dep_col().strip()],
        insts=[MS.month_inst("Month"), MS.dim_inst("Year"), k_meals_mo.inst().strip()],
        rows=k_meals_mo.ref(), cols=MS.month("Month"), mark="Bar",
        encodings=[("color", MS.dim("Year"))], color_palette="VACS Categorical"))

    names = ["KPI Khieu nai", "KPI Chi so", "KPI Loi khen", "KPI SLA", "KPI Di vat",
             "Xu huong chi so", "Khieu nai theo nhom", "San luong theo thang"]
    dash = V.dashboard("VACS - Tong Quan Chat Luong", [
        V.header_band("Tổng quan Chất lượng & Khiếu nại", "Vietnam Airlines Caterers · 2025–2026"),
        V.hrow(["KPI Khieu nai", "KPI Chi so", "KPI Loi khen", "KPI SLA", "KPI Di vat"], 15000, kpi=True),
        V.hrow(["Xu huong chi so"], 42000, minw=200),
        V.hrow(["Khieu nai theo nhom", "San luong theo thang"], 39000, minw=160),
    ], height=1180)
    xml = V.workbook(["MonthlySummary", "Complaints"], calcs, sheets, names, dash,
                     "VACS - Tong Quan Chat Luong")
    print(f"D1: {len(xml):,} bytes  XML {V.validate(xml)}")
    twbx = V.package_twbx(xml, "VACS - Tong Quan Chat Luong")
    print(f"  twbx -> {twbx}")
    return twbx


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Tong Quan Chat Luong")
        V.render(wb_id, "d1")
