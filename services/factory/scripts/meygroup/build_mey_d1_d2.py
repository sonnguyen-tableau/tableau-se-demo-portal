"""Build D1 Tài Chính + D2 Kinh Doanh & Phễu for Mey Group.

D1 (per template JPEG): 4 KPI (Sản lượng, Doanh số, Tiền thu, Công nợ) +
  Doanh số theo dự án (Thực hiện) · Sản lượng theo tháng · Dòng tiền theo dự án
  · Công nợ theo nhóm tuổi (donut) · Công nợ theo dự án (donut) · Lợi nhuận theo miền
D2 (funnel spec): 5 KPI + Phễu 6 bước · Tỷ lệ chuyển đổi · Nguồn khách ·
  Deal theo dự án · KH vs TH theo tháng · Phân khúc KH
"""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc, DS

# ══ D1 TÀI CHÍNH ══════════════════════════════════════════════════════════
def build_d1():
    M.reset_zids()
    # Calc fields (tỷ VND formats)
    TY = 'n#,##0.0,,,&quot;tỷ&quot;'  # ÷1e9 → tỷ  (escaped inside will be re-escaped)
    ty_fmt = 'n#,##0,,,"tỷ"'
    calc_doanhso = Calc("0090010000000001", "Tổng doanh số", "real", "measure", "quantitative",
                        "SUM([DealValueVnd])", ty_fmt)
    calc_tienthu = Calc("0090010000000002", "Tổng tiền thu", "real", "measure", "quantitative",
                        "SUM([AmountCollectedVnd])", ty_fmt)
    calc_congno = Calc("0090010000000003", "Công nợ phải thu", "real", "measure", "quantitative",
                       "SUM([AmountDueVnd]) - SUM([AmountCollectedVnd])", ty_fmt)
    calc_sanluong = Calc("0090010000000004", "Sản lượng (căn)", "integer", "measure", "quantitative",
                         "COUNTD([SaleId])", "n#,##0")
    calc_loinhuan = Calc("0090010000000005", "Lợi nhuận", "real", "measure", "quantitative",
                         "SUM([ProfitVnd])", ty_fmt)
    calcs = [calc_doanhso, calc_tienthu, calc_congno, calc_sanluong, calc_loinhuan]

    sheets = []
    # 4 KPI cards
    sheets.append(M.kpi_card("KPI Sản lượng", calc_sanluong, "Sản lượng (căn)"))
    sheets.append(M.kpi_card("KPI Doanh số", calc_doanhso, "Doanh số"))
    sheets.append(M.kpi_card("KPI Tiền thu", calc_tienthu, "Tiền thu"))
    sheets.append(M.kpi_card("KPI Công nợ", calc_congno, "Công nợ phải thu"))

    # Chart 1: Doanh số theo dự án (bar)
    sheets.append(M.chart("DoanhSoTheoDuAn", "Doanh số theo Dự án",
        [M.raw_dep("ProjectName", "Count", "string", "dimension", "nominal", "nominal"),
         M.raw_dep("DealValueVnd", "Sum", "real")],
        [M.inst_dim("ProjectName"), M.inst_agg("DealValueVnd", "Sum")],
        rows=M.ref_dim("ProjectName"), cols=M.ref_agg("DealValueVnd"),
        mark="Bar", encodings=[("color", M.ref_dim("ProjectName"))]))

    # Chart 2: Doanh số theo tháng (bar, from MonthlyFinancial)
    sheets.append(M.chart("DoanhSoTheoThang", "Doanh số theo Tháng",
        [M.raw_dep("Month", "Year", "datetime", "dimension", "ordinal", "ordinal"),
         M.raw_dep("RevenueVnd", "Sum", "real")],
        [M.inst_month("Month"), M.inst_agg("RevenueVnd", "Sum")],
        rows=M.ref_agg("RevenueVnd"), cols=M.ref_month("Month"),
        mark="Bar"))

    # Chart 3: Dòng tiền thu theo dự án (bar)
    sheets.append(M.chart("DongTienTheoDuAn", "Dòng tiền thu theo Dự án",
        [M.raw_dep("ProjectName (MonthlyFinancial)", "Count", "string", "dimension", "nominal", "nominal", caption="Dự án"),
         M.raw_dep("CashCollectedVnd", "Sum", "real")],
        [M.inst_dim("ProjectName (MonthlyFinancial)"), M.inst_agg("CashCollectedVnd", "Sum")],
        rows=M.ref_dim("ProjectName (MonthlyFinancial)"), cols=M.ref_agg("CashCollectedVnd"),
        mark="Bar"))

    # Chart 4: Công nợ theo nhóm tuổi (donut)
    sheets.append(M.chart("CongNoTheoTuoi", "Công nợ theo Nhóm tuổi nợ",
        [M.raw_dep("AgingBucket", "Count", "string", "dimension", "nominal", "nominal"),
         M.raw_dep("AmountDueVnd", "Sum", "real")],
        [M.inst_dim("AgingBucket"), M.inst_agg("AmountDueVnd", "Sum")],
        rows="", cols="",
        mark="Pie", encodings=[("color", M.ref_dim("AgingBucket")), ("angle", M.ref_agg("AmountDueVnd"))]))

    # Chart 5: Công nợ còn phải thu theo dự án (donut)
    sheets.append(M.chart("CongNoTheoDuAn", "Công nợ còn phải thu theo Dự án",
        [M.raw_dep("ProjectName (Collections)", "Count", "string", "dimension", "nominal", "nominal", caption="Dự án"),
         M.raw_dep("AmountDueVnd", "Sum", "real")],
        [M.inst_dim("ProjectName (Collections)"), M.inst_agg("AmountDueVnd", "Sum")],
        rows="", cols="",
        mark="Pie", encodings=[("color", M.ref_dim("ProjectName (Collections)")), ("angle", M.ref_agg("AmountDueVnd"))]))

    # Chart 6: Lợi nhuận theo Miền (bar)
    sheets.append(M.chart("LoiNhuanTheoMien", "Lợi nhuận theo Miền",
        [M.raw_dep("Region (MonthlyFinancial)", "Count", "string", "dimension", "nominal", "nominal", caption="Miền"),
         M.raw_dep("ProfitVnd", "Sum", "real")],
        [M.inst_dim("Region (MonthlyFinancial)"), M.inst_agg("ProfitVnd", "Sum")],
        rows=M.ref_dim("Region (MonthlyFinancial)"), cols=M.ref_agg("ProfitVnd"),
        mark="Bar", encodings=[("color", M.ref_dim("Region (MonthlyFinancial)"))]))

    names = ["KPI Sản lượng", "KPI Doanh số", "KPI Tiền thu", "KPI Công nợ",
             "DoanhSoTheoDuAn", "DoanhSoTheoThang", "DongTienTheoDuAn",
             "CongNoTheoTuoi", "CongNoTheoDuAn", "LoiNhuanTheoMien"]
    # Layout-flow distributes zones EQUALLY regardless of the w attribute, so a
    # narrow 3rd-of-a-row donut gets its title-wrapped and squished. Give the two
    # công-nợ donuts a half-width each on their own row, and Lợi nhuận its own
    # full-width row below.
    dash = M.dashboard("Tài Chính", [
        M.hrow(["KPI Sản lượng", "KPI Doanh số", "KPI Tiền thu", "KPI Công nợ"], 20000),
        M.hrow(["DoanhSoTheoDuAn", "DoanhSoTheoThang", "DongTienTheoDuAn"], 40000, minw=120),
        M.hrow(["CongNoTheoTuoi", "CongNoTheoDuAn"], 22000, minw=160),
        M.hrow(["LoiNhuanTheoMien"], 18000, minw=200),
    ])
    xml = M.workbook(calcs, sheets, names, dash, "Tài Chính")
    Path("/tmp/wb-mey-taichinh.twb").write_text(xml, encoding="utf-8")
    print(f"D1 Tài Chính: {len(xml):,} bytes  XML {M.validate(xml)}")


# ══ D2 KINH DOANH & PHỄU ══════════════════════════════════════════════════
def build_d2():
    M.reset_zids()
    ty_fmt = 'n#,##0,,,"tỷ"'
    calc_leads = Calc("0090020000000001", "Tổng Leads", "integer", "measure", "quantitative",
                      "COUNTD([LeadId])", "n#,##0")
    calc_deals = Calc("0090020000000002", "Tổng Deal", "integer", "measure", "quantitative",
                      'COUNTD(IF [Status] = "Deal" THEN [LeadId] END)', "n#,##0")
    calc_convrate = Calc("0090020000000003", "Tỷ lệ chốt Deal", "real", "measure", "quantitative",
                         'COUNTD(IF [Status] = "Deal" THEN [LeadId] END) / COUNTD([LeadId])', "p0.0%")
    calc_booking = Calc("0090020000000004", "Tổng Booking", "integer", "measure", "quantitative",
                        'COUNTD(IF [Status] = "Booking" THEN [LeadId] END)', "n#,##0")
    calc_lost = Calc("0090020000000005", "Tổng Lost", "integer", "measure", "quantitative",
                     'COUNTD(IF [Status] = "Lost" THEN [LeadId] END)', "n#,##0")
    # Funnel stage-order sort key so bars display Lead→NET→Visit→Booking→Deal
    calc_stageorder = Calc("0090020000000006", "Thứ tự giai đoạn", "integer", "dimension", "ordinal",
        'CASE [Status] WHEN "Lead" THEN 1 WHEN "NET" THEN 2 WHEN "Visit" THEN 3 '
        'WHEN "Booking" THEN 4 WHEN "Deal" THEN 5 WHEN "Lost" THEN 6 END', None)
    calcs = [calc_leads, calc_deals, calc_convrate, calc_booking, calc_lost, calc_stageorder]

    sheets = []
    sheets.append(M.kpi_card("KPI Leads", calc_leads, "Tổng Leads"))
    sheets.append(M.kpi_card("KPI Booking", calc_booking, "Booking"))
    sheets.append(M.kpi_card("KPI Deal", calc_deals, "Deal"))
    sheets.append(M.kpi_card("KPI Tỷ lệ chốt", calc_convrate, "Tỷ lệ chốt Deal"))
    sheets.append(M.kpi_card("KPI Lost", calc_lost, "Lost"))

    # Chart 1: Phễu 6 giai đoạn (bar). EXCLUDE Ciel (Rumor, 1247 Lead-status
    # rows would swamp the operating funnel) via a count calc that only counts
    # non-Ciel leads — avoids fragile categorical-filter XML.
    calc_funnel_cnt = Calc("0090020000000007", "Số Leads (trừ Ciel)", "integer", "measure", "quantitative",
        'COUNTD(IF [ProjectName (Leads)] != "Mey Pearl Ciel Phú Quốc" THEN [LeadId] END)', "n#,##0")
    calcs.append(calc_funnel_cnt)
    sheets.append(M.chart("PheuGiaiDoan", "Phễu Kinh doanh (Lead → Deal)",
        [M.raw_dep("Status", "Count", "string", "dimension", "nominal", "nominal"),
         calc_funnel_cnt.dep_col().strip()],
        [M.inst_dim("Status"), calc_funnel_cnt.inst().strip()],
        rows=M.ref_dim("Status"), cols=calc_funnel_cnt.ref(),
        mark="Bar", encodings=[("color", M.ref_dim("Status"))]))

    # Chart 2: Nguồn khách (bar)
    sheets.append(M.chart("NguonKhach", "Leads theo Nguồn khách",
        [M.raw_dep("Source", "Count", "string", "dimension", "nominal", "nominal"),
         M.raw_dep("LeadId", "Count", "integer", "dimension", "ordinal", "ordinal")],
        [M.inst_dim("Source"), M.inst_cntd("LeadId").strip()],
        rows=M.ref_dim("Source"), cols=M.ref_cntd("LeadId"),
        mark="Bar", encodings=[("color", M.ref_dim("Source"))]))

    # Deal count calc — COUNTD on Sales' own key, immune to Collections fan-out.
    calc_dealcnt = Calc("0090020000000008", "Số Deal (Sales)", "integer", "measure", "quantitative",
        "COUNTD([SaleId])", "n#,##0")
    calcs.append(calc_dealcnt)

    # Chart 3: Deal theo dự án (bar, from Sales)
    sheets.append(M.chart("DealTheoDuAn", "Deal theo Dự án",
        [M.raw_dep("ProjectName", "Count", "string", "dimension", "nominal", "nominal"),
         calc_dealcnt.dep_col().strip()],
        [M.inst_dim("ProjectName"), calc_dealcnt.inst().strip()],
        rows=M.ref_dim("ProjectName"), cols=calc_dealcnt.ref(),
        mark="Bar", encodings=[("color", M.ref_dim("ProjectName"))]))

    # Chart 4: KH vs TH theo tháng (Deal metric from PlanTargets)
    sheets.append(M.chart("KHvsTH", "Kế hoạch vs Thực hiện (Deal theo tháng)",
        [M.raw_dep("Month (PlanTargets)", "Year", "datetime", "dimension", "ordinal", "ordinal", caption="Tháng"),
         M.raw_dep("Metric", "Count", "string", "dimension", "nominal", "nominal"),
         M.raw_dep("PlanValue", "Sum", "integer"),
         M.raw_dep("ActualValue", "Sum", "integer")],
        [M.inst_month("Month (PlanTargets)"), M.inst_dim("Metric"),
         M.inst_agg("PlanValue", "Sum"), M.inst_agg("ActualValue", "Sum")],
        rows=M.ref_agg("ActualValue"), cols=M.ref_month("Month (PlanTargets)"),
        mark="Line"))

    # Chart 5: Phân khúc KH (bar, from Sales)
    sheets.append(M.chart("PhanKhucKH", "Deal theo Phân khúc KH",
        [M.raw_dep("CustomerSegment", "Count", "string", "dimension", "nominal", "nominal"),
         calc_dealcnt.dep_col().strip()],
        [M.inst_dim("CustomerSegment"), calc_dealcnt.inst().strip()],
        rows=M.ref_dim("CustomerSegment"), cols=calc_dealcnt.ref(),
        mark="Bar", encodings=[("color", M.ref_dim("CustomerSegment"))]))

    # Chart 6: Loại sản phẩm (bar)
    sheets.append(M.chart("LoaiSanPham", "Deal theo Loại sản phẩm",
        [M.raw_dep("UnitType", "Count", "string", "dimension", "nominal", "nominal"),
         calc_dealcnt.dep_col().strip()],
        [M.inst_dim("UnitType"), calc_dealcnt.inst().strip()],
        rows=M.ref_dim("UnitType"), cols=calc_dealcnt.ref(),
        mark="Bar", encodings=[("color", M.ref_dim("UnitType"))]))

    names = ["KPI Leads", "KPI Booking", "KPI Deal", "KPI Tỷ lệ chốt", "KPI Lost",
             "PheuGiaiDoan", "NguonKhach", "DealTheoDuAn", "KHvsTH", "PhanKhucKH", "LoaiSanPham"]
    dash = M.dashboard("Kinh Doanh &amp; Phễu", [
        M.hrow(["KPI Leads", "KPI Booking", "KPI Deal", "KPI Tỷ lệ chốt", "KPI Lost"], 22000),
        M.hrow(["PheuGiaiDoan", "NguonKhach", "DealTheoDuAn"], 39000, minw=120),
        M.hrow(["KHvsTH", "PhanKhucKH", "LoaiSanPham"], 39000, minw=120),
    ])
    xml = M.workbook(calcs, sheets, names, dash, "Kinh Doanh &amp; Phễu")
    Path("/tmp/wb-mey-pheu.twb").write_text(xml, encoding="utf-8")
    print(f"D2 Phễu: {len(xml):,} bytes  XML {M.validate(xml)}")


if __name__ == "__main__":
    build_d1()
    build_d2()
