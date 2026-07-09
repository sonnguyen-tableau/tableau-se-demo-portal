"""D3 — Giám Sát Dị Vật (V1: Foreign Object Watch + spark KPIs).

Spark-KPI cards on Complaints (FO focus) + FO-type distribution, monthly
emphasis trend, FO by route.

Run: uv run python scripts/vacs/build_vacs_d3.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

FO_TYPES = ["PLASTIC", "HAIR", "INSECTS", "OTHER F/O", "GLASS/CHINAWARE", "METAL", "MOLDY"]
CUR = 2026


def build():
    V.reset_zids()
    CP = Table("Complaints")

    k_fo = Calc("Complaints", "0300000001", "Tổng dị vật", "integer", "measure", "quantitative",
                f'COUNTD(IF [Year]={CUR} AND [ForeignObjectType] != "" THEN [ComplaintId] END)', "n#,##0")
    k_fo_mo = Calc("Complaints", "0300000011", "DV/tháng", "integer", "measure", "quantitative",
                   'COUNTD(IF [ForeignObjectType] != "" THEN [ComplaintId] END)', "n#,##0")
    k_hard = Calc("Complaints", "0300000002", "Nguy cơ cao", "integer", "measure", "quantitative",
                  f'COUNTD(IF [Year]={CUR} AND ([ForeignObjectType] = "METAL" OR [ForeignObjectType] = "GLASS/CHINAWARE") THEN [ComplaintId] END)', "n#,##0")
    k_hard_mo = Calc("Complaints", "0300000012", "NCC/tháng", "integer", "measure", "quantitative",
                     'COUNTD(IF [ForeignObjectType] = "METAL" OR [ForeignObjectType] = "GLASS/CHINAWARE" THEN [ComplaintId] END)', "n#,##0")
    k_mold = Calc("Complaints", "0300000003", "Nấm mốc", "integer", "measure", "quantitative",
                  f'COUNTD(IF [Year]={CUR} AND [ForeignObjectType] = "MOLDY" THEN [ComplaintId] END)', "n#,##0")
    k_mold_mo = Calc("Complaints", "0300000013", "Mốc/tháng", "integer", "measure", "quantitative",
                     'COUNTD(IF [ForeignObjectType] = "MOLDY" THEN [ComplaintId] END)', "n#,##0")
    k_crit = Calc("Complaints", "0300000004", "Vụ nghiêm trọng", "integer", "measure", "quantitative",
                  f'COUNTD(IF [Year]={CUR} AND [ForeignObjectType] != "" AND [Severity] = "Nghiêm trọng" THEN [ComplaintId] END)', "n#,##0")
    k_crit_mo = Calc("Complaints", "0300000014", "NT/tháng", "integer", "measure", "quantitative",
                     'COUNTD(IF [ForeignObjectType] != "" AND [Severity] = "Nghiêm trọng" THEN [ComplaintId] END)', "n#,##0")
    k_cnt = Calc("Complaints", "0300000020", "Số vụ", "integer", "measure", "quantitative",
                 "COUNTD([ComplaintId])", "n#,##0")
    k_fo_emph = Calc("Complaints", "0300000021", "Dị vật", "integer", "measure", "quantitative",
                     f'COUNTD(IF [Year]={CUR} AND [ForeignObjectType] != "" THEN [ComplaintId] END)', "n#,##0")
    calcs = [k_fo, k_fo_mo, k_hard, k_hard_mo, k_mold, k_mold_mo, k_crit, k_crit_mo, k_cnt, k_fo_emph]

    sheets = []
    sheets.append(V.kpi_card_delta("N Tong DV", k_fo, "Tổng dị vật 2026", "▼ 15,2%", V.GOOD, "vs cùng kỳ 2025", value_color=V.GOLD))
    sheets.append(V.sparkline("S Tong DV", "Complaints", "DepMonth", k_fo_mo, color=V.GOLD))
    sheets.append(V.kpi_card_delta("N Nguy co cao", k_hard, "Kim loại & Thủy tinh", "▼ 1 vụ", V.GOOD, "vs 4 cùng kỳ", value_color=V.BAD))
    sheets.append(V.sparkline("S Nguy co cao", "Complaints", "DepMonth", k_hard_mo, color=V.BAD))
    sheets.append(V.kpi_card_delta("N Nam moc", k_mold, "Nấm mốc 2026", "mùa nóng T5–T8", V.WARN, "cao điểm", value_color=V.WARN))
    sheets.append(V.sparkline("S Nam moc", "Complaints", "DepMonth", k_mold_mo, color=V.WARN))
    sheets.append(V.kpi_card_delta("N Nghiem trong DV", k_crit, "Vụ nghiêm trọng", "cần điều tra", V.BAD, "ưu tiên", value_color=V.BAD))
    sheets.append(V.sparkline("S Nghiem trong DV", "Complaints", "DepMonth", k_crit_mo, color=V.BAD))

    fo_filter = [V.categorical_filter("Complaints", "ForeignObjectType", FO_TYPES)]

    sheets.append(V.chart(
        "Loai di vat", "Phân bố loại dị vật (2 năm)", "Complaints",
        deps=[CP.dep("ForeignObjectType", caption="Loại dị vật"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("ForeignObjectType"), k_cnt.inst().strip()],
        rows=CP.dim("ForeignObjectType"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("ForeignObjectType"), k_cnt.ref(), "DESC"),
        filters=fo_filter))

    # emphasis monthly FO trend (2026), max month darkest
    sheets.append(V.emphasis_month_chart(
        "Xu huong di vat", "Dị vật theo tháng 2026 · tháng cao nhất = đậm nhất (mùa nóng)",
        "Complaints", "DepMonth", k_fo_emph))

    sheets.append(V.chart(
        "Di vat theo chang", "Dị vật theo chặng bay (Top)", "Complaints",
        deps=[CP.dep("Route", caption="Chặng"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("Route"), k_cnt.inst().strip()],
        rows=CP.dim("Route"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("Route"), k_cnt.ref(), "DESC"),
        filters=fo_filter))

    names = ["N Tong DV", "S Tong DV", "N Nguy co cao", "S Nguy co cao", "N Nam moc", "S Nam moc",
             "N Nghiem trong DV", "S Nghiem trong DV", "Loai di vat", "Xu huong di vat", "Di vat theo chang"]
    dash = V.dashboard("VACS - Giam Sat Di Vat", [
        V.header_band("Giám sát Dị vật (Foreign Object Watch)", "Kim loại / Thủy tinh = nguy cơ cao ưu tiên xử lý"),
        V.spark_hrow([("N Tong DV", "S Tong DV"), ("N Nguy co cao", "S Nguy co cao"),
                      ("N Nam moc", "S Nam moc"), ("N Nghiem trong DV", "S Nghiem trong DV")], 28000),
        V.hrow(["Loai di vat", "Xu huong di vat"], 38000, minw=180),
        V.hrow(["Di vat theo chang"], 34000, minw=200),
    ], height=1240)
    xml = V.workbook(["Complaints"], calcs, sheets, names, dash, "VACS - Giam Sat Di Vat")
    print(f"D3: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Giam Sat Di Vat")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Giam Sat Di Vat")
        V.render(wb_id, "d3")
