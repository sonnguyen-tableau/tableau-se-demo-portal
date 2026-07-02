"""Surgically upgrade D1's 5 KPI worksheets in-place — keep proven dashboard layout.

Strategy: take the WORKING /tmp/wb-nam-a-portfolio.twb (renders 400KB perfectly),
and only:
  1. Inject new v2 calc columns into its <datasources> block
  2. Replace each of the 5 KPI <worksheet> bodies with the v2 card (value + delta + arrow)
     — keeping the EXACT same worksheet name so dashboard zones still resolve.
Everything else (charts, dashboard layout, windows) stays byte-identical.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, "/tmp")
from nam_a_kpi_v2 import KPI, build_calc_columns, build_kpi_card, DS

SRC = Path("/tmp/wb-nam-a-portfolio.twb")

# Map: existing sheet name → KPI definition (windowed where a date field exists)
KPIS = {
    "KPI Tổng dư nợ": KPI(
        key="KPI Tổng dư nợ", title="Tổng dư nợ", base_id="810001",
        value_formula='SUM(IF [OriginationDate] >= DATEADD("month", -12, TODAY()) THEN [OutstandingBalance] END)',
        prior_formula='SUM(IF [OriginationDate] >= DATEADD("month", -24, TODAY()) AND [OriginationDate] < DATEADD("month", -12, TODAY()) THEN [OutstandingBalance] END)',
        fmt='c!vi_VN!#,##0,,,.1"T ₫";-#,##0,,,.1"T ₫"',
        windowed=True, date_field="OriginationDate",
    ),
    "KPI Tổng huy động": KPI(
        key="KPI Tổng huy động", title="Tổng huy động", base_id="810002",
        value_formula='SUM(IF [ProductGroup] = "Deposit" AND [OpenDate] >= DATEADD("month", -12, TODAY()) THEN [Balance] END)',
        prior_formula='SUM(IF [ProductGroup] = "Deposit" AND [OpenDate] >= DATEADD("month", -24, TODAY()) AND [OpenDate] < DATEADD("month", -12, TODAY()) THEN [Balance] END)',
        fmt='c!vi_VN!#,##0,,,.1"T ₫";-#,##0,,,.1"T ₫"',
        windowed=True, date_field="OpenDate",
    ),
    "KPI LDR": KPI(
        key="KPI LDR", title="LDR", base_id="810003",
        value_formula='SUM([OutstandingBalance]) / SUM(IF [ProductGroup] = "Deposit" THEN [Balance] END)',
        fmt='p0.0%', windowed=False,
    ),
    "KPI Số khách hàng bán lẻ": KPI(
        key="KPI Số khách hàng bán lẻ", title="Số khách hàng", base_id="810004",
        value_formula='COUNTD(IF [AcquisitionDate] >= DATEADD("month", -24, TODAY()) THEN [CustomerId (Customers)] END)',
        prior_formula='COUNTD(IF [AcquisitionDate] < DATEADD("month", -12, TODAY()) THEN [CustomerId (Customers)] END)',
        fmt='#,##0', windowed=True, date_field=None,
    ),
    "KPI Số chi nhánh": KPI(
        key="KPI Số chi nhánh", title="Số điểm GD", base_id="810005",
        value_formula='COUNTD([BranchId (Branches)])',
        fmt='#,##0', windowed=False,
    ),
}


def main():
    content = SRC.read_text(encoding="utf-8")

    # 1. Inject calc columns into <datasources> block (before last </datasource>)
    calc_xml = "\n".join(build_calc_columns(k) for k in KPIS.values())
    # Find the datasource that has the sqlproxy connection (the real one)
    idx = content.rfind("</datasource>\n  </datasources>")
    if idx == -1:
        # fallback: any </datasource> before </datasources>
        m = re.search(r"</datasource>\s*</datasources>", content)
        idx = m.start()
    content = content[:idx] + calc_xml + "\n    " + content[idx:]

    # 2. Replace each KPI worksheet body in place
    for name, kpi in KPIS.items():
        new_ws = build_kpi_card(kpi)  # build_kpi_card uses kpi.key as the name
        pattern = rf"    <worksheet name='{re.escape(name)}'>.*?</worksheet>"
        new_content, n = re.subn(pattern, lambda _: new_ws, content, count=1, flags=re.DOTALL)
        if n == 0:
            print(f"WARN: worksheet '{name}' not found")
        else:
            content = new_content
            print(f"Replaced worksheet '{name}'")

    out = Path("/tmp/wb-nam-a-portfolio-v2.twb")
    out.write_text(content, encoding="utf-8")
    print(f"\nWrote {out} ({len(content):,} bytes)")

    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(content)
        print("XML valid ✓")
    except ET.ParseError as e:
        print(f"XML PARSE ERROR: {e}")


if __name__ == "__main__":
    main()
