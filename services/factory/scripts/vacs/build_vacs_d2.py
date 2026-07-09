"""D2 — Phân Tích Khiếu Nại theo Loại (Pareto & Root Cause).

Single-table on Complaints. Pareto of sub-categories, root-cause bar, severity
mix, corrective-action status.

Run: uv run python scripts/vacs/build_vacs_d2.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table


def build():
    V.reset_zids()
    CP = Table("Complaints")
    k_cnt = Calc("Complaints", "0200000001", "Số khiếu nại", "integer", "measure", "quantitative",
                 "COUNTD([ComplaintId])", "n#,##0")
    k_open = Calc("Complaints", "0200000002", "Đang xử lý", "integer", "measure", "quantitative",
                  'COUNTD(IF [Status] = "Đang xử lý" THEN [ComplaintId] END)', "n#,##0")
    k_crit = Calc("Complaints", "0200000003", "Nghiêm trọng", "integer", "measure", "quantitative",
                  'COUNTD(IF [Severity] = "Nghiêm trọng" THEN [ComplaintId] END)', "n#,##0")
    k_fixed = Calc("Complaints", "0200000004", "Đã khắc phục", "real", "measure", "quantitative",
                   'COUNTD(IF [CorrectiveAction] = "Đã khắc phục" THEN [ComplaintId] END) / COUNTD([ComplaintId])', "p0.0%")
    calcs = [k_cnt, k_open, k_crit, k_fixed]

    sheets = []
    sheets.append(V.kpi_card("KPI Tong", k_cnt, "Tổng khiếu nại"))
    sheets.append(V.kpi_card("KPI Dang xu ly", k_open, "Đang xử lý", value_color=V.WARN))
    sheets.append(V.kpi_card("KPI Nghiem trong", k_crit, "Nghiêm trọng", value_color=V.BAD))
    sheets.append(V.kpi_card("KPI Da khac phuc", k_fixed, "Tỷ lệ đã khắc phục", value_color=V.GOOD))

    # Pareto: sub-category ranked bar
    sheets.append(V.chart(
        "Pareto tieu muc", "Pareto khiếu nại theo tiểu mục", "Complaints",
        deps=[CP.dep("SubCategory", caption="Tiểu mục"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("SubCategory"), k_cnt.inst().strip()],
        rows=CP.dim("SubCategory"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("SubCategory"), k_cnt.ref(), "DESC")))

    # Root cause bar
    sheets.append(V.chart(
        "Nguyen nhan goc", "Phân tích nguyên nhân gốc", "Complaints",
        deps=[CP.dep("RootCauseGroup", caption="Nguyên nhân"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("RootCauseGroup"), k_cnt.inst().strip()],
        rows=CP.dim("RootCauseGroup"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("RootCauseGroup"), k_cnt.ref(), "DESC")))

    # Severity mix (bar, colored by severity via sequential)
    sheets.append(V.chart(
        "Muc do", "Khiếu nại theo mức độ nghiêm trọng", "Complaints",
        deps=[CP.dep("Severity", caption="Mức độ"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("Severity"), k_cnt.inst().strip()],
        rows=CP.dim("Severity"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Severity",
        data_label=k_cnt.ref()))

    # Corrective action status
    sheets.append(V.chart(
        "Trang thai xu ly", "Trạng thái hành động khắc phục", "Complaints",
        deps=[CP.dep("CorrectiveAction", caption="Hành động"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("CorrectiveAction"), k_cnt.inst().strip()],
        rows=CP.dim("CorrectiveAction"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("CorrectiveAction"), k_cnt.ref(), "DESC")))

    names = ["KPI Tong", "KPI Dang xu ly", "KPI Nghiem trong", "KPI Da khac phuc",
             "Pareto tieu muc", "Nguyen nhan goc", "Muc do", "Trang thai xu ly"]
    dash = V.dashboard("VACS - Phan Tich Khieu Nai", [
        V.header_band("Phân tích Khiếu nại theo Loại", "Pareto · Nguyên nhân gốc · Hành động khắc phục"),
        V.hrow(["KPI Tong", "KPI Dang xu ly", "KPI Nghiem trong", "KPI Da khac phuc"], 15000, kpi=True),
        V.hrow(["Pareto tieu muc"], 42000, minw=200),
        V.hrow(["Nguyen nhan goc", "Muc do", "Trang thai xu ly"], 39000, minw=130),
    ], height=1180)
    xml = V.workbook(["Complaints"], calcs, sheets, names, dash, "VACS - Phan Tich Khieu Nai")
    print(f"D2: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Phan Tich Khieu Nai")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Phan Tich Khieu Nai")
        V.render(wb_id, "d2")
