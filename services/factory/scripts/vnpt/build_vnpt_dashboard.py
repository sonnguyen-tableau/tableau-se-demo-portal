"""VNPT — "Quản trị điều hành" (Executive Control Tower) — single premium dashboard.

Layout (top→bottom, VOTD telecom-exec vocabulary):
  Header band ·
  6 spark-KPI cards: Doanh thu · ARPU · Thuê bao · Phát triển ròng · Churn · 5G ·
  Phát triển thuê bao ròng theo tháng (diverging bar, blue up / red down) ·
  [Doanh thu theo tháng 2025 (max-month emphasis)] + [Doanh thu theo dịch vụ (ranked)] ·
  [Bản đồ 63 tỉnh — doanh thu (size) × churn (màu)] + [Nguyên nhân rời mạng (Pareto)].

All primitives PROBED on the extract path first (probe_extract.py / probe2.py):
  custom-lat/lon map ✓ · SIGN-measure diverging bar ✓ · ranked bars ✓ ·
  emphasis month chart ✓ · sparkline KPIs ✓. (Geocoded-name map and pie donut
  were rejected in probing.)

YoY deltas baked deterministically (seed=42): Doanh thu +4.4% · ARPU +4.3% ·
Thuê bao +4.3% · Net adds -4.1% · Churn -0.16pp (cải thiện) · 5G +83%.

Run: uv run python scripts/vnpt/build_vnpt_dashboard.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vnpt_lib as V
from vnpt_lib import Calc, Table

CY = 2025
WB = "VNPT - Quan Tri Dieu Hanh"

# Currency / count formats.
# CRITICAL Tableau format ordering (VACS-proven): scaling commas go BETWEEN the
# grouping and the decimal — `#,##0,,,.1` (÷1e9, 1 dp), NOT `#,##0.1,,,`. Commas
# placed AFTER the decimal (`.0,,`) are ignored → the raw un-scaled number shows.
F_TY = 'n#,##0,,," tỷ"'           # VND → tỷ (÷1e9)
F_TY_PLAIN = 'n#,##0,,,'          # VND → tỷ, no suffix (bar labels)
F_DONG = 'n#,##0" ₫"'             # raw VND (ARPU)
F_TRIEU1 = 'n#,##0,,.1" triệu"'   # count → triệu (÷1e6), 1 dp
F_TRIEU2 = 'n#,##0,,.2" triệu"'   # count → triệu, 2 dp
F_PCT2 = 'n#,##0.00"%"'
F_INT = "n#,##0"


def build():
    V.reset_zids()
    MT = Table("MonthlyTotals")
    MS = Table("MonthlyService")
    PS = Table("ProvinceSummary")
    CR = Table("ChurnReasons")

    # ── Headline KPI calcs (2025) ──
    k_rev = Calc("MonthlyTotals", "0200000001", "Doanh thu 2025", "real", "measure", "quantitative",
                 f"SUM(IF [Year]={CY} THEN [RevenueVnd] END)", F_TY)
    k_arpu = Calc("MonthlyTotals", "0200000002", "ARPU 2025", "real", "measure", "quantitative",
                  f"AVG(IF [Year]={CY} THEN [Arpu] END)", F_DONG)
    k_sub = Calc("MonthlyTotals", "0200000003", "Thuê bao cuối kỳ", "real", "measure", "quantitative",
                 f"SUM(IF [Year]={CY} AND [MonthNum]=12 THEN [TotalSubscribers] END)", F_TRIEU1)
    k_na = Calc("MonthlyTotals", "0200000004", "Phát triển ròng 2025", "real", "measure", "quantitative",
                f"SUM(IF [Year]={CY} THEN [NetAdds] END)", F_TRIEU2)
    k_churn = Calc("MonthlyTotals", "0200000005", "Tỷ lệ rời mạng", "real", "measure", "quantitative",
                   f"AVG(IF [Year]={CY} THEN [ChurnRatePct] END)", F_PCT2)
    k_5g = Calc("MonthlyTotals", "0200000006", "Thuê bao 5G", "real", "measure", "quantitative",
                f"SUM(IF [Year]={CY} AND [MonthNum]=12 THEN [FiveGSubs] END)", F_TRIEU1)

    # ── Monthly-trend calcs (sparklines — MonthlyTotals is 1 row/month) ──
    rev_mo = Calc("MonthlyTotals", "0200000021", "DT/tháng", "real", "measure", "quantitative", "SUM([RevenueVnd])", F_TY)
    arpu_mo = Calc("MonthlyTotals", "0200000022", "ARPU/tháng", "real", "measure", "quantitative", "AVG([Arpu])", F_DONG)
    sub_mo = Calc("MonthlyTotals", "0200000023", "TB/tháng", "real", "measure", "quantitative", "SUM([TotalSubscribers])", F_INT)
    na_mo = Calc("MonthlyTotals", "0200000024", "Ròng/tháng", "real", "measure", "quantitative", "SUM([NetAdds])", F_INT)
    churn_mo = Calc("MonthlyTotals", "0200000025", "Churn/tháng", "real", "measure", "quantitative", "AVG([ChurnRatePct])", F_PCT2)
    fiveg_mo = Calc("MonthlyTotals", "0200000026", "5G/tháng", "real", "measure", "quantitative", "SUM([FiveGSubs])", F_INT)

    # ── Net-adds diverging monthly bar (2025 only, to match the KPI cards) ──
    net = Calc("MonthlyTotals", "0200000031", "Phát triển ròng", "integer", "measure", "quantitative",
               f"SUM(IF [Year]={CY} THEN [NetAdds] END)", F_INT)
    net_k = Calc("MonthlyTotals", "0200000032", "Ròng (nghìn)", "real", "measure", "quantitative",
                 f"SUM(IF [Year]={CY} THEN [NetAdds] END)/1000", 'n#,##0"K"')
    sign = Calc("MonthlyTotals", "0200000033", "Chiều", "real", "measure", "quantitative",
                f"SIGN(SUM(IF [Year]={CY} THEN [NetAdds] END))", F_INT)

    # ── Revenue monthly emphasis (2025; calc nulls-out 2024 so Month bucket = CY only) ──
    rev_emph = Calc("MonthlyTotals", "0200000041", "Doanh thu tháng", "real", "measure", "quantitative",
                    f"SUM(IF [Year]={CY} THEN [RevenueVnd] END)", F_TY_PLAIN)

    # ── Service revenue ranked bar (2025) ──
    s_rev = Calc("MonthlyService", "0200000051", "Doanh thu dịch vụ", "real", "measure", "quantitative",
                 f"SUM(IF [Year]={CY} THEN [RevenueVnd] END)", F_TY)

    # ── Province map calcs ──
    p_rev = Calc("ProvinceSummary", "0200000061", "Doanh thu", "real", "measure", "quantitative",
                 "SUM([RevenueVnd])", F_TY)
    p_churn = Calc("ProvinceSummary", "0200000062", "Tỷ lệ rời mạng", "real", "measure", "quantitative",
                   "AVG([ChurnRatePct])", F_PCT2)

    # ── Churn-reason Pareto ──
    c_cnt = Calc("ChurnReasons", "0200000071", "Số thuê bao rời", "integer", "measure", "quantitative",
                 "SUM([ChurnedCount])", F_INT)
    c_share = Calc("ChurnReasons", "0200000072", "Tỷ trọng", "real", "measure", "quantitative",
                   "SUM([SharePct])", 'n#,##0.0"%"')

    calcs = [k_rev, k_arpu, k_sub, k_na, k_churn, k_5g,
             rev_mo, arpu_mo, sub_mo, na_mo, churn_mo, fiveg_mo,
             net, net_k, sign, rev_emph, s_rev, p_rev, p_churn, c_cnt, c_share]

    sheets = []
    # KPI cards + sparklines
    KPI_SZ = 17
    sheets.append(V.kpi_card_delta("N DoanhThu", k_rev, "Doanh thu 2025", "▲ 4,4%", V.GOOD, "vs 2024", size=KPI_SZ, value_color=V.BRAND))
    sheets.append(V.sparkline("S DoanhThu", "MonthlyTotals", "Month", rev_mo, color=V.BRAND))
    sheets.append(V.kpi_card_delta("N ARPU", k_arpu, "ARPU (₫/tháng)", "▲ 4,3%", V.GOOD, "vs 2024", size=KPI_SZ, value_color=V.BRAND))
    sheets.append(V.sparkline("S ARPU", "MonthlyTotals", "Month", arpu_mo, color=V.SKY))
    sheets.append(V.kpi_card_delta("N ThueBao", k_sub, "Tổng thuê bao (cuối kỳ)", "▲ 4,3%", V.GOOD, "vs 2024", size=KPI_SZ, value_color=V.NAVY))
    sheets.append(V.sparkline("S ThueBao", "MonthlyTotals", "Month", sub_mo, color=V.BRAND))
    sheets.append(V.kpi_card_delta("N NetAdds", k_na, "Phát triển ròng (năm)", "▼ 4,1%", V.WARN, "vs 2024", size=KPI_SZ, value_color=V.NAVY))
    sheets.append(V.sparkline("S NetAdds", "MonthlyTotals", "Month", na_mo, color=V.SKY))
    sheets.append(V.kpi_card_delta("N Churn", k_churn, "Tỷ lệ rời mạng · thấp là tốt", "▼ 0,16đ%", V.GOOD, "cải thiện", size=KPI_SZ, value_color=V.GOOD))
    sheets.append(V.sparkline("S Churn", "MonthlyTotals", "Month", churn_mo, color=V.GOOD))
    sheets.append(V.kpi_card_delta("N 5G", k_5g, "Thuê bao 5G (cuối kỳ)", "▲ 83%", V.GOOD, "vs 2024", size=KPI_SZ, value_color=V.BRAND))
    sheets.append(V.sparkline("S 5G", "MonthlyTotals", "Month", fiveg_mo, color=V.BRAND))

    # Net-adds diverging bar (hero momentum)
    sheets.append(V.diverging_month_bar(
        "Net adds thang", "Phát triển thuê bao ròng theo tháng · xanh = tăng, đỏ = giảm",
        "MonthlyTotals", "Month", net, sign, label_calc=net_k))

    # Revenue monthly emphasis (2025)
    sheets.append(V.emphasis_month_chart(
        "Doanh thu thang", "Doanh thu theo tháng 2025 (tỷ ₫) · tháng cao nhất = đậm nhất",
        "MonthlyTotals", "Month", rev_emph))

    # Service revenue ranked bar (2025)
    sheets.append(V.chart(
        "Doanh thu dich vu", "Doanh thu theo dịch vụ 2025", "MonthlyService",
        deps=[MS.dep("ServiceName", caption="Dịch vụ"), s_rev.dep_col().strip()],
        insts=[MS.dim_inst("ServiceName"), s_rev.inst().strip()],
        rows=MS.dim("ServiceName"), cols=s_rev.ref(), mark="Bar",
        encodings=[("color", s_rev.ref())], color_palette="VNPT Sequential Blue",
        data_label=s_rev.ref(), computed_sort=(MS.dim("ServiceName"), s_rev.ref(), "DESC"),
        bar_size=0.7))

    # Province bubble map (size=revenue, color=churn)
    sheets.append(V.map_custom(
        "Ban do tinh", "Doanh thu & tỷ lệ rời mạng theo 63 tỉnh/thành",
        "ProvinceSummary", "Lat", "Lon", p_rev, "Province",
        color_calc=p_churn, color_palette="VNPT Sequential Blue"))

    # Churn-reason Pareto (ranked)
    sheets.append(V.chart(
        "Nguyen nhan roi mang", "Nguyên nhân rời mạng (chia sẻ %)", "ChurnReasons",
        deps=[CR.dep("Reason", caption="Nguyên nhân"), c_cnt.dep_col().strip(), c_share.dep_col().strip()],
        insts=[CR.dim_inst("Reason"), c_cnt.inst().strip(), c_share.inst().strip()],
        rows=CR.dim("Reason"), cols=c_cnt.ref(), mark="Bar",
        encodings=[("color", c_cnt.ref())], color_palette="VNPT Sequential Blue",
        data_label=c_share.ref(), computed_sort=(CR.dim("Reason"), c_cnt.ref(), "DESC"),
        bar_size=0.7))

    names = ["N DoanhThu", "S DoanhThu", "N ARPU", "S ARPU", "N ThueBao", "S ThueBao",
             "N NetAdds", "S NetAdds", "N Churn", "S Churn", "N 5G", "S 5G",
             "Net adds thang", "Doanh thu thang", "Doanh thu dich vu",
             "Ban do tinh", "Nguyen nhan roi mang"]

    dash = V.dashboard(WB, [
        V.header_band("Quản trị điều hành — Trung tâm điều hành", "Tập đoàn VNPT · 2024–2025"),
        V.spark_hrow([("N DoanhThu", "S DoanhThu"), ("N ARPU", "S ARPU"),
                      ("N ThueBao", "S ThueBao"), ("N NetAdds", "S NetAdds"),
                      ("N Churn", "S Churn"), ("N 5G", "S 5G")], 24000),
        V.hrow(["Net adds thang"], 26000, minw=200),
        V.hrow(["Doanh thu thang", "Doanh thu dich vu"], 26000, minw=200),
        V.hrow(["Ban do tinh", "Nguyen nhan roi mang"], 44000, minw=220),
    ], width=1600, height=1480)

    xml = V.workbook(["MonthlyTotals", "MonthlyService", "ProvinceSummary", "ChurnReasons"],
                     calcs, sheets, names, dash, WB)
    print(f"DASHBOARD: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, WB)


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, WB)
        V.render(wb_id, "dashboard")
