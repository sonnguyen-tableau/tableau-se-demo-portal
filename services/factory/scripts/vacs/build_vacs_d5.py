"""D5 — Cam Kết Dịch Vụ & Phạt Hợp Đồng (V1 SLA Scorecard + spark KPIs).

Spark-KPI cards on SLARecords + breach types, penalty by airline, emphasis
monthly breach trend.

Run: uv run python scripts/vacs/build_vacs_d5.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

CUR = 2026


def build():
    V.reset_zids()
    SL = Table("SLARecords")

    k_breach = Calc("SLARecords", "0500000001", "Sự cố SLA", "integer", "measure", "quantitative",
                    f'COUNTD(IF [Year]={CUR} THEN [SLAId] END)', "n#,##0")
    k_breach_mo = Calc("SLARecords", "0500000011", "Sự cố/tháng", "integer", "measure", "quantitative",
                       "COUNTD([SLAId])", "n#,##0")
    k_penusd = Calc("SLARecords", "0500000002", "Tổng phạt USD", "integer", "measure", "quantitative",
                    f'SUM(IF [Year]={CUR} THEN [PenaltyUsd] END)', '"$"#,##0')
    k_penusd_mo = Calc("SLARecords", "0500000012", "Phạt/tháng", "integer", "measure", "quantitative",
                       "SUM([PenaltyUsd])", '"$"#,##0')
    k_delay = Calc("SLARecords", "0500000003", "Chậm chuyến", "integer", "measure", "quantitative",
                   f'COUNTD(IF [Year]={CUR} AND [BreachType] = "Chậm chuyến do suất ăn" THEN [SLAId] END)', "n#,##0")
    k_delay_mo = Calc("SLARecords", "0500000013", "Chậm/tháng", "integer", "measure", "quantitative",
                      'COUNTD(IF [BreachType] = "Chậm chuyến do suất ăn" THEN [SLAId] END)', "n#,##0")
    k_delaymin = Calc("SLARecords", "0500000004", "Tổng phút chậm", "integer", "measure", "quantitative",
                      f'SUM(IF [Year]={CUR} THEN [DelayMinutes] END)', "n#,##0")
    k_delaymin_mo = Calc("SLARecords", "0500000014", "Phút/tháng", "integer", "measure", "quantitative",
                         "SUM([DelayMinutes])", "n#,##0")
    k_breach_rank = Calc("SLARecords", "0500000020", "Sự cố", "integer", "measure", "quantitative",
                         "COUNTD([SLAId])", "n#,##0")
    k_pen_rank = Calc("SLARecords", "0500000021", "Tiền phạt (USD)", "integer", "measure", "quantitative",
                      "SUM([PenaltyUsd])", '"$"#,##0')
    k_breach_emph = Calc("SLARecords", "0500000022", "Sự cố", "integer", "measure", "quantitative",
                         f'COUNTD(IF [Year]={CUR} THEN [SLAId] END)', "n#,##0")
    calcs = [k_breach, k_breach_mo, k_penusd, k_penusd_mo, k_delay, k_delay_mo, k_delaymin,
             k_delaymin_mo, k_breach_rank, k_pen_rank, k_breach_emph]

    sheets = []
    sheets.append(V.kpi_card_delta("N Su co", k_breach, "Sự cố SLA 2026", "▲ 21,7%", V.BAD, "vs cùng kỳ 2025", value_color=V.WARN))
    sheets.append(V.sparkline("S Su co", "SLARecords", "DepMonth", k_breach_mo, color=V.WARN))
    sheets.append(V.kpi_card_delta("N Phat USD", k_penusd, "Tiền phạt 2026 (USD)", "▲ 19,5%", V.BAD, "vs cùng kỳ", size=18, value_color=V.BAD))
    sheets.append(V.sparkline("S Phat USD", "SLARecords", "DepMonth", k_penusd_mo, color=V.BAD))
    sheets.append(V.kpi_card_delta("N Cham chuyen", k_delay, "Chậm chuyến do suất ăn", "sự cố nặng", V.BAD, "ưu tiên", value_color=V.BAD))
    sheets.append(V.sparkline("S Cham chuyen", "SLARecords", "DepMonth", k_delay_mo, color=V.BAD))
    sheets.append(V.kpi_card_delta("N Phut cham", k_delaymin, "Tổng phút chậm 2026", "phút", V.BODY, "on-time loading"))
    sheets.append(V.sparkline("S Phut cham", "SLARecords", "DepMonth", k_delaymin_mo))

    sheets.append(V.chart(
        "Loai su co", "Sự cố SLA theo loại vi phạm (2 năm)", "SLARecords",
        deps=[SL.dep("BreachType", caption="Loại vi phạm"), k_breach_rank.dep_col().strip()],
        insts=[SL.dim_inst("BreachType"), k_breach_rank.inst().strip()],
        rows=SL.dim("BreachType"), cols=k_breach_rank.ref(), mark="Bar",
        encodings=[("color", k_breach_rank.ref())], color_palette="VACS Sequential Blue",
        data_label=k_breach_rank.ref(), computed_sort=(SL.dim("BreachType"), k_breach_rank.ref(), "DESC")))

    sheets.append(V.chart(
        "Phat theo hang", "Tiền phạt theo hãng bay (USD)", "SLARecords",
        deps=[SL.dep("AirlineName", caption="Hãng"), k_pen_rank.dep_col().strip()],
        insts=[SL.dim_inst("AirlineName"), k_pen_rank.inst().strip()],
        rows=SL.dim("AirlineName"), cols=k_pen_rank.ref(), mark="Bar",
        encodings=[("color", k_pen_rank.ref())], color_palette="VACS Sequential Blue",
        data_label=k_pen_rank.ref(), computed_sort=(SL.dim("AirlineName"), k_pen_rank.ref(), "DESC")))

    sheets.append(V.emphasis_month_chart(
        "Xu huong su co", "Sự cố SLA theo tháng 2026 · tháng cao nhất = đậm nhất",
        "SLARecords", "DepMonth", k_breach_emph))

    names = ["N Su co", "S Su co", "N Phat USD", "S Phat USD", "N Cham chuyen", "S Cham chuyen",
             "N Phut cham", "S Phut cham", "Loai su co", "Phat theo hang", "Xu huong su co"]
    dash = V.dashboard("VACS - SLA Phat Hop Dong", [
        V.header_band("Cam kết Dịch vụ & Phạt Hợp đồng (SLA)", "Vi phạm xếp dỡ · Chậm chuyến · Phạt theo hãng"),
        V.spark_hrow([("N Su co", "S Su co"), ("N Phat USD", "S Phat USD"),
                      ("N Cham chuyen", "S Cham chuyen"), ("N Phut cham", "S Phut cham")], 28000),
        V.hrow(["Loai su co", "Phat theo hang"], 38000, minw=180),
        V.hrow(["Xu huong su co"], 34000, minw=200),
    ], height=1240)
    xml = V.workbook(["SLARecords"], calcs, sheets, names, dash, "VACS - SLA Phat Hop Dong")
    print(f"D5: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - SLA Phat Hop Dong")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - SLA Phat Hop Dong")
        V.render(wb_id, "d5")
