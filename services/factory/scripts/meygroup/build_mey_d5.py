"""D5 Kênh Đại Lý — 8 sàn agency performance, to D1 standard.
Key CEO insight: support budget is NOT correlated with performance."""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc

def build():
    M.reset_zids()
    tr = 'n#,##0,,,"tỷ"'
    # Agencies table: one row per sàn (8 rows). SUM aggregations.
    k_san = Calc("0090050000000101", "Số sàn", "integer", "measure", "quantitative",
                 "COUNTD([AgencyName])", "n#,##0")
    k_leads = Calc("0090050000000102", "Leads giới thiệu", "integer", "measure", "quantitative",
                   "SUM([LeadsReferred])", "n#,##0")
    k_deals = Calc("0090050000000103", "Deal qua sàn", "integer", "measure", "quantitative",
                   "SUM([DealCount])", "n#,##0")
    k_rev = Calc("0090050000000104", "Doanh số qua sàn", "real", "measure", "quantitative",
                 "SUM([RevenueVnd (Agencies)])", tr)
    k_support = Calc("0090050000000105", "Ngân sách hỗ trợ", "real", "measure", "quantitative",
                     "SUM([SupportBudgetVnd])", tr)
    k_conv = Calc("0090050000000106", "Tỷ lệ chuyển đổi", "real", "measure", "quantitative",
                  "SUM([DealCount]) / SUM([LeadsReferred])", "p0.0%")
    calcs = [k_san, k_leads, k_deals, k_rev, k_support, k_conv]

    sheets = []
    sheets.append(M.kpi_card("KPI Số sàn", k_san, "Số sàn"))
    sheets.append(M.kpi_card("KPI Leads sàn", k_leads, "Leads giới thiệu"))
    sheets.append(M.kpi_card("KPI Deal sàn", k_deals, "Deal qua sàn"))
    sheets.append(M.kpi_card("KPI Doanh số sàn", k_rev, "Doanh số qua sàn"))
    sheets.append(M.kpi_card("KPI Hỗ trợ", k_support, "Ngân sách hỗ trợ"))

    # Chart 1: Doanh số theo Sàn (bar ranking) — CEN top
    sheets.append(M.chart("DoanhSoSan", "Doanh số theo Sàn giao dịch",
        [M.raw_dep("AgencyName", "Count", "string", "dimension", "nominal", "nominal", caption="Sàn"),
         k_rev.dep_col().strip()],
        [M.inst_dim("AgencyName"), k_rev.inst().strip()],
        rows=M.ref_dim("AgencyName"), cols=k_rev.ref(),
        mark="Bar", encodings=[("color", k_rev.ref())], color_palette="Mey Sequential Blue",
        data_label=k_rev.ref()))

    # Chart 2: Tỷ lệ chuyển đổi theo Sàn (bar) — CEN best (10.2%)
    sheets.append(M.chart("ConversionSan", "Tỷ lệ chuyển đổi theo Sàn",
        [M.raw_dep("AgencyName", "Count", "string", "dimension", "nominal", "nominal", caption="Sàn"),
         k_conv.dep_col().strip()],
        [M.inst_dim("AgencyName"), k_conv.inst().strip()],
        rows=M.ref_dim("AgencyName"), cols=k_conv.ref(),
        mark="Bar", encodings=[("color", k_conv.ref())], color_palette="Mey Sequential Blue",
        data_label=k_conv.ref()))

    # Chart 3: Ngân sách hỗ trợ theo Sàn (bar) — the "support" side
    sheets.append(M.chart("HoTroSan", "Ngân sách hỗ trợ theo Sàn",
        [M.raw_dep("AgencyName", "Count", "string", "dimension", "nominal", "nominal", caption="Sàn"),
         k_support.dep_col().strip()],
        [M.inst_dim("AgencyName"), k_support.inst().strip()],
        rows=M.ref_dim("AgencyName"), cols=k_support.ref(),
        mark="Bar", encodings=[("color", k_support.ref())], color_palette="Mey Sequential Blue",
        data_label=k_support.ref()))

    # Chart 4: Hỗ trợ vs Doanh số theo Sàn (scatter) — the CEO insight: NOT
    # correlated. x=support, y=revenue, one mark per sàn.
    sheets.append(M.chart("HoTroVsDoanhSo", "Hỗ trợ vs Doanh số theo Sàn (tương quan?)",
        [M.raw_dep("AgencyName", "Count", "string", "dimension", "nominal", "nominal", caption="Sàn"),
         k_support.dep_col().strip(), k_rev.dep_col().strip()],
        [M.inst_dim("AgencyName"), k_support.inst().strip(), k_rev.inst().strip()],
        rows=k_rev.ref(), cols=k_support.ref(),
        mark="Circle", encodings=[("color", M.ref_dim("AgencyName"))]))

    # Chart 5: Deal theo Sàn (bar)
    sheets.append(M.chart("DealSan", "Deal qua Sàn",
        [M.raw_dep("AgencyName", "Count", "string", "dimension", "nominal", "nominal", caption="Sàn"),
         k_deals.dep_col().strip()],
        [M.inst_dim("AgencyName"), k_deals.inst().strip()],
        rows=M.ref_dim("AgencyName"), cols=k_deals.ref(),
        mark="Bar", encodings=[("color", k_deals.ref())], color_palette="Mey Sequential Blue",
        data_label=k_deals.ref()))

    names = ["KPI Số sàn","KPI Leads sàn","KPI Deal sàn","KPI Doanh số sàn","KPI Hỗ trợ",
             "DoanhSoSan","ConversionSan","HoTroSan","HoTroVsDoanhSo","DealSan"]
    dash = M.dashboard("Kênh Đại Lý", [
        M.hrow(["KPI Số sàn","KPI Leads sàn","KPI Deal sàn","KPI Doanh số sàn","KPI Hỗ trợ"], 16000, kpi=True),
        M.hrow(["DoanhSoSan","ConversionSan","HoTroSan"], 46000, minw=120),
        M.hrow(["HoTroVsDoanhSo","DealSan"], 38000, minw=140),
    ], width=1560, height=1240)
    xml = M.workbook(calcs, sheets, names, dash, "Kênh Đại Lý")
    Path("/tmp/wb-mey-d5.twb").write_text(xml, encoding="utf-8")
    print(f"D5: {len(xml):,} bytes  XML {M.validate(xml)}")

if __name__ == "__main__":
    build()
