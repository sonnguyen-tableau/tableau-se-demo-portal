"""D1 — Tổng Quan Chất Lượng & Khiếu Nại (V1 premium standard).

Sparkline KPI cards (§10: BAN number + YoY delta + 6-month trend line in one
card) + max-column emphasis monthly chart with gold target tick (§11).
Single-table on MonthlySummary + Complaints.

YoY deltas (2026 H1 vs 2025 H1) are computed deterministically (seed=42) and
baked into the delta lines: complaints +23.8%, index +16.8%, compliments
+22.7%, on-time reply -2.0pp, FO -15.2%.

Run: uv run python scripts/vacs/build_vacs_d1.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

CUR = 2026
# Target complaint index (PPM) — VACS quality goal, drives the gold tick.
TARGET_PPM = 55


def build():
    V.reset_zids()
    MS = Table("MonthlySummary")
    CP = Table("Complaints")

    # ── Headline KPI calcs (2026 YTD) ──
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

    # ── Monthly-trend calcs (for the sparklines — recompute per month) ──
    k_comp_mo = Calc("MonthlySummary", "0100000021", "KN/tháng", "integer", "measure", "quantitative",
                     "SUM([Complaints])", "n#,##0")
    k_idx_mo = Calc("MonthlySummary", "0100000022", "Chỉ số/tháng", "real", "measure", "quantitative",
                    "SUM([Complaints]) / SUM([Meals]) * 1000000", "n#,##0")
    k_compl_mo = Calc("MonthlySummary", "0100000023", "Khen/tháng", "integer", "measure", "quantitative",
                      "SUM([Compliments])", "n#,##0")
    k_sla_mo = Calc("MonthlySummary", "0100000024", "SLA/tháng", "real", "measure", "quantitative",
                    "SUM([OnTimeReplies]) / SUM([RepliedTotal])", "p0%")
    k_fo_mo = Calc("MonthlySummary", "0100000025", "DV/tháng", "integer", "measure", "quantitative",
                   "SUM([FOComplaints])", "n#,##0")

    # ── Emphasis chart: monthly complaint index (2026), max month darkest + gold target ──
    k_idx_emph = Calc("MonthlySummary", "0100000031", "Chỉ số KN", "real", "measure", "quantitative",
                      f'SUM(IF [Year]={CUR} THEN [Complaints] END) / SUM(IF [Year]={CUR} THEN [Meals] END) * 1000000', "n#,##0")

    # category count (Complaints)
    k_ccount = Calc("Complaints", "0100000040", "Số khiếu nại", "integer", "measure", "quantitative",
                    "COUNTD([ComplaintId])", "n#,##0")

    ms_calcs = [k_comp, k_idx, k_compl, k_sla, k_fo, k_comp_mo, k_idx_mo, k_compl_mo,
                k_sla_mo, k_fo_mo, k_idx_emph]
    calcs = ms_calcs + [k_ccount]

    sheets = []
    # Spark-KPI cards: (BAN+delta number sheet, sparkline sheet). Higher complaint
    # numbers = bad → red ▲; more compliments = good → green ▲; on-time down = red ▼.
    sheets.append(V.kpi_card_delta("N Khieu nai", k_comp, "Khiếu nại 2026 (YTD)", "▲ 23,8%", V.BAD, "vs cùng kỳ 2025"))
    sheets.append(V.sparkline("S Khieu nai", "MonthlySummary", "Month", k_comp_mo))
    sheets.append(V.kpi_card_delta("N Chi so", k_idx, "Chỉ số KN (PPM)", "▲ 16,8%", V.BAD, "vs cùng kỳ", value_color=V.BRAND))
    sheets.append(V.sparkline("S Chi so", "MonthlySummary", "Month", k_idx_mo))
    sheets.append(V.kpi_card_delta("N Loi khen", k_compl, "Lời khen", "▲ 22,7%", V.GOOD, "vs cùng kỳ", value_color=V.GOOD))
    sheets.append(V.sparkline("S Loi khen", "MonthlySummary", "Month", k_compl_mo, color=V.GOOD))
    sheets.append(V.kpi_card_delta("N SLA", k_sla, "Phản hồi đúng hạn", "▼ 2,0đ%", V.BAD, "vs cùng kỳ", value_color=V.GOOD))
    sheets.append(V.sparkline("S SLA", "MonthlySummary", "Month", k_sla_mo, color=V.GOOD))
    sheets.append(V.kpi_card_delta("N Di vat", k_fo, "Khiếu nại dị vật", "▼ 15,2%", V.GOOD, "vs cùng kỳ", value_color=V.GOLD))
    sheets.append(V.sparkline("S Di vat", "MonthlySummary", "Month", k_fo_mo, color=V.GOLD))

    # Emphasis monthly index chart (2026) — max month darkest, value labels
    sheets.append(V.emphasis_month_chart(
        "Chi so theo thang", "Chỉ số khiếu nại theo tháng 2026 (PPM) · tháng cao nhất = đậm nhất · mục tiêu ≤ 55",
        "MonthlySummary", "Month", k_idx_emph))

    # Category bar (Complaints, 2 years) — ranking with data labels
    sheets.append(V.chart(
        "Khieu nai theo nhom", "Khiếu nại theo nhóm (2 năm)", "Complaints",
        deps=[CP.dep("Category", caption="Nhóm"), k_ccount.dep_col().strip()],
        insts=[CP.dim_inst("Category"), k_ccount.inst().strip()],
        rows=CP.dim("Category"), cols=k_ccount.ref(), mark="Bar",
        encodings=[("color", k_ccount.ref())], color_palette="VACS Sequential Blue",
        data_label=k_ccount.ref(), computed_sort=(CP.dim("Category"), k_ccount.ref(), "DESC")))

    names = ["N Khieu nai", "S Khieu nai", "N Chi so", "S Chi so", "N Loi khen", "S Loi khen",
             "N SLA", "S SLA", "N Di vat", "S Di vat", "Chi so theo thang", "Khieu nai theo nhom"]
    dash = V.dashboard("VACS - Tong Quan Chat Luong", [
        V.header_band("Tổng quan Chất lượng & Khiếu nại", "Vietnam Airlines Caterers · 2025–2026"),
        V.spark_hrow([("N Khieu nai", "S Khieu nai"), ("N Chi so", "S Chi so"),
                      ("N Loi khen", "S Loi khen"), ("N SLA", "S SLA"), ("N Di vat", "S Di vat")], 30000),
        V.hrow(["Chi so theo thang"], 34000, minw=200),
        V.hrow(["Khieu nai theo nhom"], 34000, minw=200),
    ], height=1240)
    xml = V.workbook(["MonthlySummary", "Complaints"], calcs, sheets, names, dash,
                     "VACS - Tong Quan Chat Luong")
    print(f"D1: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Tong Quan Chat Luong")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Tong Quan Chat Luong")
        V.render(wb_id, "d1")
