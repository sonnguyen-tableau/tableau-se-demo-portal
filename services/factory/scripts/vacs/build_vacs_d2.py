"""D2 — Phân Tích Khiếu Nại theo Loại (V1: Pareto & Root Cause + spark KPIs).

Spark-KPI cards (number + YoY delta + monthly trend) on Complaints, plus Pareto,
root-cause, severity, corrective-action bars.

Run: uv run python scripts/vacs/build_vacs_d2.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

CUR = 2026


def build():
    V.reset_zids()
    CP = Table("Complaints")

    # KPI (whole span) + monthly-trend twin for the sparkline
    k_cnt = Calc("Complaints", "0200000001", "Tổng khiếu nại", "integer", "measure", "quantitative",
                 f'COUNTD(IF [Year]={CUR} THEN [ComplaintId] END)', "n#,##0")
    k_cnt_mo = Calc("Complaints", "0200000011", "KN/tháng", "integer", "measure", "quantitative",
                    "COUNTD([ComplaintId])", "n#,##0")
    k_open = Calc("Complaints", "0200000002", "Đang xử lý", "integer", "measure", "quantitative",
                  'COUNTD(IF [Status] = "Đang xử lý" THEN [ComplaintId] END)', "n#,##0")
    k_open_mo = Calc("Complaints", "0200000012", "Đang xử lý/tháng", "integer", "measure", "quantitative",
                     'COUNTD(IF [Status] = "Đang xử lý" THEN [ComplaintId] END)', "n#,##0")
    k_crit = Calc("Complaints", "0200000003", "Nghiêm trọng", "integer", "measure", "quantitative",
                  f'COUNTD(IF [Year]={CUR} AND [Severity] = "Nghiêm trọng" THEN [ComplaintId] END)', "n#,##0")
    k_crit_mo = Calc("Complaints", "0200000013", "NT/tháng", "integer", "measure", "quantitative",
                     'COUNTD(IF [Severity] = "Nghiêm trọng" THEN [ComplaintId] END)', "n#,##0")
    k_fixed = Calc("Complaints", "0200000004", "Đã khắc phục", "real", "measure", "quantitative",
                   f'COUNTD(IF [Year]={CUR} AND [CorrectiveAction] = "Đã khắc phục" THEN [ComplaintId] END) / COUNTD(IF [Year]={CUR} THEN [ComplaintId] END)', "p0.0%")
    k_fixed_mo = Calc("Complaints", "0200000014", "KP/tháng", "real", "measure", "quantitative",
                      'COUNTD(IF [CorrectiveAction] = "Đã khắc phục" THEN [ComplaintId] END) / COUNTD([ComplaintId])', "p0%")
    # ranking count
    k_rank = Calc("Complaints", "0200000020", "Số khiếu nại", "integer", "measure", "quantitative",
                  "COUNTD([ComplaintId])", "n#,##0")
    calcs = [k_cnt, k_cnt_mo, k_open, k_open_mo, k_crit, k_crit_mo, k_fixed, k_fixed_mo, k_rank]

    sheets = []
    sheets.append(V.kpi_card_delta("N Tong", k_cnt, "Tổng khiếu nại 2026", "▲ 23,8%", V.BAD, "vs cùng kỳ 2025"))
    sheets.append(V.sparkline("S Tong", "Complaints", "DepMonth", k_cnt_mo))
    sheets.append(V.kpi_card_delta("N Dang xu ly", k_open, "Đang xử lý", "10,6%", V.WARN, "trên tổng", value_color=V.WARN))
    sheets.append(V.sparkline("S Dang xu ly", "Complaints", "DepMonth", k_open_mo, color=V.WARN))
    sheets.append(V.kpi_card_delta("N Nghiem trong", k_crit, "Nghiêm trọng 2026", "▲ 5 vụ", V.BAD, "vs 6 cùng kỳ", value_color=V.BAD))
    sheets.append(V.sparkline("S Nghiem trong", "Complaints", "DepMonth", k_crit_mo, color=V.BAD))
    sheets.append(V.kpi_card_delta("N Khac phuc", k_fixed, "Tỷ lệ đã khắc phục", "▼ 2,4đ%", V.WARN, "vs cùng kỳ", value_color=V.GOOD))
    sheets.append(V.sparkline("S Khac phuc", "Complaints", "DepMonth", k_fixed_mo, color=V.GOOD))

    # Pareto sub-category
    sheets.append(V.chart(
        "Pareto tieu muc", "Pareto khiếu nại theo tiểu mục (2 năm)", "Complaints",
        deps=[CP.dep("SubCategory", caption="Tiểu mục"), k_rank.dep_col().strip()],
        insts=[CP.dim_inst("SubCategory"), k_rank.inst().strip()],
        rows=CP.dim("SubCategory"), cols=k_rank.ref(), mark="Bar",
        encodings=[("color", k_rank.ref())], color_palette="VACS Sequential Blue",
        data_label=k_rank.ref(), computed_sort=(CP.dim("SubCategory"), k_rank.ref(), "DESC")))

    sheets.append(V.chart(
        "Nguyen nhan goc", "Phân tích nguyên nhân gốc", "Complaints",
        deps=[CP.dep("RootCauseGroup", caption="Nguyên nhân"), k_rank.dep_col().strip()],
        insts=[CP.dim_inst("RootCauseGroup"), k_rank.inst().strip()],
        rows=CP.dim("RootCauseGroup"), cols=k_rank.ref(), mark="Bar",
        encodings=[("color", k_rank.ref())], color_palette="VACS Sequential Blue",
        data_label=k_rank.ref(), computed_sort=(CP.dim("RootCauseGroup"), k_rank.ref(), "DESC")))

    sheets.append(V.chart(
        "Muc do", "Theo mức độ nghiêm trọng", "Complaints",
        deps=[CP.dep("Severity", caption="Mức độ"), k_rank.dep_col().strip()],
        insts=[CP.dim_inst("Severity"), k_rank.inst().strip()],
        rows=CP.dim("Severity"), cols=k_rank.ref(), mark="Bar",
        encodings=[("color", k_rank.ref())], color_palette="VACS Severity",
        data_label=k_rank.ref()))

    sheets.append(V.chart(
        "Trang thai xu ly", "Trạng thái khắc phục", "Complaints",
        deps=[CP.dep("CorrectiveAction", caption="Hành động"), k_rank.dep_col().strip()],
        insts=[CP.dim_inst("CorrectiveAction"), k_rank.inst().strip()],
        rows=CP.dim("CorrectiveAction"), cols=k_rank.ref(), mark="Bar",
        encodings=[("color", k_rank.ref())], color_palette="VACS Sequential Blue",
        data_label=k_rank.ref(), computed_sort=(CP.dim("CorrectiveAction"), k_rank.ref(), "DESC")))

    names = ["N Tong", "S Tong", "N Dang xu ly", "S Dang xu ly", "N Nghiem trong", "S Nghiem trong",
             "N Khac phuc", "S Khac phuc", "Pareto tieu muc", "Nguyen nhan goc", "Muc do", "Trang thai xu ly"]
    dash = V.dashboard("VACS - Phan Tich Khieu Nai", [
        V.header_band("Phân tích Khiếu nại theo Loại", "Pareto · Nguyên nhân gốc · Hành động khắc phục"),
        V.spark_hrow([("N Tong", "S Tong"), ("N Dang xu ly", "S Dang xu ly"),
                      ("N Nghiem trong", "S Nghiem trong"), ("N Khac phuc", "S Khac phuc")], 28000),
        V.hrow(["Pareto tieu muc"], 40000, minw=200),
        V.hrow(["Nguyen nhan goc", "Muc do", "Trang thai xu ly"], 34000, minw=130),
    ], height=1240)
    xml = V.workbook(["Complaints"], calcs, sheets, names, dash, "VACS - Phan Tich Khieu Nai")
    print(f"D2: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Phan Tich Khieu Nai")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Phan Tich Khieu Nai")
        V.render(wb_id, "d2")
