"""Singapore Airlines — 3-page workbook, self-contained .twbx.

Pages (design research grounded — see the airline-dashboard exemplars):
  1. Network & Revenue Pulse    — 5 spark-KPI cards + revenue/traffic monthly
                                  trend + region revenue ranked bar + PLF trend
  2. Route & Network Performance — destinations bubble map (SAFE hand-authored
                                  map: custom lat/lon) + region ranked bars
                                  (revenue, load factor, YoY growth)
  3. Customer & Loyalty         — cabin-class revenue mix (donut + ranked bar) +
                                  KrisFlyer member growth + tier mix

All viz PROBED first (probe_sia.py): custom-lat/lon bubble map ✓, KPI cards ✓,
ranked bars ✓, cabin donut ✓. English labels, SGD.

Run: uv run python scripts/singaporeair/build_sia_dashboard.py [--publish]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import sia_lib as S
from sia_lib import Calc, Table

from app.generators.singaporeair import SingaporeAirParameters, generate_singaporeair

WB = "Singapore Airlines - Network Control Tower"
MP = "monthly_performance"
RP = "region_performance"
DE = "destinations"
CB = "cabin_class"
KF = "loyalty_krisflyer"

# Number formats. Scaling commas go BEFORE the decimal; ,,,=÷1e9, ,,=÷1e6, ,=÷1e3.
F_BN = 'n"S$"#,##0,,,.2"B"'         # SGD → billions (÷1e9)
F_MN = 'n"S$"#,##0,,.0"M"'          # SGD → millions (÷1e6)
F_PCT = 'n#,##0.0"%"'
F_PAX_M = 'n#,##0,,.1"M"'           # pax → millions (÷1e6); commas BEFORE decimal
F_MEM_M = 'n#,##0,,.2"M"'           # members → millions (÷1e6); commas BEFORE decimal
F_YIELD = 'n#,##0.0"¢"'
F_ASK = 'n#,##0,.1"B"'              # million seat-km → billion (÷1e3)
F_INT = "n#,##0"


def _arrow(v, favorable_up=True):
    up = v >= 0
    arrow = "▲" if up else "▼"
    color = S.GOOD if (up == favorable_up) else S.BAD
    return f"{arrow} {v:+.1f}%", color


def _pp(v, favorable_up=True):
    """percentage-point delta label."""
    up = v >= 0
    arrow = "▲" if up else "▼"
    color = S.GOOD if (up == favorable_up) else S.BAD
    return f"{arrow} {v:+.1f}pt", color


def _kpis():
    ds = generate_singaporeair(SingaporeAirParameters())
    m = ds.monthly_performance
    cy, ly = m[m.Year == 2025], m[m.Year == 2024]
    rev_cy, rev_ly = cy.RevenueSgd.sum(), ly.RevenueSgd.sum()
    pax_cy, pax_ly = cy.PassengersCarried.sum(), ly.PassengersCarried.sum()
    plf_cy, plf_ly = cy.LoadFactorPct.mean(), ly.LoadFactorPct.mean()
    yld_cy, yld_ly = cy.YieldCentsPerRpk.mean(), ly.YieldCentsPerRpk.mean()
    ask_cy, ask_ly = cy.AskMillion.sum(), ly.AskMillion.sum()
    return dict(
        rev=(rev_cy / rev_ly - 1) * 100,
        pax=(pax_cy / pax_ly - 1) * 100,
        plf=plf_cy - plf_ly,
        yld=(yld_cy / yld_ly - 1) * 100,
        ask=(ask_cy / ask_ly - 1) * 100,
    )


def _cy(cid, cap, col, agg, fmt):
    return Calc(MP, cid, cap, "real", "measure", "quantitative",
               f"{agg}(IF [Year]=2025 THEN [{col}] END)", fmt)


def build():
    K = _kpis()
    rp, cb = Table(RP), Table(CB)

    # ── Page 1 KPI value calcs (2025 full-year) ──
    k_rev = _cy("0300000001", "Revenue (FY2025)", "RevenueSgd", "SUM", F_BN)
    k_pax = Calc(MP, "0300000002", "Passengers", "real", "measure", "quantitative",
                 "SUM(IF [Year]=2025 THEN [PassengersCarried] END)", F_PAX_M)
    k_plf = _cy("0300000003", "Load Factor", "LoadFactorPct", "AVG", F_PCT)
    k_yld = _cy("0300000004", "Passenger Yield", "YieldCentsPerRpk", "AVG", F_YIELD)
    k_ask = Calc(MP, "0300000005", "Capacity (ASK)", "real", "measure", "quantitative",
                 "SUM(IF [Year]=2025 THEN [AskMillion] END)", F_ASK)

    # ── Sparklines (monthly, full 24m) ──
    s_rev = Calc(MP, "0300000011", "Revenue", "real", "measure", "quantitative", "SUM([RevenueSgd])", F_BN)
    s_pax = Calc(MP, "0300000012", "Pax", "real", "measure", "quantitative", "SUM([PassengersCarried])", F_INT)
    s_plf = Calc(MP, "0300000013", "PLF", "real", "measure", "quantitative", "AVG([LoadFactorPct])", F_PCT)
    s_yld = Calc(MP, "0300000014", "Yield", "real", "measure", "quantitative", "AVG([YieldCentsPerRpk])", F_YIELD)
    s_ask = Calc(MP, "0300000015", "ASK", "real", "measure", "quantitative", "SUM([AskMillion])", F_INT)

    # ── Hero revenue trend + PLF trend ──
    hero_rev = Calc(MP, "0300000020", "Revenue", "real", "measure", "quantitative", "SUM([RevenueSgd])", F_BN)
    plf_trend = Calc(MP, "0300000021", "Load Factor", "real", "measure", "quantitative", "AVG([LoadFactorPct])", F_PCT)

    # ── Region calcs ──
    rev_reg = Calc(RP, "0300000030", "Revenue", "real", "measure", "quantitative", "SUM([RevenueSgd])", F_BN)
    plf_reg = Calc(RP, "0300000031", "Load Factor", "real", "measure", "quantitative", "AVG([LoadFactorPct])", F_PCT)
    grow_reg = Calc(RP, "0300000032", "Growth YoY", "real", "measure", "quantitative", "AVG([GrowthYoYPct])", F_PCT)

    # ── Map calcs ──
    map_size = Calc(DE, "0300000040", "Passengers", "real", "measure", "quantitative", "SUM([PassengersCarried])", F_INT)
    map_color = Calc(DE, "0300000041", "Load Factor", "real", "measure", "quantitative", "AVG([LoadFactorPct])", F_PCT)

    # ── Cabin calcs ──
    cab_rev = Calc(CB, "0300000050", "Revenue", "real", "measure", "quantitative", "SUM([RevenueSgd])", F_BN)
    cab_yield = Calc(CB, "0300000051", "Yield Index", "real", "measure", "quantitative", "AVG([YieldIndex])", 'n#,##0.0"x"')

    # ── KrisFlyer calcs ──
    kf_members = Calc(KF, "0300000060", "KrisFlyer Members", "real", "measure", "quantitative",
                      "SUM(IF [Year]=2025 AND [MonthNum]=12 THEN [TotalMembers] END)", F_MEM_M)
    kf_trend = Calc(KF, "0300000061", "Members", "real", "measure", "quantitative", "SUM([TotalMembers])", F_MEM_M)

    # ═══ PAGE 1 — Network & Revenue Pulse ═══
    rev_t, rev_c = _arrow(K["rev"], True)
    pax_t, pax_c = _arrow(K["pax"], True)
    plf_t, plf_c = _pp(K["plf"], True)
    yld_t, yld_c = _arrow(K["yld"], True)   # yield down YoY = red (real story)
    ask_t, ask_c = _arrow(K["ask"], True)

    kpi_cards = [
        S.kpi_card_delta("K1_rev", k_rev, "Group Revenue", rev_t, rev_c, "vs FY2024", size=18),
        S.kpi_card_delta("K2_pax", k_pax, "Passengers Carried", pax_t, pax_c, "vs FY2024"),
        S.kpi_card_delta("K3_plf", k_plf, "Passenger Load Factor", plf_t, plf_c, "vs FY2024"),
        S.kpi_card_delta("K4_yld", k_yld, "Passenger Yield", yld_t, yld_c, "vs FY2024"),
        S.kpi_card_delta("K5_ask", k_ask, "Capacity (ASK)", ask_t, ask_c, "vs FY2024", size=17),
    ]
    sparks = [
        S.sparkline("SP1_rev", MP, "Month", s_rev, color=S.BRAND),
        S.sparkline("SP2_pax", MP, "Month", s_pax, color=S.CYAN),
        S.sparkline("SP3_plf", MP, "Month", s_plf, color=S.BRAND),
        S.sparkline("SP4_yld", MP, "Month", s_yld, color=S.GOLD),
        S.sparkline("SP5_ask", MP, "Month", s_ask, color=S.CYAN),
    ]
    hero_ws = S.line_trend("P1_hero", "Group revenue by month (FY2024–FY2025)", MP, "Month", hero_rev, color=S.BRAND)
    plf_ws = S.line_trend("P1_plf", "Passenger load factor by month", MP, "Month", plf_trend, color=S.CYAN)
    region_bar1 = S.chart(
        "P1_region", "Revenue by region", RP,
        deps=[rp.dep("Region"), rev_reg.dep_col()], insts=[rp.dim_inst("Region"), rev_reg.inst()],
        rows=rp.dim("Region"), cols=rev_reg.ref(), mark="Bar",
        single_color=S.BRAND, data_label=rev_reg.ref(),
        computed_sort=(rp.dim("Region"), rev_reg.ref(), "descending"))

    p1_sheets = kpi_cards + sparks + [hero_ws, plf_ws, region_bar1]
    p1_rows = [
        S.header_band("Network & Revenue Pulse", "How the airline is performing"),
        S.spark_hrow([("K1_rev", "SP1_rev"), ("K2_pax", "SP2_pax"), ("K3_plf", "SP3_plf"),
                      ("K4_yld", "SP4_yld"), ("K5_ask", "SP5_ask")], 20000),
        S.hrow(["P1_hero", "P1_plf"], 32000),
        S.hrow(["P1_region"], 30000),
    ]
    dash1 = S.dashboard("SIA Network & Revenue Pulse", p1_rows)

    # ═══ PAGE 2 — Route & Network Performance ═══
    dest_map = S.map_custom("P2_map", "Destinations — passengers (size) × load factor (colour)", DE,
                            "Lat", "Lon", map_size, "City", color_calc=map_color,
                            color_palette="SIA Sequential Blue")
    region_plf = S.chart(
        "P2_plf", "Load factor by region", RP,
        deps=[rp.dep("Region"), plf_reg.dep_col()], insts=[rp.dim_inst("Region"), plf_reg.inst()],
        rows=rp.dim("Region"), cols=plf_reg.ref(), mark="Bar",
        single_color=S.CYAN, data_label=plf_reg.ref(),
        computed_sort=(rp.dim("Region"), plf_reg.ref(), "descending"))
    region_grow = S.chart(
        "P2_growth", "Traffic growth YoY by region", RP,
        deps=[rp.dep("Region"), grow_reg.dep_col()], insts=[rp.dim_inst("Region"), grow_reg.inst()],
        rows=rp.dim("Region"), cols=grow_reg.ref(), mark="Bar",
        single_color=S.GOLD, data_label=grow_reg.ref(),
        computed_sort=(rp.dim("Region"), grow_reg.ref(), "descending"))
    p2_rows = [
        S.header_band("Route & Network Performance", "Where the network flies and how it fills"),
        S.hrow(["P2_map"], 40000),
        S.hrow(["P2_plf", "P2_growth"], 30000),
    ]
    dash2 = S.dashboard("SIA Route & Network", p2_rows)

    # ═══ PAGE 3 — Customer & Loyalty ═══
    # Cabin revenue as a ranked bar (a donut collapses to a sliver in a
    # half-row zone — the VNPT lesson; ranked bar reads far better).
    cabin_rev_bar = S.chart(
        "P3_cabin_rev", "Passenger revenue by cabin class", CB,
        deps=[cb.dep("CabinClass"), cab_rev.dep_col()], insts=[cb.dim_inst("CabinClass"), cab_rev.inst()],
        rows=cb.dim("CabinClass"), cols=cab_rev.ref(), mark="Bar",
        single_color=S.BRAND, data_label=cab_rev.ref(),
        computed_sort=(cb.dim("CabinClass"), cab_rev.ref(), "descending"))
    cabin_yield = S.chart(
        "P3_cabin_yield", "Yield index by cabin class (Economy = 1.0x)", CB,
        deps=[cb.dep("CabinClass"), cab_yield.dep_col()], insts=[cb.dim_inst("CabinClass"), cab_yield.inst()],
        rows=cb.dim("CabinClass"), cols=cab_yield.ref(), mark="Bar",
        single_color=S.GOLD, data_label=cab_yield.ref(),
        computed_sort=(cb.dim("CabinClass"), cab_yield.ref(), "descending"))
    kf_hero = S.kpi_card_delta("P3_kf_kpi", kf_members, "KrisFlyer Members (latest)",
                               "▲ +25.0%", S.GOOD, "8M → 10M since Jan 2024", size=18)
    kf_line = S.line_trend("P3_kf_trend", "KrisFlyer members by month", KF, "Month", kf_trend, color=S.GOLD)
    p3_rows = [
        S.header_band("Customer & Loyalty", "Cabin mix and KrisFlyer growth"),
        S.hrow(["P3_cabin_rev", "P3_cabin_yield"], 32000),
        S.spark_hrow([("P3_kf_kpi", "P3_kf_trend")], 30000),
    ]
    dash3 = S.dashboard("SIA Customer & Loyalty", p3_rows)

    # ── Assemble ──
    all_sheets = (p1_sheets + [dest_map, region_plf, region_grow]
                  + [cabin_rev_bar, cabin_yield, kf_hero, kf_line])
    all_names = [s.split("name='")[1].split("'")[0] for s in all_sheets]
    all_calcs = [k_rev, k_pax, k_plf, k_yld, k_ask,
                 s_rev, s_pax, s_plf, s_yld, s_ask,
                 hero_rev, plf_trend, rev_reg, plf_reg, grow_reg,
                 map_size, map_color, cab_rev, cab_yield,
                 kf_members, kf_trend]
    dash_xml = "\n".join([dash1, dash2, dash3])
    dash_names = ["SIA Network & Revenue Pulse", "SIA Route & Network", "SIA Customer & Loyalty"]
    xml = S.workbook([MP, RP, DE, CB, KF], all_calcs, all_sheets, all_names, dash_xml, dash_names)
    print("validate:", S.validate(xml))
    twbx = S.package_twbx(xml, WB)
    print(f"twbx: {twbx}  ({twbx.stat().st_size:,} bytes)")
    return twbx


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wid = S.publish(twbx, WB)
        S.render(wid, WB)
