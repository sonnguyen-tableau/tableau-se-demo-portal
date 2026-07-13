"""PROBE risky SIA viz BEFORE authoring the full 3-page workbook.

Riskiest element (design research flagged it): the DESTINATIONS BUBBLE MAP —
custom numeric Lat/Lon with geographic semantic-role. Also probe: a KPI card,
a ranked region bar, and the cabin-class donut. Sheets left VISIBLE → REST views.

Run: uv run python scripts/singaporeair/probe_sia.py --publish
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sia_lib as S
from sia_lib import Calc, Table

WB = "SIA - PROBE"
MP = "monthly_performance"
RP = "region_performance"
DE = "destinations"
CB = "cabin_class"

F_PCT = 'n#,##0.0"%"'
F_BN = 'n"S$"#,##0,,.2"B"'
F_INT = "n#,##0"


def build():
    S.reset_zids()
    rp, de, cb = Table(RP), Table(DE), Table(CB)

    # 1) KPI: latest PLF
    k_plf = Calc(MP, "0100000001", "Load Factor", "real", "measure", "quantitative",
                 "AVG(IF [Year]=2025 THEN [LoadFactorPct] END)", F_PCT)

    # 2) region ranked bar (revenue)
    bar = S.chart(
        "P_REGION", "Revenue by region", RP,
        deps=[rp.dep("Region"), rp.dep("RevenueSgd")],
        insts=[rp.dim_inst("Region"), rp.agg_inst("RevenueSgd")],
        rows=rp.dim("Region"), cols=rp.measure("RevenueSgd"), mark="Bar",
        single_color=S.BRAND, data_label=rp.measure("RevenueSgd"),
        computed_sort=(rp.dim("Region"), rp.measure("RevenueSgd"), "descending"))

    # 3) destinations bubble map (THE RISKY ONE) — size=pax, color=PLF
    size_pax = Calc(DE, "0100000002", "Passengers", "real", "measure", "quantitative",
                    "SUM([PassengersCarried])", F_INT)
    color_plf = Calc(DE, "0100000003", "Load Factor", "real", "measure", "quantitative",
                     "AVG([LoadFactorPct])", F_PCT)
    mp = S.map_custom("P_MAP", "Destinations — passengers × load factor", DE,
                      "Lat", "Lon", size_pax, "City", color_calc=color_plf,
                      color_palette="SIA Sequential Blue")

    # 4) cabin donut
    cab_rev = Calc(CB, "0100000004", "Revenue", "real", "measure", "quantitative",
                   "SUM([RevenueSgd])", F_BN)
    dn = S.donut("P_CABIN", "Revenue by cabin class", CB, "CabinClass", cab_rev,
                 color_palette="SIA Sequential Blue")

    kpi = S.kpi_card_delta("P_KPI", k_plf, "Load Factor", "▼ -1.4pt", S.BAD, "vs last year")

    sheets = [kpi, bar, mp, dn]
    names = ["P_KPI", "P_REGION", "P_MAP", "P_CABIN"]
    rows = [S.header_band("PROBE", "risky viz check"),
            S.hrow(["P_KPI"], 10000), S.hrow(["P_REGION"], 26000),
            S.hrow(["P_MAP"], 40000), S.hrow(["P_CABIN"], 30000)]
    dash = S.dashboard("SIA PROBE", rows)
    calcs = [k_plf, size_pax, color_plf, cab_rev]
    xml = S.workbook([MP, RP, DE, CB], calcs, sheets, names, dash, ["SIA PROBE"])
    print("validate:", S.validate(xml))
    xml = xml.replace("<window class='worksheet' hidden='true'", "<window class='worksheet'")
    twbx = S.package_twbx(xml, WB)
    print("twbx:", twbx, twbx.stat().st_size, "bytes")
    return twbx


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wid = S.publish(twbx, WB)
        S.render(wid, WB)
