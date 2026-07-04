"""Mey Pearl Ciel — AI deep-dive dashboard (talk track pages 2-4).
CEO Q&A: (1) pipeline/leads, (2) what-if -5% giá, (3) booking on-track, (4) actions.
Ciel-only via COUNTD-IF calcs (fan-out safe). To D1 standard."""
import sys
from pathlib import Path
sys.path.insert(0, "/tmp")
import mey_lib as M
from mey_lib import Calc

CIEL = 'Meypearl Ciel Phú Quốc'

def build():
    M.reset_zids()
    def ciel_if(cond=""):
        base = f'[ProjectName (Leads)] = "{CIEL}"'
        return f'COUNTD(IF {base}{cond} THEN [LeadId] END)'

    # KPI calcs (Ciel pipeline)
    k_leads = Calc("0090060000000101", "Tổng Leads Ciel", "integer", "measure", "quantitative", ciel_if(), "n#,##0")
    k_net = Calc("0090060000000102", "NET", "integer", "measure", "quantitative", ciel_if(' AND [Status] = "NET"'), "n#,##0")
    k_visit = Calc("0090060000000103", "Visit", "integer", "measure", "quantitative", ciel_if(' AND [Status] = "Visit"'), "n#,##0")
    k_booking = Calc("0090060000000104", "Booking", "integer", "measure", "quantitative", ciel_if(' AND [Status] = "Booking"'), "n#,##0")
    k_deal = Calc("0090060000000105", "Deal", "integer", "measure", "quantitative", ciel_if(' AND [Status] = "Deal"'), "n#,##0")
    # Booking gauge vs target 1000
    k_bkgpct = Calc("0090060000000106", "Booking %HT", "real", "measure", "quantitative",
                    f'{ciel_if(" AND [Status] = \"Booking\"")} / 1000', "p0%")
    dat = Calc("0090060000000107", "Đạt", "real", "measure", "quantitative", "MIN([Calculation_0090060000000106],1)")
    rem = Calc("0090060000000108", "Còn lại", "real", "measure", "quantitative", "1 - [Calculation_0090060000000107]")
    calcs = [k_leads, k_net, k_visit, k_booking, k_deal, k_bkgpct, dat, rem]

    sheets = []
    sheets.append(M.kpi_card("KPI Leads Ciel", k_leads, "Tổng Leads Ciel"))
    sheets.append(M.kpi_card("KPI NET", k_net, "NET (xác nhận nhu cầu)"))
    sheets.append(M.kpi_card("KPI Visit", k_visit, "Visit (tham quan)"))
    sheets.append(M.kpi_card("KPI Booking Ciel", k_booking, "Booking (giữ chỗ)"))
    sheets.append(M.kpi_card("KPI Deal Ciel", k_deal, "Deal (đã chốt)"))

    # Chart 1: Phễu Ciel (Lead→Deal) — the pipeline
    f_stage = Calc("0090060000000110", "Số Leads Ciel", "integer", "measure", "quantitative", ciel_if(), "n#,##0")
    calcs.append(f_stage)
    sheets.append(M.chart("CielPheu", "Phễu Ciel (Lead → Deal)",
        [M.raw_dep("Status", "Count", "string", "dimension", "nominal", "nominal"),
         f_stage.dep_col().strip()],
        [M.inst_dim("Status"), f_stage.inst().strip()],
        rows=M.ref_dim("Status"), cols=f_stage.ref(),
        mark="Bar", encodings=[("color", f_stage.ref())], color_palette="Mey Sequential Blue",
        data_label=f_stage.ref()))

    # Chart 2: Leads Ciel theo Nguồn khách
    sheets.append(M.chart("CielNguon", "Leads Ciel theo Nguồn khách",
        [M.raw_dep("Source", "Count", "string", "dimension", "nominal", "nominal"),
         k_leads.dep_col().strip()],
        [M.inst_dim("Source"), k_leads.inst().strip()],
        rows=M.ref_dim("Source"), cols=k_leads.ref(),
        mark="Bar", encodings=[("color", k_leads.ref())], color_palette="Mey Sequential Blue",
        data_label=k_leads.ref()))

    # Chart 3: Leads Ciel theo Sàn (top 8) — where the pipeline comes from
    sheets.append(M.chart("CielSan", "Leads Ciel theo Sàn giao dịch",
        [M.raw_dep("SanGiaoDich", "Count", "string", "dimension", "nominal", "nominal", caption="Sàn"),
         k_leads.dep_col().strip()],
        [M.inst_dim("SanGiaoDich"), k_leads.inst().strip()],
        rows=M.ref_dim("SanGiaoDich"), cols=k_leads.ref(),
        mark="Bar", encodings=[("color", k_leads.ref())], color_palette="Mey Sequential Blue",
        data_label=k_leads.ref()))

    # Ring gauge: Booking vs mục tiêu 1000 (78%). min0 + Gauge dummy already
    # exist in the seed datasource — reference them WITHOUT re-adding to calcs
    # (re-adding triggers "field already defined" and aborts CreateNew).
    zero = Calc("00900119000000", "min0", "integer", "measure", "quantitative", "MIN(0)")
    dummy = Calc("00900119000001", "Gauge dummy", "string", "dimension", "nominal", '"dummy"')
    sheets.append(M.ring_card("Ring Booking", k_bkgpct, dat, rem, zero, dummy, "78%", ring_color="#1B75BC"))

    names = ["KPI Leads Ciel","KPI NET","KPI Visit","KPI Booking Ciel","KPI Deal Ciel",
             "CielPheu","CielNguon","CielSan"]  # Ring Booking injected as floating zone post-build
    dash = M.dashboard("Mey Pearl Ciel — Deep Dive", [
        M.hrow(["KPI Leads Ciel","KPI NET","KPI Visit","KPI Booking Ciel","KPI Deal Ciel"], 16000, kpi=True),
        M.hrow(["CielPheu","CielNguon","CielSan"], 50000, minw=120),
    ], width=1560, height=820)
    xml = M.workbook(calcs, sheets, names, dash, "Mey Pearl Ciel — Deep Dive")
    Path("/tmp/wb-mey-ciel.twb").write_text(xml, encoding="utf-8")
    print(f"Ciel: {len(xml):,} bytes  XML {M.validate(xml)}")

if __name__ == "__main__":
    build()
