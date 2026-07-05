"""Build D2 Kinh Doanh & Phễu — to the D1 FINAL standard.

Layout (fixed 1560x1100, rounded cards, unified TH/KHNS/KPI colors):
- KPI strip: Tổng Leads · Booking · Deal · Tỷ lệ chốt · Lost
- Phễu Kinh doanh (Lead→Deal, excl Ciel) · Leads theo Nguồn khách
- Deal theo Tháng vs KHNS/KPI (bullet) · Deal theo Dự án
- Deal theo Phân khúc KH · Deal theo Loại sản phẩm
KPI numbers, rings and colors get finalized by the user on Desktop (same flow
as D1); this build gives correct data + the standard chart set.

User Desktop refinements applied to the LIVE workbook (2026-07-05), captured for
reference — these are hand-tuned pixel/interaction items best done on Desktop,
NOT regenerated here (they don't round-trip cleanly from code):
- KPI strip: fixed pixel height (zone is-fixed fixed-size≈136, leaf non-cell-
  size-h≈33) so the 2-line KPI (số + '▲102% so KHNS') shows in full.
- Row-2 layout: asymmetric — Phễu + Nguồn khách stacked left (~40%), DealThang
  right (~60%) as the hero chart, with its color legend WELDED beneath it into a
  single rounded card (chart bottom corners squared, legend bottom corners
  rounded). See tableau-exec-dashboard skill §7.
- 6 dashboard filter-actions (one per chart) for cross-filtering. Skill §4c.
The funnel below IS now code-authored via mey_lib.funnel_chart (learned). If you
rebuild + republish, re-apply the layout/actions on Desktop or clone them.
"""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc

def build():
    M.reset_zids()
    # ── KPI calcs (operating funnel — Leads table; COUNTD immune to fan-out) ──
    k_leads = Calc("0090020000000001", "Tổng Leads", "integer", "measure", "quantitative",
                   'COUNTD(IF [ProjectName (Leads)] != "Meypearl Ciel Phú Quốc" THEN [LeadId] END)', "n#,##0")
    k_booking = Calc("0090020000000004", "Booking", "integer", "measure", "quantitative",
                     'COUNTD(IF [Status] = "Booking" AND [ProjectName (Leads)] != "Meypearl Ciel Phú Quốc" THEN [LeadId] END)', "n#,##0")
    k_deal = Calc("0090020000000002", "Deal", "integer", "measure", "quantitative",
                  "COUNTD([SaleId])", "n#,##0")
    k_conv = Calc("0090020000000003", "Tỷ lệ chốt", "real", "measure", "quantitative",
                  'COUNTD([SaleId]) / COUNTD(IF [ProjectName (Leads)] != "Meypearl Ciel Phú Quốc" THEN [LeadId] END)', "p0.0%")
    k_lost = Calc("0090020000000005", "Lost", "integer", "measure", "quantitative",
                  'COUNTD(IF [Status] = "Lost" AND [ProjectName (Leads)] != "Meypearl Ciel Phú Quốc" THEN [LeadId] END)', "n#,##0")

    # funnel count (excl Ciel), deal count (Sales)
    f_cnt = Calc("0090020000000007", "Số Leads", "integer", "measure", "quantitative",
                 'COUNTD(IF [ProjectName (Leads)] != "Meypearl Ciel Phú Quốc" THEN [LeadId] END)', "n#,##0")
    d_cnt = Calc("0090020000000008", "Số Deal", "integer", "measure", "quantitative",
                 "COUNTD([SaleId])", "n#,##0")
    calcs = [k_leads, k_booking, k_deal, k_conv, k_lost, f_cnt, d_cnt]

    sheets = []
    # KPI cards. Deal has a plan comparison (2.335 vs KHNS 2.281 = 102%) → 2-line
    # pct card + ring (like D1). Others have no direct plan → plain number cards.
    sheets.append(M.kpi_card("KPI Leads", k_leads, "Tổng Leads"))
    sheets.append(M.kpi_card("KPI Booking", k_booking, "Booking"))
    sheets.append(M.kpi_card("KPI Deal", k_deal, "Deal"))  # ring gauge (vs KPI) carries the comparison; 5 cards too narrow for number+%line+ring
    sheets.append(M.kpi_card("KPI Tỷ lệ chốt", k_conv, "Tỷ lệ chốt"))
    sheets.append(M.kpi_card("KPI Lost", k_lost, "Lost"))

    # Chart 1: Phễu Kinh doanh — TRUE funnel (user's D2 technique, mey_lib.funnel_chart):
    # mark=Automatic, measure-on-rows + size-encoding = tapered silhouette, color
    # BY Status stage (ds-level map, dark→light by depth), 2-line custom label,
    # computed-sort DESC, and drop the terminal 'Lost' stage so it reads as one
    # clean pipeline. (Was a plain sequential-blue Bar; the user reshaped it on
    # Desktop → learned + encoded here. See tableau-exec-dashboard skill §4b.)
    sheets.append(M.funnel_chart("PheuGiaiDoan", "Phễu Kinh doanh (Lead → Deal)",
        "Status", f_cnt, include_stages=["Lead", "NET", "Visit", "Booking", "Deal"]))

    # Chart 2: Leads theo Nguồn khách
    sheets.append(M.chart("NguonKhach", "Leads theo Nguồn khách",
        [M.raw_dep("Source", "Count", "string", "dimension", "nominal", "nominal"),
         k_leads.dep_col().strip()],
        [M.inst_dim("Source"), k_leads.inst().strip()],
        rows=M.ref_dim("Source"), cols=k_leads.ref(),
        mark="Bar", encodings=[("color", k_leads.ref())], color_palette="Mey Sequential Blue",
        data_label=k_leads.ref()))

    # Chart 3: Deal theo Tháng vs KHNS & KPI (bullet) — uses PlanTargets SanLuong
    # metric (deal-equivalent plan/actual/kpi). Actual here = ActualValue where
    # Metric=SanLuong; but bullet_chart needs 3 raw measures. PlanTargets stores
    # PlanValue/ActualValue/KpiValue as separate columns — filtered to SanLuong.
    # Simpler + consistent: reuse the monthly UnitsSold bullet (deals ≈ units).
    sheets.append(M.bullet_chart("DealThang", "Deal theo Tháng (TH/KHNS/KPI)",
        "Month", "UnitsSold (MonthlyFinancial)", "UnitsSoldPlan", "UnitsSoldKpi", fmt="n#,##0"))

    # Chart 4: Deal theo Dự án
    sheets.append(M.chart("DealDuAn", "Deal theo Dự án",
        [M.raw_dep("ProjectName", "Count", "string", "dimension", "nominal", "nominal"),
         d_cnt.dep_col().strip()],
        [M.inst_dim("ProjectName"), d_cnt.inst().strip()],
        rows=M.ref_dim("ProjectName"), cols=d_cnt.ref(),
        mark="Bar", encodings=[("color", d_cnt.ref())], color_palette="Mey Sequential Blue",
        data_label=d_cnt.ref()))

    # Chart 5: Deal theo Phân khúc KH
    sheets.append(M.chart("PhanKhuc", "Deal theo Phân khúc KH",
        [M.raw_dep("CustomerSegment", "Count", "string", "dimension", "nominal", "nominal"),
         d_cnt.dep_col().strip()],
        [M.inst_dim("CustomerSegment"), d_cnt.inst().strip()],
        rows=M.ref_dim("CustomerSegment"), cols=d_cnt.ref(),
        mark="Bar", encodings=[("color", d_cnt.ref())], color_palette="Mey Sequential Blue",
        data_label=d_cnt.ref()))

    # Chart 6: Deal theo Loại sản phẩm
    sheets.append(M.chart("LoaiSP", "Deal theo Loại sản phẩm",
        [M.raw_dep("UnitType", "Count", "string", "dimension", "nominal", "nominal"),
         d_cnt.dep_col().strip()],
        [M.inst_dim("UnitType"), d_cnt.inst().strip()],
        rows=M.ref_dim("UnitType"), cols=d_cnt.ref(),
        mark="Bar", encodings=[("color", d_cnt.ref())], color_palette="Mey Sequential Blue",
        data_label=d_cnt.ref()))

    names = ["KPI Leads","KPI Booking","KPI Deal","KPI Tỷ lệ chốt","KPI Lost",
             "PheuGiaiDoan","NguonKhach","DealThang","DealDuAn","PhanKhuc","LoaiSP"]
    dash = M.dashboard("Kinh Doanh &amp; Phễu", [
        M.hrow(["KPI Leads","KPI Booking","KPI Deal","KPI Tỷ lệ chốt","KPI Lost"], 20000, kpi=True),
        M.hrow(["PheuGiaiDoan","NguonKhach","DealThang"], 42000, minw=120),
        M.hrow(["DealDuAn","PhanKhuc","LoaiSP"], 38000, minw=120),
    ], width=1560, height=1100)
    xml = M.workbook(calcs, sheets, names, dash, "Kinh Doanh &amp; Phễu")
    Path("/tmp/wb-mey-d2.twb").write_text(xml, encoding="utf-8")
    print(f"D2: {len(xml):,} bytes  XML {M.validate(xml)}")

if __name__ == "__main__":
    build()
