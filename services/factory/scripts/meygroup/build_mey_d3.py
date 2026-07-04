"""D3 Dự Án & Gói Thầu — construction/package accountability, to D1 standard."""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc

def build():
    M.reset_zids()
    # KPI calcs
    k_pkg = Calc("0090030000000101", "Tổng gói thầu", "integer", "measure", "quantitative",
                 "COUNTD([PackageId])", "n#,##0")
    k_done = Calc("0090030000000102", "Hoàn thành", "integer", "measure", "quantitative",
                  'COUNTD(IF [Status (Packages)] = "Hoàn thành" THEN [PackageId] END)', "n#,##0")
    k_delay = Calc("0090030000000103", "Chậm tiến độ", "integer", "measure", "quantitative",
                   'COUNTD(IF [Status (Packages)] = "Chậm tiến độ" THEN [PackageId] END)', "n#,##0")
    k_prog = Calc("0090030000000104", "Tiến độ TB", "real", "measure", "quantitative",
                  "AVG([ProgressPct])", "p0%")
    k_delaywk = Calc("0090030000000105", "Tổng tuần chậm", "integer", "measure", "quantitative",
                     "SUM([DelayWeeks])", "n#,##0")
    calcs = [k_pkg, k_done, k_delay, k_prog, k_delaywk]

    sheets = []
    sheets.append(M.kpi_card("KPI Gói thầu", k_pkg, "Tổng gói thầu"))
    sheets.append(M.kpi_card("KPI Hoàn thành", k_done, "Hoàn thành"))
    sheets.append(M.kpi_card("KPI Chậm", k_delay, "Chậm tiến độ"))
    sheets.append(M.kpi_card("KPI Tiến độ TB", k_prog, "Tiến độ TB"))
    sheets.append(M.kpi_card("KPI Tuần chậm", k_delaywk, "Tổng tuần chậm"))

    # Chart 1: Tiến độ TB theo Dự án (bar, %) — use the p0%-formatted calc
    # (k_prog = AVG(ProgressPct) with p0% default-format) so axis + labels show
    # 59%, 88% not raw 0.5933.
    sheets.append(M.chart("TienDoDuAn", "Tiến độ TB theo Dự án",
        [M.raw_dep("ProjectName (Packages)", "Count", "string", "dimension", "nominal", "nominal", caption="Dự án"),
         k_prog.dep_col().strip()],
        [M.inst_dim("ProjectName (Packages)"), k_prog.inst().strip()],
        rows=M.ref_dim("ProjectName (Packages)"), cols=k_prog.ref(),
        mark="Bar", encodings=[("color", k_prog.ref())],
        color_palette="Mey Sequential Blue", data_label=k_prog.ref()))

    # Chart 2: Số gói theo Trạng thái (bar) — Đúng/Chậm/Hoàn thành
    sheets.append(M.chart("GoiTheoTrangThai", "Số gói thầu theo Trạng thái",
        [M.raw_dep("Status (Packages)", "Count", "string", "dimension", "nominal", "nominal", caption="Trạng thái"),
         k_pkg.dep_col().strip()],
        [M.inst_dim("Status (Packages)"), k_pkg.inst().strip()],
        rows=M.ref_dim("Status (Packages)"), cols=k_pkg.ref(),
        mark="Bar", encodings=[("color", k_pkg.ref())], color_palette="Mey Sequential Blue",
        data_label=k_pkg.ref()))

    # Chart 3: Tuần chậm theo Dự án (bar) — where delays concentrate
    sheets.append(M.chart("TuanChamDuAn", "Số tuần chậm theo Dự án",
        [M.raw_dep("ProjectName (Packages)", "Count", "string", "dimension", "nominal", "nominal", caption="Dự án"),
         M.raw_dep("DelayWeeks", "Sum", "integer")],
        [M.inst_dim("ProjectName (Packages)"), M.inst_agg("DelayWeeks", "Sum")],
        rows=M.ref_dim("ProjectName (Packages)"), cols=M.ref_agg("DelayWeeks"),
        mark="Bar", encodings=[("color", M.ref_agg("DelayWeeks"))], color_palette="Mey Sequential Blue",
        data_label=M.ref_agg("DelayWeeks")))

    # Chart 4: Gói chậm theo Bộ phận gây tắc (bar) — accountability
    sheets.append(M.chart("BoPhanTac", "Gói chậm theo Bộ phận gây tắc",
        [M.raw_dep("BlockingDepartment", "Count", "string", "dimension", "nominal", "nominal", caption="Bộ phận"),
         k_delay.dep_col().strip()],
        [M.inst_dim("BlockingDepartment"), k_delay.inst().strip()],
        rows=M.ref_dim("BlockingDepartment"), cols=k_delay.ref(),
        mark="Bar", encodings=[("color", k_delay.ref())], color_palette="Mey Sequential Blue",
        data_label=k_delay.ref()))

    # Chart 5: Tiến độ TB theo Loại gói (bar) — Móng/Kết cấu/MEP/...
    sheets.append(M.chart("TienDoLoaiGoi", "Tiến độ TB theo Loại gói thầu",
        [M.raw_dep("PackageName", "Count", "string", "dimension", "nominal", "nominal", caption="Loại gói"),
         k_prog.dep_col().strip()],
        [M.inst_dim("PackageName"), k_prog.inst().strip()],
        rows=M.ref_dim("PackageName"), cols=k_prog.ref(),
        mark="Bar", encodings=[("color", k_prog.ref())],
        color_palette="Mey Sequential Blue", data_label=k_prog.ref()))

    names = ["KPI Gói thầu","KPI Hoàn thành","KPI Chậm","KPI Tiến độ TB","KPI Tuần chậm",
             "TienDoDuAn","GoiTheoTrangThai","TuanChamDuAn","BoPhanTac","TienDoLoaiGoi"]
    dash = M.dashboard("Dự Án &amp; Gói Thầu", [
        M.hrow(["KPI Gói thầu","KPI Hoàn thành","KPI Chậm","KPI Tiến độ TB","KPI Tuần chậm"], 20000, kpi=True),
        M.hrow(["TienDoDuAn","GoiTheoTrangThai","TuanChamDuAn"], 42000, minw=120),
        M.hrow(["BoPhanTac","TienDoLoaiGoi"], 38000, minw=140),
    ], width=1560, height=1100)
    xml = M.workbook(calcs, sheets, names, dash, "Dự Án &amp; Gói Thầu")
    Path("/tmp/wb-mey-d3.twb").write_text(xml, encoding="utf-8")
    print(f"D3: {len(xml):,} bytes  XML {M.validate(xml)}")

if __name__ == "__main__":
    build()
