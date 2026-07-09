"""SHB — Bảng điều khiển Khối KHDN, Phân khúc SME (single dashboard).

One comprehensive SME corporate-banking portfolio dashboard on IndustrySummary
(single-table extract-workbook). Clean title (NO colored header band — user
asked not to reuse the VACS band). Premium spark-KPI cards + industry charts.

Charts let leadership pick an industry, then ask the AI agent for a campaign.

Run: uv run python scripts/shb/build_shb_sme.py [--publish]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import shb_lib as S
from shb_lib import Calc, Table

WB = "SHB - KHDN SME"


def build():
    S.reset_zids()
    IS = Table("IndustrySummary")

    # ── Portfolio KPI calcs (totals across industries) ──
    k_duno = Calc("IndustrySummary", "0100000001", "Dư nợ SME", "real", "measure", "quantitative",
                  "SUM([OutstandingVnd]) / 1000000000000", "n#,##0.0\" ng.tỷ\"")
    k_kh = Calc("IndustrySummary", "0100000002", "Số KHDN SME", "integer", "measure", "quantitative",
                "SUM([ClientCount])", "n#,##0")
    k_npl = Calc("IndustrySummary", "0100000003", "Tỷ lệ nợ xấu (NPL)", "real", "measure", "quantitative",
                 "SUM([NplVnd]) / SUM([OutstandingVnd])", "p0.00%")
    k_casa = Calc("IndustrySummary", "0100000004", "Tỷ lệ CASA", "real", "measure", "quantitative",
                  "SUM([CasaVnd]) / SUM([DepositsVnd])", "p0.0%")
    k_sp = Calc("IndustrySummary", "0100000005", "Sản phẩm / khách hàng", "real", "measure", "quantitative",
                "SUM([ProductsPerClient] * [ClientCount]) / SUM([ClientCount])", "n#,##0.0")
    k_tf = Calc("IndustrySummary", "0100000006", "Tài trợ thương mại", "real", "measure", "quantitative",
                "SUM([TradeFinanceVnd]) / 1000000000000", "n#,##0.0\" ng.tỷ\"")

    # ── Chart measure calcs ──
    k_duno_ty = Calc("IndustrySummary", "0100000010", "Dư nợ (tỷ)", "real", "measure", "quantitative",
                     "SUM([OutstandingVnd]) / 1000000000", "n#,##0")
    k_npl_ind = Calc("IndustrySummary", "0100000011", "NPL %", "real", "measure", "quantitative",
                     "SUM([NplVnd]) / SUM([OutstandingVnd])", "p0.0%")
    k_growth = Calc("IndustrySummary", "0100000012", "Tăng trưởng YoY", "real", "measure", "quantitative",
                    "SUM([GrowthYoYPct] * [ClientCount]) / SUM([ClientCount])", "p0.0%")
    k_casa_ind = Calc("IndustrySummary", "0100000013", "CASA %", "real", "measure", "quantitative",
                      "SUM([CasaVnd]) / SUM([DepositsVnd])", "p0.0%")
    k_util = Calc("IndustrySummary", "0100000014", "Sử dụng hạn mức", "real", "measure", "quantitative",
                  "SUM([OutstandingVnd]) / SUM([LimitGrantedVnd])", "p0%")
    k_clients = Calc("IndustrySummary", "0100000015", "Số KH", "integer", "measure", "quantitative",
                     "SUM([ClientCount])", "n#,##0")

    calcs = [k_duno, k_kh, k_npl, k_casa, k_sp, k_tf,
             k_duno_ty, k_npl_ind, k_growth, k_casa_ind, k_util, k_clients]

    sheets = []
    # KPI cards (plain BAN — single-row totals; no time trend on a static book,
    # so we use clean KPI cards, not sparklines).
    sheets.append(S.kpi_card("KPI Duno", k_duno, "Dư nợ SME", value_color=S.BRAND, size=20))
    sheets.append(S.kpi_card("KPI KH", k_kh, "Số KHDN SME", value_color=S.NAVY))
    sheets.append(S.kpi_card("KPI NPL", k_npl, "Tỷ lệ nợ xấu (NPL)", value_color=S.BAD))
    sheets.append(S.kpi_card("KPI CASA", k_casa, "Tỷ lệ CASA", value_color=S.GOOD))
    sheets.append(S.kpi_card("KPI SP", k_sp, "Sản phẩm / khách hàng", value_color=S.NAVY))
    sheets.append(S.kpi_card("KPI TF", k_tf, "Tài trợ thương mại (YTD)", value_color=S.BRAND, size=18))

    # 1) Dư nợ theo ngành — ranking bar (the pick-an-industry chart)
    sheets.append(S.chart(
        "Duno theo nganh", "Dư nợ theo ngành (tỷ VND)", "IndustrySummary",
        deps=[IS.dep("Industry", caption="Ngành"), k_duno_ty.dep_col().strip()],
        insts=[IS.dim_inst("Industry"), k_duno_ty.inst().strip()],
        rows=IS.dim("Industry"), cols=k_duno_ty.ref(), mark="Bar",
        encodings=[("color", k_duno_ty.ref())], color_palette="SHB Sequential",
        data_label=k_duno_ty.ref(), computed_sort=(IS.dim("Industry"), k_duno_ty.ref(), "DESC")))

    # 2) Ma trận Rủi ro–Quy mô: scatter NPL (y) × Dư nợ (x), color by risk tier
    sheets.append(S.chart(
        "Ma tran rui ro", "Ma trận Rủi ro–Quy mô (NPL × Dư nợ, màu theo mức rủi ro)", "IndustrySummary",
        deps=[IS.dep("Industry", caption="Ngành"), IS.dep("RiskTier", caption="Mức rủi ro"),
              k_duno_ty.dep_col().strip(), k_npl_ind.dep_col().strip(), k_clients.dep_col().strip()],
        insts=[IS.dim_inst("Industry"), IS.dim_inst("RiskTier"),
               k_duno_ty.inst().strip(), k_npl_ind.inst().strip(), k_clients.inst().strip()],
        rows=k_npl_ind.ref(), cols=k_duno_ty.ref(), mark="Circle",
        encodings=[("color", IS.dim("RiskTier")), ("size", k_clients.ref()),
                   ("text", IS.dim("Industry"))],
        color_palette="SHB Risk"))

    # 3) Tăng trưởng dư nợ YoY theo ngành — diverging-ish ranking
    sheets.append(S.chart(
        "Tang truong nganh", "Tăng trưởng dư nợ YoY theo ngành", "IndustrySummary",
        deps=[IS.dep("Industry", caption="Ngành"), k_growth.dep_col().strip()],
        insts=[IS.dim_inst("Industry"), k_growth.inst().strip()],
        rows=IS.dim("Industry"), cols=k_growth.ref(), mark="Bar",
        encodings=[("color", k_growth.ref())], color_palette="SHB Sequential",
        data_label=k_growth.ref(), computed_sort=(IS.dim("Industry"), k_growth.ref(), "DESC")))

    # 4) CASA % theo ngành — funding quality
    sheets.append(S.chart(
        "CASA theo nganh", "Tỷ lệ CASA theo ngành (chất lượng nguồn vốn)", "IndustrySummary",
        deps=[IS.dep("Industry", caption="Ngành"), k_casa_ind.dep_col().strip()],
        insts=[IS.dim_inst("Industry"), k_casa_ind.inst().strip()],
        rows=IS.dim("Industry"), cols=k_casa_ind.ref(), mark="Bar",
        encodings=[("color", k_casa_ind.ref())], color_palette="SHB Sequential",
        data_label=k_casa_ind.ref(), computed_sort=(IS.dim("Industry"), k_casa_ind.ref(), "DESC")))

    # 5) Sử dụng hạn mức theo ngành — headroom for working-capital campaigns
    sheets.append(S.chart(
        "Su dung han muc", "Sử dụng hạn mức theo ngành (dư địa vốn lưu động)", "IndustrySummary",
        deps=[IS.dep("Industry", caption="Ngành"), k_util.dep_col().strip()],
        insts=[IS.dim_inst("Industry"), k_util.inst().strip()],
        rows=IS.dim("Industry"), cols=k_util.ref(), mark="Bar",
        encodings=[("color", k_util.ref())], color_palette="SHB Sequential",
        data_label=k_util.ref(), computed_sort=(IS.dim("Industry"), k_util.ref(), "DESC")))

    names = ["KPI Duno", "KPI KH", "KPI NPL", "KPI CASA", "KPI SP", "KPI TF",
             "Duno theo nganh", "Ma tran rui ro", "Tang truong nganh",
             "CASA theo nganh", "Su dung han muc"]
    dash = S.dashboard(WB, [
        S.title_block("Khối Khách hàng Doanh nghiệp — Phân khúc SME",
                      "Tổng quan danh mục theo ngành · Chọn một ngành rồi hỏi Trợ lý AI để được tư vấn chiến dịch"),
        S.hrow(["KPI Duno", "KPI KH", "KPI NPL", "KPI CASA", "KPI SP", "KPI TF"], 13000, kpi=True),
        S.hrow(["Duno theo nganh", "Ma tran rui ro"], 44000, minw=200),
        S.hrow(["Tang truong nganh", "CASA theo nganh", "Su dung han muc"], 40000, minw=150),
    ], width=1680, height=1180)
    xml = S.workbook(["IndustrySummary"], calcs, sheets, names, dash, WB)
    print(f"SHB SME: {len(xml):,} bytes  XML {S.validate(xml)}")
    return S.package_twbx(xml, WB)


if __name__ == "__main__":
    twbx = build()
    if "--publish" in sys.argv:
        wb_id = S.publish(twbx, WB)
        S.render(wb_id, "sme")
