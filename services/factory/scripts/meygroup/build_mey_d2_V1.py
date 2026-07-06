"""D2 Kinh Doanh & Phễu — VERSION 1 (Style B sparkline KPIs).

Adds a 6-month sparkline under each KPI hero number — the signature move of the
reference workbooks the user pointed at (Superstore Dashboard, Financial #RWFD,
Company Finance Health #VOTD). Style B = number on top, trend line below.

Approach = SURGICAL PATCH of the LIVE workbook (never overwrite):
  1. Download the current LIVE "Mey Group - Kinh Doanh Pheu" (carries the user's
     Desktop polish: welded legend, funnel, 6 cross-filter actions, KPI heights).
  2. For each of the 5 KPI cards, author a matching sparkline worksheet:
       cols = MONTH(date) continuous  (Superstore [tmn:date:qk] idiom)
       rows = the SAME KPI calc (COUNTD recomputes per month)
       mark = Line, brand blue, ALL axes/gridlines/borders/headers hidden.
  3. Restructure each KPI strip cell into a VERTICAL flow: [number leaf, spark
     leaf] so the sparkline sits under the number inside the same rounded card.
  4. Publish as a NEW workbook "Mey Group - Kinh Doanh Pheu V1".

Sparkline date per KPI: Leads/Booking/Lost/Tỷ lệ chốt → CreatedDate (lead month);
Deal → ClosedDate (deal month). Ciel excluded exactly as the KPI calcs already do.

Run:  uv run python scripts/meygroup/build_mey_d2_V1.py            # build .twb
      uv run python scripts/meygroup/build_mey_d2_V1.py --publish  # + publish V1
"""
import re
import sys
import uuid
from pathlib import Path

LIVE_TWB = Path("/tmp/mey-d2-live/d2.twb")
OUT_TWB = Path("/tmp/wb-mey-d2-V1.twb")
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
BRAND = "#1b75bc"
CYAN = "#29abe2"

# KPI card name → (kpi calc id, format, sparkline date field, sparkline calc id).
# The sparkline reuses the KPI calc grouped by MONTH(date); it needs its OWN calc
# id only to be self-contained in the sparkline worksheet's dep block — but since
# the calc already exists in the datasource we just reference it. We add a NEW
# per-month column-instance of the SAME calc.
KPIS = [
    ("KPI Leads",      "Calculation_0090020000000001", "n#,##0",   "CreatedDate"),
    ("KPI Booking",    "Calculation_0090020000000004", "n#,##0",   "CreatedDate"),
    ("KPI Deal",       "Calculation_0090020000000002", "n#,##0",   "ClosedDate"),
    ("KPI Tỷ lệ chốt", "Calculation_0090020000000003", "p0.0%",    "CreatedDate"),
    ("KPI Lost",       "Calculation_0090020000000005", "n#,##0",   "CreatedDate"),
]


def esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


def U() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


def spark_name(kpi_name: str) -> str:
    return kpi_name + " Spark"


def sparkline_worksheet(kpi_name: str, calc_id: str, date_field: str) -> str:
    """A minimalist sparkline: continuous MONTH(date) on cols, the KPI calc on
    rows, mark=Line, brand blue, EVERYTHING hidden (axis display, gridlines,
    zero-line, headers, borders) — the Superstore 'Sales KPI (Line)' idiom.
    The calc is referenced (already defined in the datasource); we add its
    per-month column-instance + a truncated-month date instance."""
    calc_ref = f"[{DS}].[usr:{calc_id}:qk]"
    date_tmn = f"[{DS}].[tmn:{date_field}:qk]"   # truncate-to-month, continuous
    # The date + calc columns already exist in the datasource; the worksheet only
    # needs to declare their column-instances (matching D2's existing dep style).
    # derivation='Month-Trunc' → continuous monthly axis [tmn:field:qk] (Superstore).
    deps = "\n".join([
        f"            <column aggregation='Year' caption='{esc(date_field)}' datatype='datetime' default-type='ordinal' layered='true' name='[{date_field}]' pivot='key' role='dimension' type='ordinal' user-datatype='datetime' visual-totals='Default' />",
        f"            <column-instance column='[{date_field}]' derivation='Month-Trunc' name='[tmn:{date_field}:qk]' pivot='key' type='quantitative' />",
        f"            <column-instance column='[{calc_id}]' derivation='User' name='[usr:{calc_id}:qk]' pivot='key' type='quantitative' />",
    ])
    return f"""    <worksheet name='{esc(spark_name(kpi_name))}'>
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
            <format attr='display' value='false' />
            <format attr='rule-color' value='#00000000' />
            <format attr='tick-color' value='#00000000' />
          </style-rule>
          <style-rule element='gridline'>
            <format attr='line-visibility' scope='cols' value='off' />
            <format attr='line-visibility' scope='rows' value='off' />
            <format attr='stroke-size' scope='cols' value='0' />
            <format attr='stroke-size' scope='rows' value='0' />
          </style-rule>
          <style-rule element='zeroline'>
            <format attr='line-visibility' value='off' />
            <format attr='stroke-size' value='0' />
          </style-rule>
          <style-rule element='worksheet'>
            <format attr='display-field-labels' scope='cols' value='false' />
            <format attr='display-field-labels' scope='rows' value='false' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Line' />
            <style>
              <style-rule element='mark'>
                <format attr='mark-color' value='{BRAND}' />
                <format attr='size' value='1.4' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{calc_ref}</rows>
        <cols>{date_tmn}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


def restructure_kpi_zone(dash_xml: str, kpi_name: str) -> str:
    """Wrap the KPI card leaf zone in a VERTICAL layout-flow containing the number
    leaf (top ~62%) and the sparkline leaf (bottom ~38%), so the sparkline lives
    inside the same rounded card, under the number. The rounded-card zone-style
    moves to the OUTER vertical zone; inner leaves are borderless/transparent."""
    m = re.search(r"<zone\b[^>]*name='%s'[^>]*>.*?</zone>" % re.escape(kpi_name), dash_xml, re.S)
    assert m, f"KPI zone {kpi_name} not found"
    leaf = m.group(0)
    # geometry of the original leaf
    attrs = re.match(r"<zone\b([^>]*)>", leaf).group(1)
    def g(a, d=""):
        mm = re.search(r"%s='([^']*)'" % a, attrs)
        return mm.group(1) if mm else d
    x, y, w, h = g("x", "0"), g("y", "0"), g("w", "100000"), g("h", "100000")
    # the original card zone-style (rounded corners / border / bg) → outer
    zs = re.search(r"<zone-style>.*?</zone-style>", leaf, re.S).group(0)
    # KPI Deal carries a 2-line label (number + '▲102% so KHNS'), so it needs a
    # taller number band than the 1-line cards or the 2nd line collides with the
    # sparkline. Split 80/20 for Deal, 72/28 for the rest.
    num_h = 80000 if kpi_name == "KPI Deal" else 72000
    spark_y = num_h
    spark_h = 100000 - num_h
    # inner number leaf: keep the KPI worksheet, no border, transparent, cell-sized
    num_leaf = (f"          <zone h='{num_h}' id='{_zid()}' name='{esc(kpi_name)}' w='100000' x='0' y='0'>\n"
                f"            <layout-cache cell-count-h='1' cell-count-w='1' non-cell-size-h='33' type-h='cell' type-w='cell' />\n"
                f"            <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
                f"<format attr='margin' value='0' /><format attr='padding' value='2' />"
                f"<format attr='background-color' value='#00000000' /></zone-style>\n"
                f"          </zone>")
    # inner sparkline leaf — show-title='false' hides the worksheet name that
    # Tableau otherwise stamps on the zone (it was overlapping the KPI number).
    spark_leaf = (f"          <zone h='{spark_h}' id='{_zid()}' name='{esc(spark_name(kpi_name))}' show-title='false' w='100000' x='0' y='{spark_y}'>\n"
                  f"            <layout-cache minwidth='60' type-h='scalable' type-w='scalable' />\n"
                  f"            <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
                  f"<format attr='margin' value='0' /><format attr='padding' value='2' />"
                  f"<format attr='background-color' value='#00000000' /></zone-style>\n"
                  f"          </zone>")
    outer = (f"        <zone h='{h}' id='{_zid()}' param='vert' type-v2='layout-flow' w='{w}' x='{x}' y='{y}'>\n"
             f"{num_leaf}\n{spark_leaf}\n"
             f"          {zs}\n"
             f"        </zone>")
    return dash_xml.replace(leaf, outer, 1)


_ZID = [90000]
def _zid():
    _ZID[0] += 1
    return _ZID[0]


# ── "Nhấn cột cao nhất" for DealThang — the proven D1-V1 emphasis form ────────
# Bar colored by its own value via 'Mey Sequential Blue' (max month darkest navy)
# + gold per-cell KPI reference-line + a /1e9-or-raw display-calc label. Replaces
# the 3-layer TH/KHNS/KPI bullet. Deal ≈ units so actual=UnitsSold(MF), kpi=
# UnitsSoldKpi, div=1 (count, no tỷ). Display calc id below is unique in D2.
DEAL_ACTUAL = "UnitsSold (MonthlyFinancial)"
DEAL_KPI = "UnitsSoldKpi"
DEAL_LBL_CID = "0090025000000001"   # SUM(actual)/1 display calc for the label
GOLD = "#c29b54"


def deal_label_calc_col() -> str:
    return (f"      <column caption='Deal (Thực hiện)' datatype='real' default-format='n#,##0' "
            f"name='[Calculation_{DEAL_LBL_CID}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='{esc(f'SUM([{DEAL_ACTUAL}])')}' />\n"
            f"      </column>")


def deal_emphasis_worksheet() -> str:
    a_raw = f"[{DS}].[sum:{DEAL_ACTUAL}:qk]"
    k_raw = f"[{DS}].[sum:{DEAL_KPI}:qk]"
    a_lbl = f"[{DS}].[usr:Calculation_{DEAL_LBL_CID}:qk]"
    month_ord = f"[{DS}].[mn:Month:ok]"
    title = "Deal theo Tháng (Thực hiện · vạch KPI)"

    def rawcol(n):
        return (f"            <column aggregation='Sum' datatype='integer' default-type='quantitative' "
                f"layered='true' name='[{n}]' pivot='key' role='measure' type='quantitative' "
                f"user-datatype='integer' visual-totals='Default' />")

    deps = "\n".join([
        f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' layered='true' name='[Month]' pivot='key' role='dimension' type='ordinal' user-datatype='datetime' visual-totals='Default' />",
        rawcol(DEAL_ACTUAL), rawcol(DEAL_KPI),
        f"            <column caption='Deal (Thực hiện)' datatype='real' default-format='n#,##0' name='[Calculation_{DEAL_LBL_CID}]' role='measure' type='quantitative' />",
        f"            <column-instance column='[Month]' derivation='Month' name='[mn:Month:ok]' pivot='key' type='ordinal' />",
        f"            <column-instance column='[{DEAL_ACTUAL}]' derivation='Sum' name='[sum:{DEAL_ACTUAL}:qk]' pivot='key' type='quantitative' />",
        f"            <column-instance column='[{DEAL_KPI}]' derivation='Sum' name='[sum:{DEAL_KPI}:qk]' pivot='key' type='quantitative' />",
        f"            <column-instance column='[Calculation_{DEAL_LBL_CID}]' derivation='User' name='[usr:Calculation_{DEAL_LBL_CID}:qk]' pivot='key' type='quantitative' />",
    ])
    return f"""    <worksheet name='DealThang'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='#0F2A47'>{esc(title)}</run></formatted-text></title>
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
            <reference-line axis-column='{a_raw}' enable-instant-analytics='true' formula='sum' id='kpiline' label-type='none' scope='per-cell' tooltip-type='none' value-column='{k_raw}' z-order='1' />
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


def patch(xml: str) -> str:
    # 0) "Nhấn cột cao nhất" on Deal theo Tháng: swap the TH/KHNS/KPI bullet for
    #    the D1-V1 emphasis chart (Mey Sequential Blue by value + gold KPI vạch).
    #    Inject its display-calc before the structural </datasource>; remove the
    #    welded color-legend zone (3019) — the sequential bars need no legend.
    dt_pat = re.compile(r"    <worksheet name='DealThang'>.*?</worksheet>", re.S)
    assert dt_pat.search(xml), "DealThang worksheet not found"
    xml = dt_pat.sub(lambda m: deal_emphasis_worksheet(), xml, count=1)
    idx = xml.rfind("</datasource>")
    assert idx > 0
    xml = xml[:idx] + deal_label_calc_col() + "\n    " + xml[idx:]
    # drop the welded Measure-Names color legend zone for DealThang (id 3019)
    xml = re.sub(r"\s*<zone\b[^>]*id='3019'[^>]*type-v2='color'[^>]*>.*?</zone>", "", xml, flags=re.S)
    xml = re.sub(r"\s*<zone\b[^>]*id='3019'[^>]*type-v2='color'[^>]*/>", "", xml)

    # 1) Append the 5 sparkline worksheets before </worksheets>.
    sparks = "\n".join(sparkline_worksheet(n, cid, dt) for n, cid, fmt, dt in KPIS)
    xml = xml.replace("</worksheets>", sparks + "\n  </worksheets>", 1)

    # 2) Make the KPI strip TALLER so the number + sparkline both fit. The strip
    #    row (3006) is is-fixed='true' fixed-size='136' — a FIXED PIXEL height, not
    #    a relative weight. Grow it to 210px (136 number-band + ~74 sparkline). The
    #    rows below reflow automatically since the canvas is fixed 1560x1100.
    dash = re.search(r"<dashboard\b.*?</dashboard>", xml, re.S).group(0)
    new_dash = dash.replace(
        "<zone fixed-size='136' h='12364' id='3006' is-fixed='true' param='horz'",
        "<zone fixed-size='210' h='12364' id='3006' is-fixed='true' param='horz'", 1)
    assert new_dash != dash, "KPI strip fixed-size not bumped"

    for n, cid, fmt, dt in KPIS:
        new_dash = restructure_kpi_zone(new_dash, n)
    xml = xml.replace(dash, new_dash, 1)

    # 3) Register the sparkline worksheets in <windows> (hidden) + dashboard
    #    viewpoints, so Cloud accepts the dashboard's references to them.
    win_block = "".join(
        f"    <window class='worksheet' hidden='true' name='{esc(spark_name(n))}'></window>\n"
        for n, _, _, _ in KPIS)
    xml = xml.replace("  <windows>\n", "  <windows>\n" + win_block, 1)
    vps = "\n".join(
        f"        <viewpoint name='{esc(spark_name(n))}'><zoom type='entire-view' /></viewpoint>"
        for n, _, _, _ in KPIS)
    # insert viewpoints into the dashboard window's <viewpoints> block
    xml = re.sub(r"(<window class='dashboard'[^>]*>\s*<viewpoints>)",
                 r"\1\n" + vps, xml, count=1)
    return xml


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml)
        return "OK"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"


def build():
    assert LIVE_TWB.exists(), f"missing {LIVE_TWB} — download live D2 first"
    xml = LIVE_TWB.read_text(encoding="utf-8")
    _ZID[0] = 90000
    xml2 = patch(xml)
    assert xml2.count("<![CDATA[") == xml2.count("]]>"), "CDATA imbalance"
    OUT_TWB.write_text(xml2, encoding="utf-8")
    print(f"D2 V1: {len(xml2):,} bytes  XML {validate(xml2)}")
    print(f"  sparklines: {[spark_name(n) for n,_,_,_ in KPIS]}")
    print(f"  written -> {OUT_TWB}")
    return xml2


def publish():
    import tableauserverclient as tsc, zipfile
    env = {}
    for line in Path("/Users/son.nguyen/tableau-ai-portal/services/factory/.env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    twbx = Path("/tmp/wb-mey-d2-V1.twbx")
    with zipfile.ZipFile(twbx, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(OUT_TWB, arcname="Mey Group - Kinh Doanh Pheu V1.twb")
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        proj_id = "fab7f92a-6f33-4572-9e6f-7769017f58cf"  # Mey Group
        item = tsc.WorkbookItem(project_id=proj_id, name="Mey Group - Kinh Doanh Pheu V1", show_tabs=False)
        pub = server.workbooks.publish(item, str(twbx), mode=tsc.Server.PublishMode.Overwrite, skip_connection_check=True)
        print(f"PUBLISHED: {pub.name}  id={pub.id}")
        return pub.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
