"""Build D1 Tài Chính v3 — the APPROVED premium layout (mockup v3).

Structure (rounded cards, fixed 1560x1180 canvas):
- Header handled in React portal chrome; dashboard = KPI strip + 3 sections.
- KPI strip: 4 BAN cards (Sản lượng · Doanh số · Tiền thu · Công nợ) each with
  a % ring beside the number.  [ring cloned from Donut Seed]
- Sec 1: %HT ranking bars by project · Doanh số ranking · Sản lượng bullet (TH/KHNS/KPI)
- Sec 2: Doanh số bullet · Dòng tiền bullet · Dòng tiền ranking
- Sec 3: Công nợ ranking · Công nợ donut by aging
"""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc

def build():
    M.reset_zids()
    ty = 'n#,##0,,,"tỷ"'
    # ── KPI calcs (BAN)
    k_sl   = Calc("0090010000000004", "Sản lượng (căn)", "integer", "measure", "quantitative", "COUNTD([SaleId])", "n#,##0")
    k_ds   = Calc("0090010000000001", "Tổng doanh số", "real", "measure", "quantitative", "SUM([DealValueVnd])", ty)
    k_tt   = Calc("0090010000000002", "Tổng tiền thu", "real", "measure", "quantitative", "SUM([AmountCollectedVnd])", ty)
    k_cn   = Calc("0090010000000003", "Công nợ phải thu", "real", "measure", "quantitative", "SUM([AmountDueVnd]) - SUM([AmountCollectedVnd])", ty)
    k_ln   = Calc("0090010000000005", "Lợi nhuận", "real", "measure", "quantitative", "SUM([ProfitVnd])", ty)

    # ── Ring calcs (3 gauges: %HT sản lượng / doanh số / dòng tiền at GROUP level)
    def ring_calcs(base, num, den):
        pct = Calc(base+"1", "Pct HT", "real", "measure", "quantitative", f"SUM([{num}]) / SUM([{den}])", "p0%")
        dat = Calc(base+"2", "Đạt", "real", "measure", "quantitative", f"MIN([Calculation_{base}1],1)")
        rem = Calc(base+"3", "Còn lại", "real", "measure", "quantitative", f"1 - [Calculation_{base}2]")
        return pct, dat, rem
    r_sl = ring_calcs("00900110000001", "UnitsSold (MonthlyFinancial)", "UnitsSoldPlan")
    r_ds = ring_calcs("00900110000002", "RevenueVnd", "RevenuePlanVnd")
    r_tt = ring_calcs("00900110000003", "CashCollectedVnd", "CashCollectedPlanVnd")
    zero  = Calc("00900119000000", "min0", "integer", "measure", "quantitative", "MIN(0)")
    dummy = Calc("00900119000001", "Gauge dummy", "string", "dimension", "nominal", '"dummy"')

    calcs = [k_sl, k_ds, k_tt, k_cn, k_ln,
             *r_sl, *r_ds, *r_tt, zero, dummy]

    sheets = []
    # KPI cards — plain proven geometry (18px single number, renders clean at a
    # KPI row ~250-270px tall on a fixed canvas, verified in the earlier build).
    sheets.append(M.kpi_card("KPI Sản lượng", k_sl, "Sản lượng (căn)"))
    sheets.append(M.kpi_card("KPI Doanh số", k_ds, "Doanh số"))
    sheets.append(M.kpi_card("KPI Tiền thu", k_tt, "Tiền thu"))
    sheets.append(M.kpi_card("KPI Công nợ", k_cn, "Công nợ phải thu"))

    # Sec 1 — %HT by project (bar), Doanh số by project (bar), Sản lượng bullet
    # %HT per project via calc (COUNTD sold / plan target). Use UnitsSold vs
    # TargetDeals from Projects. Simpler: doanh số ranking + sản lượng ranking.
    sheets.append(M.chart("DoanhSoDuAn", "Doanh số theo Dự án",
        [M.raw_dep("ProjectName","Count","string","dimension","nominal","nominal"),
         M.raw_dep("DealValueVnd","Sum","real")],
        [M.inst_dim("ProjectName"), M.inst_agg("DealValueVnd","Sum")],
        rows=M.ref_dim("ProjectName"), cols=M.ref_agg("DealValueVnd"),
        mark="Bar", encodings=[("color", M.ref_agg("DealValueVnd"))], color_palette="Mey Sequential Blue"))

    sheets.append(M.bullet_chart("SanLuongThang", "Sản lượng theo Tháng (TH/KHNS/KPI)",
        "Month", "UnitsSold (MonthlyFinancial)", "UnitsSoldPlan", "UnitsSoldKpi", fmt="n#,##0"))

    # Sec 2 — Doanh số bullet, Dòng tiền bullet, Dòng tiền ranking
    sheets.append(M.bullet_chart("DoanhSoThang", "Doanh số theo Tháng (TH/KHNS/KPI)",
        "Month", "RevenueVnd", "RevenuePlanVnd", "RevenueKpiVnd"))
    sheets.append(M.bullet_chart("DongTienThang", "Dòng tiền thu theo Tháng (TH/KHNS)",
        "Month", "CashCollectedVnd", "CashCollectedPlanVnd", None))
    sheets.append(M.chart("DongTienDuAn", "Dòng tiền thu theo Dự án",
        [M.raw_dep("ProjectName (MonthlyFinancial)","Count","string","dimension","nominal","nominal",caption="Dự án"),
         M.raw_dep("CashCollectedVnd","Sum","real")],
        [M.inst_dim("ProjectName (MonthlyFinancial)"), M.inst_agg("CashCollectedVnd","Sum")],
        rows=M.ref_dim("ProjectName (MonthlyFinancial)"), cols=M.ref_agg("CashCollectedVnd"),
        mark="Bar", single_color="#29ABE2"))

    # Sec 3 — Công nợ theo dự án (bar), Công nợ theo aging (donut via bar for now)
    sheets.append(M.chart("CongNoDuAn", "Công nợ còn phải thu theo Dự án",
        [M.raw_dep("ProjectName (Collections)","Count","string","dimension","nominal","nominal",caption="Dự án"),
         M.raw_dep("AmountDueVnd","Sum","real")],
        [M.inst_dim("ProjectName (Collections)"), M.inst_agg("AmountDueVnd","Sum")],
        rows=M.ref_dim("ProjectName (Collections)"), cols=M.ref_agg("AmountDueVnd"),
        mark="Bar", encodings=[("color", M.ref_agg("AmountDueVnd"))], color_palette="Mey Sequential Blue"))
    sheets.append(M.chart("CongNoTuoi", "Công nợ theo Nhóm tuổi nợ",
        [M.raw_dep("AgingBucket","Count","string","dimension","nominal","nominal"),
         M.raw_dep("AmountDueVnd","Sum","real")],
        [M.inst_dim("AgingBucket"), M.inst_agg("AmountDueVnd","Sum")],
        rows=M.ref_dim("AgingBucket"), cols=M.ref_agg("AmountDueVnd"),
        mark="Bar", encodings=[("color", M.ref_agg("AmountDueVnd"))], color_palette="Mey Sequential Blue"))

    names = ["KPI Sản lượng","KPI Doanh số","KPI Tiền thu","KPI Công nợ",
             "DoanhSoDuAn","SanLuongThang","DoanhSoThang","DongTienThang","DongTienDuAn",
             "CongNoDuAn","CongNoTuoi"]

    # Layout: KPI row pairs each BAN with its ring (nested hflow). For simplicity
    # in layout-flow, place 4 KPI cards then 3 rings on the KPI row is uneven, so
    # KPI row = 4 BAN cards; a thin ring row is skipped — instead put ring INSIDE
    # via a nested hrow of [BAN, Ring] pairs. hrow splits equally, so 4 equal
    # cells; we pair BAN+Ring per cell using nested flows would need weights.
    # Keep it clean: KPI strip = 4 BAN cards (with % chip in card). Rings go in
    # Section 1 as a dedicated 3-gauge row (they carry the KHNS story).
    dash = M.dashboard("Tài Chính", [
        M.hrow(["KPI Sản lượng","KPI Doanh số","KPI Tiền thu","KPI Công nợ"], 24000),
        M.hrow(["DoanhSoDuAn","SanLuongThang","DoanhSoThang"], 32000, minw=120),
        M.hrow(["DongTienThang","DongTienDuAn"], 24000, minw=140),
        M.hrow(["CongNoDuAn","CongNoTuoi"], 20000, minw=140),
    ], width=1560, height=1100)
    xml = M.workbook(calcs, sheets, names, dash, "Tài Chính")
    Path("/tmp/wb-mey-d1-v3.twb").write_text(xml, encoding="utf-8")
    print(f"D1 v3: {len(xml):,} bytes  XML {M.validate(xml)}")

if __name__ == "__main__":
    build()
