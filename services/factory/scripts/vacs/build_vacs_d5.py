"""D5 — Cam Kết Dịch Vụ & Phạt Hợp Đồng (SLA Compliance & Penalty Scorecard).

Single-table on SLARecords. Breach types, penalty by airline, delay minutes,
penalty status.

Run: uv run python scripts/vacs/build_vacs_d5.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table


def build():
    V.reset_zids()
    SL = Table("SLARecords")

    k_breach = Calc("SLARecords", "0500000001", "Sự cố SLA", "integer", "measure", "quantitative",
                    "COUNTD([SLAId])", "n#,##0")
    k_penusd = Calc("SLARecords", "0500000002", "Tổng phạt (USD)", "integer", "measure", "quantitative",
                    "SUM([PenaltyUsd])", '"$"#,##0')
    k_delay = Calc("SLARecords", "0500000003", "Chậm chuyến do suất ăn", "integer", "measure", "quantitative",
                   'COUNTD(IF [BreachType] = "Chậm chuyến do suất ăn" THEN [SLAId] END)', "n#,##0")
    k_delaymin = Calc("SLARecords", "0500000004", "Tổng phút chậm", "integer", "measure", "quantitative",
                      "SUM([DelayMinutes])", "n#,##0")
    k_appeal = Calc("SLARecords", "0500000005", "Đang khiếu nại", "integer", "measure", "quantitative",
                    'COUNTD(IF [Status] = "Đang khiếu nại" THEN [SLAId] END)', "n#,##0")
    calcs = [k_breach, k_penusd, k_delay, k_delaymin, k_appeal]

    sheets = []
    sheets.append(V.kpi_card("KPI Su co", k_breach, "Tổng sự cố SLA", value_color=V.WARN))
    sheets.append(V.kpi_card("KPI Phat USD", k_penusd, "Tổng tiền phạt (USD)", value_color=V.BAD, size=18))
    sheets.append(V.kpi_card("KPI Cham chuyen", k_delay, "Chậm chuyến do suất ăn", value_color=V.BAD))
    sheets.append(V.kpi_card("KPI Phut cham", k_delaymin, "Tổng phút chậm"))
    sheets.append(V.kpi_card("KPI Khieu nai", k_appeal, "Đang khiếu nại phạt", value_color=V.WARN))

    # Breach type ranked bar
    sheets.append(V.chart(
        "Loai su co", "Sự cố SLA theo loại vi phạm", "SLARecords",
        deps=[SL.dep("BreachType", caption="Loại vi phạm"), k_breach.dep_col().strip()],
        insts=[SL.dim_inst("BreachType"), k_breach.inst().strip()],
        rows=SL.dim("BreachType"), cols=k_breach.ref(), mark="Bar",
        encodings=[("color", k_breach.ref())], color_palette="VACS Sequential Blue",
        data_label=k_breach.ref(), computed_sort=(SL.dim("BreachType"), k_breach.ref(), "DESC")))

    # Penalty by airline (top)
    sheets.append(V.chart(
        "Phat theo hang", "Tiền phạt theo hãng bay (USD)", "SLARecords",
        deps=[SL.dep("AirlineName", caption="Hãng"), k_penusd.dep_col().strip()],
        insts=[SL.dim_inst("AirlineName"), k_penusd.inst().strip()],
        rows=SL.dim("AirlineName"), cols=k_penusd.ref(), mark="Bar",
        encodings=[("color", k_penusd.ref())], color_palette="VACS Sequential Blue",
        data_label=k_penusd.ref(), computed_sort=(SL.dim("AirlineName"), k_penusd.ref(), "DESC")))

    # Breach trend by month
    k_breach_mo = Calc("SLARecords", "0500000010", "Sự cố", "integer", "measure", "quantitative",
                       "COUNTD([SLAId])", "n#,##0")
    calcs.append(k_breach_mo)
    sheets.append(V.chart(
        "Xu huong su co", "Xu hướng sự cố SLA theo tháng", "SLARecords",
        deps=[SL.dep("DepMonth", caption="Tháng"), k_breach_mo.dep_col().strip()],
        insts=[SL.month_inst("DepMonth"), k_breach_mo.inst().strip()],
        rows=k_breach_mo.ref(), cols=SL.month("DepMonth"), mark="Bar",
        encodings=[("color", k_breach_mo.ref())], color_palette="VACS Sequential Blue"))

    names = ["KPI Su co", "KPI Phat USD", "KPI Cham chuyen", "KPI Phut cham", "KPI Khieu nai",
             "Loai su co", "Phat theo hang", "Xu huong su co"]
    dash = V.dashboard("VACS - SLA Phat Hop Dong", [
        V.header_band("Cam kết Dịch vụ & Phạt Hợp đồng (SLA)", "Vi phạm xếp dỡ · Chậm chuyến · Phạt theo hãng"),
        V.hrow(["KPI Su co", "KPI Phat USD", "KPI Cham chuyen", "KPI Phut cham", "KPI Khieu nai"], 15000, kpi=True),
        V.hrow(["Loai su co", "Phat theo hang"], 42000, minw=180),
        V.hrow(["Xu huong su co"], 39000, minw=200),
    ], height=1180)
    xml = V.workbook(["SLARecords"], calcs, sheets, names, dash, "VACS - SLA Phat Hop Dong")
    print(f"D5: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - SLA Phat Hop Dong")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - SLA Phat Hop Dong")
        V.render(wb_id, "d5")
