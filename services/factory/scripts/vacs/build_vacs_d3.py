"""D3 — Giám Sát Dị Vật (Foreign Object Watch).

Single-table on Complaints, filtered to FO complaints (ForeignObjectType != '').
FO-type distribution, trend by month, hard-hazard (metal/glass) red KPI,
FO by route.

Run: uv run python scripts/vacs/build_vacs_d3.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import vacs_lib as V
from vacs_lib import Calc, Table

FO_TYPES = ["PLASTIC", "HAIR", "INSECTS", "OTHER F/O", "GLASS/CHINAWARE", "METAL", "MOLDY"]


def build():
    V.reset_zids()
    CP = Table("Complaints")
    # count of FO complaints (calc filters inline so no fragile categorical filter)
    k_fo = Calc("Complaints", "0300000001", "Tổng dị vật", "integer", "measure", "quantitative",
                'COUNTD(IF [ForeignObjectType] != "" THEN [ComplaintId] END)', "n#,##0")
    k_hard = Calc("Complaints", "0300000002", "Nguy cơ cao", "integer", "measure", "quantitative",
                  'COUNTD(IF [ForeignObjectType] = "METAL" OR [ForeignObjectType] = "GLASS/CHINAWARE" THEN [ComplaintId] END)', "n#,##0")
    k_mold = Calc("Complaints", "0300000003", "Nấm mốc", "integer", "measure", "quantitative",
                  'COUNTD(IF [ForeignObjectType] = "MOLDY" THEN [ComplaintId] END)', "n#,##0")
    k_crit = Calc("Complaints", "0300000004", "Vụ nghiêm trọng", "integer", "measure", "quantitative",
                  'COUNTD(IF [ForeignObjectType] != "" AND [Severity] = "Nghiêm trọng" THEN [ComplaintId] END)', "n#,##0")
    # per-FO-type count (used with a categorical filter to FO members)
    k_cnt = Calc("Complaints", "0300000010", "Số vụ", "integer", "measure", "quantitative",
                 "COUNTD([ComplaintId])", "n#,##0")
    calcs = [k_fo, k_hard, k_mold, k_crit, k_cnt]

    sheets = []
    sheets.append(V.kpi_card("KPI Tong DV", k_fo, "Tổng khiếu nại dị vật", value_color=V.GOLD))
    sheets.append(V.kpi_card("KPI Nguy co cao", k_hard, "Kim loại & Thủy tinh", value_color=V.BAD))
    sheets.append(V.kpi_card("KPI Nam moc", k_mold, "Nấm mốc", value_color=V.WARN))
    sheets.append(V.kpi_card("KPI Nghiem trong DV", k_crit, "Vụ nghiêm trọng", value_color=V.BAD))

    fo_filter = [V.categorical_filter("Complaints", "ForeignObjectType", FO_TYPES)]

    # FO type ranked bar (filtered to FO members)
    sheets.append(V.chart(
        "Loai di vat", "Phân bố loại dị vật", "Complaints",
        deps=[CP.dep("ForeignObjectType", caption="Loại dị vật"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("ForeignObjectType"), k_cnt.inst().strip()],
        rows=CP.dim("ForeignObjectType"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("ForeignObjectType"), k_cnt.ref(), "DESC"),
        filters=fo_filter))

    # FO trend by month (all FO)
    sheets.append(V.chart(
        "Xu huong di vat", "Xu hướng dị vật theo tháng", "Complaints",
        deps=[CP.dep("DepMonth", caption="Tháng"), k_fo.dep_col().strip()],
        insts=[CP.month_inst("DepMonth"), k_fo.inst().strip()],
        rows=k_fo.ref(), cols=CP.month("DepMonth"), mark="Bar",
        encodings=[("color", k_fo.ref())], color_palette="VACS Sequential Blue"))

    # FO by route (where FO concentrates)
    sheets.append(V.chart(
        "Di vat theo chang", "Dị vật theo chặng bay (Top)", "Complaints",
        deps=[CP.dep("Route", caption="Chặng"), k_cnt.dep_col().strip()],
        insts=[CP.dim_inst("Route"), k_cnt.inst().strip()],
        rows=CP.dim("Route"), cols=k_cnt.ref(), mark="Bar",
        encodings=[("color", k_cnt.ref())], color_palette="VACS Sequential Blue",
        data_label=k_cnt.ref(), computed_sort=(CP.dim("Route"), k_cnt.ref(), "DESC"),
        filters=fo_filter))

    names = ["KPI Tong DV", "KPI Nguy co cao", "KPI Nam moc", "KPI Nghiem trong DV",
             "Loai di vat", "Xu huong di vat", "Di vat theo chang"]
    dash = V.dashboard("VACS - Giam Sat Di Vat", [
        V.header_band("Giám sát Dị vật (Foreign Object Watch)", "Kim loại / Thủy tinh = nguy cơ cao ưu tiên xử lý"),
        V.hrow(["KPI Tong DV", "KPI Nguy co cao", "KPI Nam moc", "KPI Nghiem trong DV"], 15000, kpi=True),
        V.hrow(["Loai di vat", "Xu huong di vat"], 42000, minw=180),
        V.hrow(["Di vat theo chang"], 39000, minw=200),
    ], height=1180)
    xml = V.workbook(["Complaints"], calcs, sheets, names, dash, "VACS - Giam Sat Di Vat")
    print(f"D3: {len(xml):,} bytes  XML {V.validate(xml)}")
    return V.package_twbx(xml, "VACS - Giam Sat Di Vat")


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = V.publish(twbx, "VACS - Giam Sat Di Vat")
        V.render(wb_id, "d3")
