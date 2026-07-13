"""ACB Market Intelligence — 3-page workbook, self-contained .twbx.

Pages (see docs/dashboards/acb-market-intelligence.md):
  1. Market Pulse         — 5 spark-KPI cards + VN-Index hero line +
                            theme ranked bar + foreign-flow diverging bar
  2. Macro & Market Drivers — 3×3 grid of macro small-multiple trend lines
  3. Advisor Cockpit      — investment-theme ranked scores + advisor-brief
                            conviction leaderboard

All viz PROBED on the extract/tidy-long path first (probe_acb.py):
  tidy-long SUM(IF [MetricKey]="x" THEN [Value] END) KPI + line ✓,
  diverging color-by-sign-measure ✓, ranked bar w/ labels ✓.

Run: uv run python scripts/acb/build_acb_dashboard.py [--publish]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import acb_lib as A  # noqa: E402
from acb_lib import Calc, Table  # noqa: E402
from app.generators.acb import AcbParameters, generate_acb  # noqa: E402

WB = "ACB - Market Intelligence"
MM = "market_metrics_monthly"
MD = "market_daily"
TS = "theme_summary"
AB = "advisor_brief"

# Number formats (Cloud-proven scaling-comma ordering).
F_IDX = 'n#,##0.0'
F_PCT = 'n#,##0.0"%"'
F_TY = 'n#,##0,,," tỷ"'            # VND → tỷ (÷1e9)
F_NGHIN_TY = 'n#,##0,,,,.1" N.tỷ"'  # VND → nghìn tỷ (÷1e12, 1dp)
F_PE = 'n#,##0.00"x"'
F_SCORE = 'n#,##0.0'


def _arrow(v: float, favorable_up: bool = True) -> tuple[str, str]:
    """(text, color): ▲/▼ + signed %, colored by favorable direction."""
    up = v >= 0
    arrow = "▲" if up else "▼"
    good = (up == favorable_up)
    color = A.GOOD if good else A.BAD
    return f"{arrow} {v:+.1f}%", color


def _compute_kpis():
    ds = generate_acb(AcbParameters(tenant_id="acb"))
    d = ds.market_daily.sort_values("Date").reset_index(drop=True)
    m = ds.market_metrics_monthly
    idx_latest = float(d["VnIndex"].iloc[-1])
    idx_ytd = float(d["ReturnYtdPct"].iloc[-1])
    idx_mtd = float(d["ReturnMtdPct"].iloc[-1])
    turn_recent = float(d["TurnoverVnd"].tail(60).mean())
    turn_prev = float(d["TurnoverVnd"].tail(120).head(60).mean())
    turn_delta = (turn_recent / turn_prev - 1) * 100 if turn_prev else 0.0
    foreign_cum = float(d["ForeignNetVnd"].sum())
    ff = m[m.MetricKey == "foreign_net_flow"].sort_values("Month")
    foreign_last = float(ff["Value"].iloc[-1])
    foreign_prev = float(ff["Value"].iloc[-2])
    foreign_delta = (foreign_last / abs(foreign_prev) - 1) * 100 if foreign_prev else 0.0
    pe_latest = float(d["MarketPe"].iloc[-1])
    pe_avg = float(d["MarketPe"].tail(252).mean())
    pe_delta = (pe_latest / pe_avg - 1) * 100 if pe_avg else 0.0
    return dict(idx_ytd=idx_ytd, idx_mtd=idx_mtd, turn_delta=turn_delta,
                foreign_cum=foreign_cum, foreign_delta=foreign_delta, pe_delta=pe_delta)


def _latest_daily(cid, cap, col, fmt):
    return Calc(MD, cid, cap, "real", "measure", "quantitative",
                f"SUM(IF [Date] = {{ FIXED : MAX([Date]) }} THEN [{col}] END)", fmt)


def _monthly_line(cid, cap, key, fmt=F_IDX):
    return Calc(MM, cid, cap, "real", "measure", "quantitative",
                f'SUM(IF [MetricKey]="{key}" THEN [Value] END)', fmt)


def build():
    K = _compute_kpis()

    # ── Page 1 KPI value calcs (latest from market_daily) ──
    k_idx = _latest_daily("0300000001", "VN-Index", "VnIndex", F_IDX)
    k_ytd = _latest_daily("0300000002", "Hiệu suất YTD", "ReturnYtdPct", F_PCT)
    k_turn = Calc(MD, "0300000003", "Thanh khoản BQ/ngày", "real", "measure", "quantitative",
                  "AVG([TurnoverVnd])", F_NGHIN_TY)
    k_fore = Calc(MD, "0300000004", "Dòng vốn ngoại lũy kế", "real", "measure", "quantitative",
                  "SUM([ForeignNetVnd])", F_NGHIN_TY)
    k_pe = _latest_daily("0300000005", "P/E thị trường", "MarketPe", F_PE)

    # ── Sparklines (monthly, market_metrics_monthly) ──
    s_idx = _monthly_line("0300000010", "VN-Index", "vnindex", F_IDX)
    s_ytd = _monthly_line("0300000011", "YTD", "return_ytd", F_PCT)
    s_turn = _monthly_line("0300000012", "Turnover", "turnover", F_NGHIN_TY)
    s_fore = _monthly_line("0300000013", "Foreign", "foreign_net_flow", F_TY)
    s_pe = _monthly_line("0300000014", "PE", "market_pe", F_PE)

    # ── Hero VN-Index monthly line ──
    hero = _monthly_line("0300000015", "VN-Index", "vnindex", F_IDX)

    # ── Macro small-multiple line calcs ──
    macro_specs = [
        ("0300000020", "Lạm phát CPI (YoY %)", "cpi_yoy", F_PCT),
        ("0300000021", "Tăng trưởng GDP (quý, YoY %)", "gdp_growth", F_PCT),
        ("0300000022", "Tăng trưởng tín dụng (YoY %)", "credit_growth_yoy", F_PCT),
        ("0300000023", "PMI sản xuất", "pmi", F_IDX),
        ("0300000024", "Bán lẻ HH&DV (YoY %)", "retail_sales_yoy", F_PCT),
        ("0300000025", "Xuất khẩu (tỷ USD)", "exports", F_IDX),
        ("0300000026", "Cán cân thương mại (tỷ USD)", "trade_balance", F_IDX),
        ("0300000027", "FDI giải ngân (tỷ USD)", "fdi_disbursed", F_IDX),
        ("0300000028", "Tỷ giá USD/VND", "usdvnd", 'n#,##0'),
    ]
    macro_calcs = [_monthly_line(cid, cap, key, fmt) for cid, cap, key, fmt in macro_specs]

    # ── Foreign-flow monthly diverging (value + sign) ──
    ff_val = _monthly_line("0300000031", "Dòng vốn ngoại (tháng)", "foreign_net_flow", F_TY)
    ff_sign = Calc(MM, "0300000032", "Sign", "real", "measure", "quantitative",
                   'SIGN(SUM(IF [MetricKey]="foreign_net_flow" THEN [Value] END))')

    # ── Theme + brief calcs ──
    ts = Table(TS)
    ab = Table(AB)
    th_sign = Calc(TS, "0300000040", "Sign", "real", "measure", "quantitative",
                   "SIGN(SUM([OverallScore]))")

    # ═══ PAGE 1 — Market Pulse ═══
    idx_txt, idx_col = _arrow(K["idx_ytd"], favorable_up=True)
    ytd_txt, ytd_col = _arrow(K["idx_mtd"], favorable_up=True)
    turn_txt, turn_col = _arrow(K["turn_delta"], favorable_up=True)
    fore_txt, fore_col = _arrow(K["foreign_delta"], favorable_up=True)
    pe_txt, pe_col = _arrow(K["pe_delta"], favorable_up=False)  # rising P/E = richer/less favorable

    kpi_cards = [
        A.kpi_card_delta("K1_idx", k_idx, "VN-Index", idx_txt, idx_col, "vs đầu năm (YTD)"),
        A.kpi_card_delta("K2_ytd", k_ytd, "Hiệu suất YTD", ytd_txt, ytd_col, "so với MTD"),
        A.kpi_card_delta("K3_turn", k_turn, "Thanh khoản BQ/ngày", turn_txt, turn_col, "vs 60 phiên trước"),
        A.kpi_card_delta("K4_fore", k_fore, "Vốn ngoại lũy kế", fore_txt, fore_col, "so với tháng trước", size=17),
        A.kpi_card_delta("K5_pe", k_pe, "P/E thị trường", pe_txt, pe_col, "vs BQ 12 tháng"),
    ]
    sparks = [
        A.sparkline("S1_idx", MM, "Month", s_idx, color=A.BRAND),
        A.sparkline("S2_ytd", MM, "Month", s_ytd, color=A.CYAN),
        A.sparkline("S3_turn", MM, "Month", s_turn, color=A.BRAND),
        A.sparkline("S4_fore", MM, "Month", s_fore, color=A.CYAN),
        A.sparkline("S5_pe", MM, "Month", s_pe, color=A.BRAND),
    ]
    hero_ws = A.line_trend("P1_hero", "VN-Index theo tháng (2024–2026)", MM, "Month", hero, color=A.BRAND)
    theme_bar = A.chart(
        "P1_theme", "Chủ đề đầu tư — điểm tổng hợp", TS,
        deps=[ts.dep("ThemeNameVi"), ts.dep("OverallScore"), th_sign.dep_col()],
        insts=[ts.dim_inst("ThemeNameVi"), ts.agg_inst("OverallScore"), th_sign.inst()],
        rows=ts.dim("ThemeNameVi"), cols=ts.measure("OverallScore"), mark="Bar",
        encodings=[("color", th_sign.ref())], color_palette="ACB Diverging Measure",
        data_label=ts.measure("OverallScore"),
        computed_sort=(ts.dim("ThemeNameVi"), ts.measure("OverallScore"), "descending"))
    ff_bar = A.diverging_month_bar("P1_foreign", "Dòng vốn ngoại ròng theo tháng", MM, "Month",
                                   ff_val, ff_sign)

    page1_sheets = kpi_cards + sparks + [hero_ws, theme_bar, ff_bar]
    p1_rows = [
        A.header_band("Market Pulse", "Toàn cảnh thị trường Việt Nam"),
        A.spark_hrow([("K1_idx", "S1_idx"), ("K2_ytd", "S2_ytd"), ("K3_turn", "S3_turn"),
                      ("K4_fore", "S4_fore"), ("K5_pe", "S5_pe")], 20000),
        A.hrow(["P1_hero"], 38000),
        A.hrow(["P1_theme", "P1_foreign"], 36000),
    ]
    dash1 = A.dashboard("ACB Market Pulse", p1_rows)

    # ═══ PAGE 2 — Macro & Market Drivers ═══
    macro_ws = [A.line_trend(f"M_{key}", cap, MM, "Month", calc,
                             color=(A.BRAND if i % 2 == 0 else A.CYAN))
                for (i, ((cid, cap, key, fmt), calc)) in enumerate(zip(macro_specs, macro_calcs))]
    macro_names = [f"M_{key}" for _, _, key, _ in macro_specs]
    p2_rows = [
        A.header_band("Macro & Market Drivers", "Các động lực vĩ mô & thị trường"),
        A.hrow(macro_names[0:3], 26000),
        A.hrow(macro_names[3:6], 26000),
        A.hrow(macro_names[6:9], 26000),
    ]
    dash2 = A.dashboard("ACB Macro Drivers", p2_rows)

    # ═══ PAGE 3 — Advisor Cockpit ═══
    theme_bar2 = A.chart(
        "P3_theme", "Bảng điểm chủ đề đầu tư (Momentum · Định giá · Lợi nhuận · Dòng vốn)", TS,
        deps=[ts.dep("ThemeNameVi"), ts.dep("OverallScore"), th_sign.dep_col()],
        insts=[ts.dim_inst("ThemeNameVi"), ts.agg_inst("OverallScore"), th_sign.inst()],
        rows=ts.dim("ThemeNameVi"), cols=ts.measure("OverallScore"), mark="Bar",
        encodings=[("color", th_sign.ref())], color_palette="ACB Diverging Measure",
        data_label=ts.measure("OverallScore"),
        computed_sort=(ts.dim("ThemeNameVi"), ts.measure("OverallScore"), "descending"))
    # Brief leaderboard: proven pattern (single color + measure label). Color by
    # Category dimension does not bind in hand-authored .twb, so use brand blue.
    brief_bar = A.chart(
        "P3_briefs", "Khuyến nghị cho chuyên viên tư vấn — theo mức độ tin cậy", AB,
        deps=[ab.dep("TitleVi"), ab.dep("Conviction")],
        insts=[ab.dim_inst("TitleVi"), ab.agg_inst("Conviction")],
        rows=ab.dim("TitleVi"), cols=ab.measure("Conviction"), mark="Bar",
        single_color=A.BRAND,
        data_label=ab.measure("Conviction"),
        computed_sort=(ab.dim("TitleVi"), ab.measure("Conviction"), "descending"))
    p3_rows = [
        A.header_band("Advisor Cockpit", "Buồng lái tư vấn — chủ đề & khuyến nghị"),
        A.hrow(["P3_theme"], 30000),
        A.hrow(["P3_briefs"], 40000),
    ]
    dash3 = A.dashboard("ACB Advisor Cockpit", p3_rows)

    # ── Assemble ──
    all_sheets = page1_sheets + macro_ws + [theme_bar2, brief_bar]
    all_names = ([s.split("name='")[1].split("'")[0] for s in all_sheets])
    all_calcs = ([k_idx, k_ytd, k_turn, k_fore, k_pe,
                  s_idx, s_ytd, s_turn, s_fore, s_pe, hero,
                  *macro_calcs, ff_val, ff_sign, th_sign])
    dash_xml = "\n".join([dash1, dash2, dash3])
    dash_names = ["ACB Market Pulse", "ACB Macro Drivers", "ACB Advisor Cockpit"]
    xml = A.workbook([MM, MD, TS, AB], all_calcs, all_sheets, all_names, dash_xml, dash_names)
    print("validate:", A.validate(xml))
    twbx = A.package_twbx(xml, WB)
    print(f"twbx: {twbx}  ({twbx.stat().st_size:,} bytes)")
    return twbx


# ACB Brief palette (Opportunity=green / Catalyst=blue / Risk=red) — appended to
# the lib's palette block at build time.
_BRIEF_PALETTE = """    <color-palette name='ACB Brief' type='ordered-sequential'>
      <color>#0E9F6E</color>
      <color>#0038A8</color>
      <color>#D64545</color>
    </color-palette>
  </preferences>"""


def _inject_brief_palette(twbx_path: Path):
    """Add the ACB Brief palette into the packaged .twb (lib block ends </preferences>)."""
    import zipfile
    twb_name = f"{WB}.twb"
    twb = Path(f"/tmp/acb/{twb_name}").read_text(encoding="utf-8")
    if "ACB Brief" not in twb:
        twb = twb.replace("  </preferences>", _BRIEF_PALETTE, 1)
        Path(f"/tmp/acb/{twb_name}").write_text(twb, encoding="utf-8")
        with zipfile.ZipFile(twbx_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(twb_name, twb)
            z.write(A.HYPER, arcname="Data/Datasources/acb.hyper")
    return twbx_path


if __name__ == "__main__":
    twbx = build()
    twbx = _inject_brief_palette(twbx)
    print("validate after palette:", A.validate(Path(f"/tmp/acb/{WB}.twb").read_text(encoding="utf-8")))
    if "--publish" in sys.argv:
        wid = A.publish(twbx, WB)
        A.render(wid, WB)
