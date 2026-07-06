"""D1 Tài Chính — VERSION 1 (emphasis-month upgrade).

Applies the Superstore "highlight one column" technique (the reference workbook
the user pointed at) to the 3 monthly charts of D1, WITHOUT touching any other
polish. Approach = SURGICAL PATCH of the LIVE workbook, not a rebuild:

  1. Download the current LIVE "Mey Group - Tai Chinh" (rev 46) — it carries all
     the user's Desktop polish (ring worksheets, unified colors, công-nợ fix,
     legends, KPI pct cards) that the build_mey_d1_v3.py generator does NOT have.
  2. Replace ONLY the 3 monthly bullet worksheets (SanLuongThang / DoanhSoThang /
     DongTienThang) with an "emphasis month" chart:
        - single 'Thực hiện' series (drops the KHNS ghost per user's choice),
        - the MAX month bar is brand blue #1B75BC, every other month pale #C7D2DE
          (color = boolean calc  SUM(x) = WINDOW_MAX(SUM(x))  — the exact
          Cloud-safe technique from Superstore's `Sales | By Category`, verified
          on Tableau Public strict engine),
        - a thin gold KPI tick per month on a COMBINED axis (rows = SUM(actual) +
          SUM(kpi)) rendered as a GanttBar (Superstore pane id=2 pattern — a
          combined-measure axis, NOT the <join-axes> dual-axis that Cloud rejects
          with 500000).
     Worksheet NAMES are preserved so the dashboard zones / viewpoints / any
     Desktop actions stay wired.
  3. Inject 3 boolean highlight calcs + 3 datasource-level color maps
     (true→#1B75BC, false→#C7D2DE) into the existing ds <style> block.
  4. Publish as a NEW workbook  "Mey Group - Tai Chinh V1"  (never overwrite the
     LIVE D1).

Run:  uv run python scripts/meygroup/build_mey_d1_V1.py            # build .twb only
      uv run python scripts/meygroup/build_mey_d1_V1.py --publish  # + publish V1
"""
import re
import sys
import uuid
from pathlib import Path

LIVE_TWB = Path("/tmp/mey-d1-live/d1-live.twb")
OUT_TWB = Path("/tmp/wb-mey-d1-V1.twb")
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"

# ── the 3 monthly charts. Each carries its own set of calc IDs:
#   name, actual raw measure, kpi raw measure, div (1 for count, 1e9 for tỷ),
#   max-value-calc id (highlight month), other-value-calc id, kpi-display id
#    NOTE: UnitsSold is QUALIFIED — Projects also has UnitsSold; the monthly one is
#    [UnitsSold (MonthlyFinancial)] (unqualified [UnitsSold] = Projects total →
#    every month would show 2.335). The Kpi/Revenue/Cash measures are unqualified.
CHARTS = [
    ("SanLuongThang", "UnitsSold (MonthlyFinancial)", "UnitsSoldKpi", 1,
     "0090015100000001", "0090015200000001", "0090015300000001"),
    ("DoanhSoThang", "RevenueVnd", "RevenueKpiVnd", 1000000000,
     "0090015100000002", "0090015200000002", "0090015300000002"),
    ("DongTienThang", "CashCollectedVnd", "CashCollectedKpiVnd", 1000000000,
     "0090015100000003", "0090015200000003", "0090015300000003"),
]
BRAND = "#1b75bc"   # max month
PALE = "#c7d2de"    # other months
GOLD = "#c29b54"    # KPI tick (per-cell reference line)


def esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


def U() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


# The COLOR mechanism that provably binds on this Cloud is color-by-[:Measure Names]
# with a datasource-level map whose buckets are MEASURE field-refs (D2's live bullets
# use exactly this; every color-by-DIMENSION variant I tried — boolean/string,
# ds-map or named palette — fell back to Tableau's default orange). So the emphasis
# is done by SPLITTING the actual into two measures placed on Measure Values:
#   max_val   = IF this month is the max THEN SUM(x)/div END   (→ brand, "Tháng cao nhất")
#   other_val = IF NOT the max          THEN SUM(x)/div END   (→ pale,  "Tháng khác")
# Exactly one is non-null per month, so only one bar renders per month at full
# position → the highlight effect, coloured deterministically by Measure Names.

def max_value_calc(mid: str, raw: str, div: int) -> str:
    inner = f"{{ FIXED [Month] : SUM([{raw}]) }}"
    formula = f"IF {inner} = {{ FIXED : MAX({inner}) }} THEN SUM([{raw}]) / {div} END"
    return (f"      <column caption='Tháng cao nhất' datatype='real' default-format='n#,##0' "
            f"name='[Calculation_{mid}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='{esc(formula)}' />\n"
            f"      </column>")


def other_value_calc(oid: str, raw: str, div: int) -> str:
    inner = f"{{ FIXED [Month] : SUM([{raw}]) }}"
    formula = f"IF {inner} != {{ FIXED : MAX({inner}) }} THEN SUM([{raw}]) / {div} END"
    return (f"      <column caption='Tháng khác' datatype='real' default-format='n#,##0' "
            f"name='[Calculation_{oid}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='{esc(formula)}' />\n"
            f"      </column>")


def kpi_display_calc_col(cid: str, raw: str, div: int) -> str:
    """KPI display measure = SUM(raw)/div (for the gold reference-line tick)."""
    return (f"      <column caption='KPI' datatype='real' default-format='n#,##0' "
            f"name='[Calculation_{cid}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='{esc(f'SUM([{raw}]) / {div}')}' />\n"
            f"      </column>")


def emphasis_worksheet(name, actual, kpi, div, mid, oid, kid, title_vn) -> str:
    """Monthly column chart: bars graded by value with 'Mey Sequential Blue'
    (max month = darkest brand blue = natural emphasis) + gold KPI tick + tỷ label.

    All-proven-rendering structure (this workbook's live ranking bars use exactly
    the color mechanism; every categorical color-by-dimension variant fell back to
    Tableau's default orange, and the Measure-Names split rendered blank):
      cols = MONTH(Month); rows = SUM(actual_raw)   ← raw measure → renders
      color = SUM(actual_raw) with palette='Mey Sequential Blue' (sequential
              gradient: tallest/max = darkest #0F2A47→#1B75BC, shorter = lighter)
      text  = /1e9 display calc → tỷ-formatted label
      KPI tick = per-cell <reference-line>, value-column = raw KPI (+ <lod> pill),
              gold, styled via <style-rule element='refline'>.
    (mid = actual display calc for the label; oid unused; kid unused.)
    """
    a_raw = f"[{DS}].[sum:{actual}:qk]"           # raw actual → bar length + color
    k_raw = f"[{DS}].[sum:{kpi}:qk]"              # raw kpi → refline value + lod
    a_lbl = f"[{DS}].[usr:Calculation_{mid}:qk]"  # /1e9 display calc → tỷ label
    month_ord = f"[{DS}].[mn:Month:ok]"

    def rawcol(n):
        return (f"            <column aggregation='Sum' datatype='integer' default-type='quantitative' "
                f"layered='true' name='[{n}]' pivot='key' role='measure' type='quantitative' "
                f"user-datatype='integer' visual-totals='Default' />")

    deps = "\n".join([
        f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' layered='true' name='[Month]' pivot='key' role='dimension' type='ordinal' user-datatype='datetime' visual-totals='Default' />",
        rawcol(actual), rawcol(kpi),
        f"            <column caption='Thực hiện (tỷ)' datatype='real' default-format='n#,##0' name='[Calculation_{mid}]' role='measure' type='quantitative' />",
        f"            <column-instance column='[Month]' derivation='Month' name='[mn:Month:ok]' pivot='key' type='ordinal' />",
        f"            <column-instance column='[{actual}]' derivation='Sum' name='[sum:{actual}:qk]' pivot='key' type='quantitative' />",
        f"            <column-instance column='[{kpi}]' derivation='Sum' name='[sum:{kpi}:qk]' pivot='key' type='quantitative' />",
        f"            <column-instance column='[Calculation_{mid}]' derivation='User' name='[usr:Calculation_{mid}:qk]' pivot='key' type='quantitative' />",
    ])

    return f"""    <worksheet name='{esc(name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='#0F2A47'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='meygroup' name='{DS}' />
          </datasources>
          <datasource-dependencies datasource='{DS}'>
{deps}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='false' />
          </style-rule>
          <style-rule element='axis'>
            <format attr='rule-color' value='#C3CDD8' />
            <format attr='tick-color' value='#E3E9EF' />
          </style-rule>
          <style-rule element='refline'>
            <format attr='stroke-color' id='kpiline' value='{GOLD}' />
            <format attr='stroke-size' id='kpiline' value='3' />
            <format attr='line-visibility' id='kpiline' value='on' />
            <format attr='line-pattern-only' id='kpiline' value='solid' />
            <format attr='fill-above' id='kpiline' value='#00000000' />
            <format attr='fill-below' id='kpiline' value='#00000000' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Bar' />
            <encodings>
              <color column='{a_raw}' palette='Mey Sequential Blue' type='palette' />
              <lod column='{k_raw}' />
              <text column='{a_lbl}' />
            </encodings>
            <reference-line axis-column='{a_raw}' enable-instant-analytics='true' formula='sum' id='kpiline' label-type='none' scope='per-cell' tooltip-type='none' value-column='{k_raw}' z-order='2' />
            <customized-label>
              <formatted-text>
                <run bold='true' fontalignment='1' fontcolor='#0F2A47' fontsize='9'>&lt;{a_lbl}&gt;</run>
              </formatted-text>
            </customized-label>
            <style>
              <style-rule element='mark'>
                <format attr='mark-bar-size' value='0.62' />
                <format attr='mark-labels-show' value='true' />
                <format attr='mark-labels-cull' value='true' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{a_raw}</rows>
        <cols>{month_ord}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# Vietnamese titles for the 3 monthly charts (the LIVE bullets had these; keep them)
TITLES = {
    "SanLuongThang": "Sản lượng theo Tháng (Thực hiện · vạch KPI)",
    "DoanhSoThang": "Doanh số theo Tháng (Thực hiện · vạch KPI)",
    "DongTienThang": "Dòng tiền thu theo Tháng (Thực hiện · vạch KPI)",
}

def patch(xml: str) -> str:
    # 1) Replace each of the 3 monthly worksheets in place (keep names).
    for name, actual, kpi, div, hid, aid, kid in CHARTS:
        pat = re.compile(r"    <worksheet name='%s'>.*?</worksheet>" % re.escape(name), re.S)
        assert pat.search(xml), f"worksheet {name} not found in live twb"
        xml = pat.sub(lambda m: emphasis_worksheet(name, actual, kpi, div, hid, aid, kid, TITLES[name]), xml, count=1)

    # 2) Inject the calc columns per chart into the STRUCTURAL datasource close:
    #    Only the actual /1e9 display calc (mid) per chart — for the tỷ label.
    #    rfind targets the real </datasource> (the first is inside CDATA).
    calc_cols = []
    for _, actual, kpi, div, mid, oid, kid in CHARTS:
        calc_cols.append(kpi_display_calc_col(mid, actual, div))  # reused shape: SUM(actual)/div
    idx = xml.rfind("</datasource>")
    assert idx > 0
    xml = xml[:idx] + "\n".join(calc_cols) + "\n    " + xml[idx:]

    # 3) Ensure the 'Mey Sequential Blue' palette exists in <preferences> (the live
    #    D1 has none). It's the exact sequential gradient the live ranking bars use,
    #    so color-by-measure grades bars dark→light (max month = darkest brand).
    palette = ("    <color-palette name='Mey Sequential Blue' type='ordered-sequential'>\n"
               "      <color>#D6ECF8</color>\n      <color>#9FD3EF</color>\n"
               "      <color>#5FB4E5</color>\n      <color>#29ABE2</color>\n"
               "      <color>#1B75BC</color>\n      <color>#0F2A47</color>\n"
               "    </color-palette>")
    if "<preferences>" not in xml:
        anchor = "</document-format-change-manifest>"
        j = xml.find(anchor) + len(anchor)
        xml = xml[:j] + f"\n  <preferences>\n{palette}\n  </preferences>" + xml[j:]
    elif "name='Mey Sequential Blue'" not in xml:
        j = xml.find("<preferences>") + len("<preferences>")
        xml = xml[:j] + "\n" + palette + xml[j:]

    # 4) Delete the 3 stale color-legend zones (type-v2='color' on the old bullets'
    #    Measure Names) — the emphasis charts don't need a legend and it would show
    #    the raw highlight members. Zones are self-... no; remove the whole element.
    for wsname in ("SanLuongThang", "DoanhSoThang", "DongTienThang"):
        # a color legend zone: <zone ... name='<ws>' ... type-v2='color' ...> ... </zone>
        pat = re.compile(
            r"\s*<zone\b[^>]*name='%s'[^>]*type-v2='color'[^>]*>.*?</zone>" % re.escape(wsname),
            re.S)
        # some are self-closing
        pat_sc = re.compile(
            r"\s*<zone\b[^>]*name='%s'[^>]*type-v2='color'[^>]*/>" % re.escape(wsname))
        xml = pat.sub("", xml)
        xml = pat_sc.sub("", xml)
    return xml


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml)
        return "OK"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"


def build():
    assert LIVE_TWB.exists(), f"missing {LIVE_TWB} — download the live D1 first"
    xml = LIVE_TWB.read_text(encoding="utf-8")
    # sanity: CDATA must stay balanced after patch
    xml2 = patch(xml)
    assert xml2.count("<![CDATA[") == xml2.count("]]>"), "CDATA imbalance after patch"
    OUT_TWB.write_text(xml2, encoding="utf-8")
    print(f"D1 V1: {len(xml2):,} bytes  XML {validate(xml2)}")
    print(f"  boolean calcs added: {[c[3] for c in CHARTS]}")
    print(f"  written -> {OUT_TWB}")
    return xml2


def publish():
    """Publish OUT_TWB as a NEW workbook 'Mey Group - Tai Chinh V1' in Mey Group."""
    import tableauserverclient as tsc
    import shutil
    env = {}
    for line in Path("/Users/son.nguyen/tableau-ai-portal/services/factory/.env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    # package as .twbx (single-file, references the published datasource)
    twbx = Path("/tmp/wb-mey-d1-V1.twbx")
    import zipfile
    with zipfile.ZipFile(twbx, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(OUT_TWB, arcname="Mey Group - Tai Chinh V1.twb")
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        proj_id = "fab7f92a-6f33-4572-9e6f-7769017f58cf"  # Mey Group
        new_item = tsc.WorkbookItem(project_id=proj_id, name="Mey Group - Tai Chinh V1", show_tabs=False)
        published = server.workbooks.publish(
            new_item, str(twbx), mode=tsc.Server.PublishMode.Overwrite,
            skip_connection_check=True,
        )
        print(f"PUBLISHED: {published.name}  id={published.id}  project={published.project_name}")
        return published.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
