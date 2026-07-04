"""D4 Nhân Sự — HR metrics, to D1 standard. Story: quỹ lương plan vs actual,
attrition spike in Kinh doanh T5-6, KPI progress, headcount, hiring."""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc

def build():
    M.reset_zids()
    tr = 'n#,##0,,,"tỷ"'
    # HRMetrics is monthly × dept. Headcount is a stock → use AVG for the KPI.
    k_hc = Calc("0090040000000101", "Headcount TB", "integer", "measure", "quantitative",
                "ROUND(AVG([Headcount]))", "n#,##0")
    k_payroll = Calc("0090040000000102", "Quỹ lương (thực)", "real", "measure", "quantitative",
                     "SUM([PayrollActualVnd])", tr)
    k_attr = Calc("0090040000000103", "Tỷ lệ nghỉ việc TB", "real", "measure", "quantitative",
                  "AVG([AttritionRate])", "p0.0%")
    k_kpi = Calc("0090040000000104", "KPI hoàn thành TB", "real", "measure", "quantitative",
                 "AVG([KpiProgressPct])", "p0%")
    k_hires = Calc("0090040000000105", "Tuyển mới", "integer", "measure", "quantitative",
                   "SUM([NewHires])", "n#,##0")
    calcs = [k_hc, k_payroll, k_attr, k_kpi, k_hires]

    sheets = []
    sheets.append(M.kpi_card("KPI Headcount", k_hc, "Headcount TB"))
    sheets.append(M.kpi_card("KPI Quỹ lương", k_payroll, "Quỹ lương (thực)"))
    sheets.append(M.kpi_card("KPI Nghỉ việc", k_attr, "Tỷ lệ nghỉ việc TB"))
    sheets.append(M.kpi_card("KPI Hoàn thành", k_kpi, "KPI hoàn thành TB"))
    sheets.append(M.kpi_card("KPI Tuyển mới", k_hires, "Tuyển mới"))

    # Chart 1: Quỹ lương Kế hoạch vs Thực hiện theo Tháng (grouped bullet, 2 series)
    sheets.append(M.bullet_chart("QuyLuongThang", "Quỹ lương theo Tháng (Kế hoạch vs Thực hiện)",
        "Month (HRMetrics)", "PayrollActualVnd", "PayrollPlanVnd", None, fmt=tr))

    # Chart 2: Headcount theo Bộ phận (bar)
    sheets.append(M.chart("HeadcountBoPhan", "Headcount theo Bộ phận",
        [M.raw_dep("Department", "Count", "string", "dimension", "nominal", "nominal", caption="Bộ phận"),
         k_hc.dep_col().strip()],
        [M.inst_dim("Department"), k_hc.inst().strip()],
        rows=M.ref_dim("Department"), cols=k_hc.ref(),
        mark="Bar", encodings=[("color", k_hc.ref())], color_palette="Mey Sequential Blue",
        data_label=k_hc.ref()))

    # Chart 3: Tỷ lệ nghỉ việc theo Bộ phận (bar) — Kinh doanh highest (spike)
    sheets.append(M.chart("NghiViecBoPhan", "Tỷ lệ nghỉ việc theo Bộ phận",
        [M.raw_dep("Department", "Count", "string", "dimension", "nominal", "nominal", caption="Bộ phận"),
         k_attr.dep_col().strip()],
        [M.inst_dim("Department"), k_attr.inst().strip()],
        rows=M.ref_dim("Department"), cols=k_attr.ref(),
        mark="Bar", encodings=[("color", k_attr.ref())], color_palette="Mey Sequential Blue",
        data_label=k_attr.ref()))

    # Chart 4: Tỷ lệ nghỉ việc theo Tháng (line) — Kinh doanh spike T5-6 signal.
    # Show trend for all depts is noisy; a monthly avg line highlights the H1 curve.
    sheets.append(M.chart("NghiViecThang", "Tỷ lệ nghỉ việc theo Tháng",
        [M.raw_dep("Month (HRMetrics)", "Year", "datetime", "dimension", "ordinal", "ordinal", caption="Tháng"),
         k_attr.dep_col().strip()],
        [M.inst_month("Month (HRMetrics)"), k_attr.inst().strip()],
        rows=k_attr.ref(), cols=M.ref_month("Month (HRMetrics)"),
        mark="Line", single_color="#1B75BC"))

    # Chart 5: KPI hoàn thành theo Bộ phận (bar)
    sheets.append(M.chart("KpiBoPhan", "KPI hoàn thành theo Bộ phận",
        [M.raw_dep("Department", "Count", "string", "dimension", "nominal", "nominal", caption="Bộ phận"),
         k_kpi.dep_col().strip()],
        [M.inst_dim("Department"), k_kpi.inst().strip()],
        rows=M.ref_dim("Department"), cols=k_kpi.ref(),
        mark="Bar", encodings=[("color", k_kpi.ref())], color_palette="Mey Sequential Blue",
        data_label=k_kpi.ref()))

    names = ["KPI Headcount","KPI Quỹ lương","KPI Nghỉ việc","KPI Hoàn thành","KPI Tuyển mới",
             "QuyLuongThang","HeadcountBoPhan","NghiViecBoPhan","NghiViecThang","KpiBoPhan"]
    dash = M.dashboard("Nhân Sự", [
        M.hrow(["KPI Headcount","KPI Quỹ lương","KPI Nghỉ việc","KPI Hoàn thành","KPI Tuyển mới"], 16000, kpi=True),
        M.hrow(["QuyLuongThang","HeadcountBoPhan","NghiViecBoPhan"], 46000, minw=120),
        M.hrow(["NghiViecThang","KpiBoPhan"], 38000, minw=140),
    ], width=1560, height=1240)
    xml = M.workbook(calcs, sheets, names, dash, "Nhân Sự")
    Path("/tmp/wb-mey-d4.twb").write_text(xml, encoding="utf-8")
    print(f"D4: {len(xml):,} bytes  XML {M.validate(xml)}")

if __name__ == "__main__":
    build()
