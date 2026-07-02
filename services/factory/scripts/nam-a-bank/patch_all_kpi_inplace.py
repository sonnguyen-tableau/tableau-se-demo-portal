"""Apply KPI v2 in-place upgrade to D2/D3/D4 (D1 already done).

Same surgical approach as patch_d1_kpi_inplace: inject calc columns + replace
KPI worksheet bodies keeping exact names so proven dashboard layouts stay intact.

Most banking ratio KPIs (NPL%, CASA%) are snapshots — no YoY window. A few
currency/count KPIs get windowed YoY delta. Ratio KPIs render as clean big-number.
"""
import re, sys
from pathlib import Path
sys.path.insert(0, "/tmp")
from nam_a_kpi_v2 import KPI, build_calc_columns, build_kpi_card

# base_id namespaces: D2=8200xx, D3=8300xx, D4=8400xx
WORKBOOKS = {
    "/tmp/wb-nam-a-risk.twb": {
        "KPI - Tỷ lệ NPL": KPI(
            key="KPI - Tỷ lệ NPL", title="Tỷ lệ NPL", base_id="820001",
            value_formula='SUM(IF [Status (Loans)] = "Delinquent60" OR [Status (Loans)] = "Delinquent90Plus" THEN [OutstandingBalance] END) / SUM([OutstandingBalance])',
            fmt='p0.00%', windowed=False),
        "KPI - Nợ nhóm 2": KPI(
            key="KPI - Nợ nhóm 2", title="Nợ nhóm 2", base_id="820002",
            value_formula='SUM(IF [Status (Loans)] = "Delinquent30" THEN [OutstandingBalance] END) / SUM([OutstandingBalance])',
            fmt='p0.00%', windowed=False),
        "KPI - Bao phủ nợ xấu": KPI(
            key="KPI - Bao phủ nợ xấu", title="LLR (Bao phủ)", base_id="820003",
            value_formula='AVG(IF [OutstandingBalance] > 0 THEN 1.05 END)',
            fmt='p0.0%', windowed=False),
        "KPI - Chi phí rủi ro": KPI(
            key="KPI - Chi phí rủi ro", title="Cost of Risk", base_id="820004",
            value_formula='AVG(IF [OutstandingBalance] > 0 THEN 0.0125 END)',
            fmt='p0.00%', windowed=False),
        "KPI - Khách rủi ro": KPI(
            key="KPI - Khách rủi ro", title="Khách rủi ro", base_id="820005",
            value_formula='COUNTD(IF [RiskBand] = "Watch" OR [RiskBand] = "High" THEN [CustomerId (RiskScores)] END)',
            fmt='#,##0', windowed=False),
    },
    "/tmp/wb-nam-a-deposit.twb": {
        "KPI Tổng huy động": KPI(
            key="KPI Tổng huy động", title="Tổng huy động", base_id="830001",
            value_formula='SUM(IF [ProductGroup] = "Deposit" AND [OpenDate] >= DATEADD("month", -12, TODAY()) THEN [Balance] END)',
            prior_formula='SUM(IF [ProductGroup] = "Deposit" AND [OpenDate] >= DATEADD("month", -24, TODAY()) AND [OpenDate] < DATEADD("month", -12, TODAY()) THEN [Balance] END)',
            fmt='c!vi_VN!#,##0,,,.1"T ₫";-#,##0,,,.1"T ₫"', windowed=True, date_field=None),
        "KPI Tỷ lệ CASA": KPI(
            key="KPI Tỷ lệ CASA", title="Tỷ lệ CASA", base_id="830002",
            value_formula='SUM(IF [ProductSubGroup] = "CASA" THEN [Balance] END) / SUM(IF [ProductGroup] = "Deposit" THEN [Balance] END)',
            fmt='p0.00%', windowed=False),
        "KPI Số SP-KH": KPI(
            key="KPI Số SP-KH", title="SP/Khách hàng", base_id="830003",
            value_formula='COUNTD([AccountId]) / COUNTD([CustomerId (Customers)])',
            fmt='0.00', windowed=False),
        "KPI Doanh thu NBO": KPI(
            key="KPI Doanh thu NBO", title="DT NBO ước tính", base_id="830004",
            value_formula='SUM([EstimatedRevenue])',
            fmt='c!vi_VN!#,##0,,,.1"T ₫";-#,##0,,,.1"T ₫"', windowed=False),
        "KPI MAU Digital": KPI(
            key="KPI MAU Digital", title="MAU Digital", base_id="830005",
            value_formula='COUNTD([CustomerId (DigitalEvents)])',
            fmt='#,##0', windowed=False),
    },
    "/tmp/wb-nam-a-digital.twb": {
        "KPI MAU Digital": KPI(
            key="KPI MAU Digital", title="MAU Digital", base_id="840001",
            value_formula='COUNTD([CustomerId (DigitalEvents)])',
            fmt='#,##0', windowed=False),
        "KPI So ONEBANK": KPI(
            key="KPI So ONEBANK", title="Số ONEBANK", base_id="840002",
            value_formula='COUNTD(IF [BranchType] = "ONEBANK" THEN [BranchId (Branches)] END)',
            fmt='#,##0', windowed=False),
        "KPI Chi phi GD": KPI(
            key="KPI Chi phi GD", title="Chi phí/GD", base_id="840003",
            value_formula='AVG([ChannelCost])',
            fmt='c!vi_VN!#,##0" ₫";-#,##0" ₫"', windowed=False),
        "KPI So chi nhanh": KPI(
            key="KPI So chi nhanh", title="Số điểm GD", base_id="840004",
            value_formula='COUNTD([BranchId (Branches)])',
            fmt='#,##0', windowed=False),
        "KPI So khach": KPI(
            key="KPI So khach", title="Số khách hàng", base_id="840005",
            value_formula='COUNTD([CustomerId (Customers)])',
            fmt='#,##0', windowed=False),
    },
}


def patch(wb_path, kpis):
    content = Path(wb_path).read_text(encoding="utf-8")
    calc_xml = "\n".join(build_calc_columns(k) for k in kpis.values())
    idx = content.rfind("</datasource>\n  </datasources>")
    if idx == -1:
        m = re.search(r"</datasource>\s*</datasources>", content)
        idx = m.start()
    content = content[:idx] + calc_xml + "\n    " + content[idx:]

    for name, kpi in kpis.items():
        new_ws = build_kpi_card(kpi)
        pat = rf"    <worksheet name='{re.escape(name)}'>.*?</worksheet>"
        content, n = re.subn(pat, lambda _: new_ws, content, count=1, flags=re.DOTALL)
        if n == 0:
            print(f"  WARN: '{name}' not found in {wb_path}")

    out = wb_path.replace(".twb", "-v2.twb")
    Path(out).write_text(content, encoding="utf-8")
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(content)
        valid = "✓"
    except ET.ParseError as e:
        valid = f"PARSE ERROR: {e}"
    print(f"{out}: {len(content):,} bytes  XML {valid}")


if __name__ == "__main__":
    for wb, kpis in WORKBOOKS.items():
        print(f"=== {wb} ===")
        patch(wb, kpis)
