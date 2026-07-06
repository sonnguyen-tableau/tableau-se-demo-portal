"""Mey Pearl Ciel — Deep Dive — VERSION 1 (Style B sparkline KPIs).

Retouches the Ciel deep-dive to the D1/D2 V1 best practice (skill
tableau-exec-dashboard §10):
  - a 6-month trend sparkline under each of the 5 funnel KPIs. Ciel leads carry a
    real CreatedDate (months 4-5-6, ramping to the 25/06 kickoff — 25%/35%/40%),
    so the sparkline is HONEST monthly data showing the pipeline ramp.
  - removes the broken floating "Ring Booking" gauge (a Pie mark that renders as a
    tiny dot on this Cloud — memory: pies render as dots; the 78% booking-vs-1000
    story is carried by the AI Q3 answer, not a broken glyph).

Surgical patch of the LIVE workbook. Publish as "Mey Group - Ciel Deep Dive V1".

Run:  uv run python scripts/meygroup/build_mey_ciel_V1.py [--publish]
"""
import re
import sys
import uuid
from pathlib import Path

LIVE_TWB = Path("/tmp/ciel/ciel.twb")
OUT_TWB = Path("/tmp/wb-mey-ciel-V1.twb")
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
BRAND = "#1b75bc"
DATE = "CreatedDate"   # Ciel lead date (months 4-6, ramping)

# KPI card → its calc id (already in the datasource). Sparkline reuses the calc.
KPIS = [
    ("KPI Leads Ciel",   "Calculation_0090060000000101"),
    ("KPI NET",          "Calculation_0090060000000102"),
    ("KPI Visit",        "Calculation_0090060000000103"),
    ("KPI Booking Ciel", "Calculation_0090060000000104"),
    ("KPI Deal Ciel",    "Calculation_0090060000000105"),
]


def esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


def U() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


def spark_name(kpi: str) -> str:
    return kpi + " Spark"


_ZID = [90000]
def _zid():
    _ZID[0] += 1
    return _ZID[0]


def sparkline_worksheet(kpi: str, calc_id: str) -> str:
    calc_ref = f"[{DS}].[usr:{calc_id}:qk]"
    date_tmn = f"[{DS}].[tmn:{DATE}:qk]"
    deps = "\n".join([
        f"            <column aggregation='Year' caption='{esc(DATE)}' datatype='datetime' default-type='ordinal' layered='true' name='[{DATE}]' pivot='key' role='dimension' type='ordinal' user-datatype='datetime' visual-totals='Default' />",
        f"            <column-instance column='[{DATE}]' derivation='Month-Trunc' name='[tmn:{DATE}:qk]' pivot='key' type='quantitative' />",
        f"            <column-instance column='[{calc_id}]' derivation='User' name='[usr:{calc_id}:qk]' pivot='key' type='quantitative' />",
    ])
    return f"""    <worksheet name='{esc(spark_name(kpi))}'>
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
          <style-rule element='axis'>
            <format attr='display' value='false' />
            <format attr='tick-color' value='#00000000' />
          </style-rule>
          <style-rule element='worksheet'>
            <format attr='display-field-labels' scope='cols' value='false' />
            <format attr='display-field-labels' scope='rows' value='false' />
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


def restructure_kpi_zone(dash_xml: str, kpi: str) -> str:
    m = re.search(r"<zone\b[^>]*name='%s'[^>]*>.*?</zone>" % re.escape(kpi), dash_xml, re.S)
    assert m, f"KPI zone {kpi} not found"
    leaf = m.group(0)
    attrs = re.match(r"<zone\b([^>]*)>", leaf).group(1)
    def g(a, d=""):
        mm = re.search(r"%s='([^']*)'" % a, attrs)
        return mm.group(1) if mm else d
    x, y, w, h = g("x", "0"), g("y", "0"), g("w", "100000"), g("h", "100000")
    zs = re.search(r"<zone-style>.*?</zone-style>", leaf, re.S).group(0)
    num_leaf = (f"          <zone h='72000' id='{_zid()}' name='{esc(kpi)}' w='100000' x='0' y='0'>\n"
                f"            <layout-cache cell-count-h='1' non-cell-size-h='32' type-h='cell' type-w='cell' />\n"
                f"            <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
                f"<format attr='margin' value='0' /><format attr='padding' value='2' />"
                f"<format attr='background-color' value='#00000000' /></zone-style>\n"
                f"          </zone>")
    spark_leaf = (f"          <zone h='28000' id='{_zid()}' name='{esc(spark_name(kpi))}' show-title='false' w='100000' x='0' y='72000'>\n"
                  f"            <layout-cache minheight='100' minwidth='100' type-h='scalable' type-w='scalable' />\n"
                  f"            <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
                  f"<format attr='margin' value='0' /><format attr='padding' value='2' />"
                  f"<format attr='background-color' value='#00000000' /></zone-style>\n"
                  f"          </zone>")
    outer = (f"        <zone h='{h}' id='{_zid()}' param='vert' type-v2='layout-flow' w='{w}' x='{x}' y='{y}'>\n"
             f"{num_leaf}\n{spark_leaf}\n"
             f"          {zs}\n"
             f"        </zone>")
    return dash_xml.replace(leaf, outer, 1)


def patch(xml: str) -> str:
    # 0) Remove the broken floating Ring Booking gauge (Pie renders as a dot here).
    dash0 = re.search(r"<dashboard\b.*?</dashboard>", xml, re.S).group(0)
    dash = re.sub(r"\s*<zone\b[^>]*name='Ring Booking'[^>]*>.*?</zone>", "", dash0, flags=re.S)
    dash = re.sub(r"\s*<zone\b[^>]*name='Ring Booking'[^>]*/>", "", dash)
    xml = xml.replace(dash0, dash, 1)

    # 1) Append the 5 sparkline worksheets.
    sparks = "\n".join(sparkline_worksheet(n, cid) for n, cid in KPIS)
    xml = xml.replace("</worksheets>", sparks + "\n  </worksheets>", 1)

    # 2) Grow the KPI strip (h='16000' → 22000) + restructure cards.
    dash = re.search(r"<dashboard\b.*?</dashboard>", xml, re.S).group(0)
    new_dash = dash.replace(
        "<zone h='16000' id='3006' param='horz'",
        "<zone h='22000' id='3006' param='horz'", 1)
    assert new_dash != dash, "KPI strip height not bumped"
    for n, cid in KPIS:
        new_dash = restructure_kpi_zone(new_dash, n)
    xml = xml.replace(dash, new_dash, 1)

    # 3) Register sparklines in <windows> (hidden) + dashboard viewpoints; drop the
    #    Ring Booking viewpoint/window since the zone is gone (harmless if left, but
    #    keep it clean).
    win = "".join(f"    <window class='worksheet' hidden='true' name='{esc(spark_name(n))}'></window>\n" for n, _ in KPIS)
    xml = xml.replace("  <windows>\n", "  <windows>\n" + win, 1)
    vps = "\n".join(f"        <viewpoint name='{esc(spark_name(n))}'><zoom type='entire-view' /></viewpoint>" for n, _ in KPIS)
    xml = re.sub(r"(<window class='dashboard'[^>]*>\s*<viewpoints>)", r"\1\n" + vps, xml, count=1)
    return xml


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml); return "OK"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"


def build():
    assert LIVE_TWB.exists(), f"missing {LIVE_TWB}"
    _ZID[0] = 90000
    xml = LIVE_TWB.read_text(encoding="utf-8")
    xml2 = patch(xml)
    assert xml2.count("<![CDATA[") == xml2.count("]]>"), "CDATA imbalance"
    OUT_TWB.write_text(xml2, encoding="utf-8")
    print(f"Ciel V1: {len(xml2):,} bytes  XML {validate(xml2)}")
    print(f"  sparklines: {[spark_name(n) for n,_ in KPIS]}  | Ring Booking removed: {'Ring Booking' not in re.search(r'<dashboard.*?</dashboard>', xml2, re.S).group(0)}")
    return xml2


def publish():
    import tableauserverclient as tsc, zipfile
    env = {}
    for line in Path("/Users/son.nguyen/tableau-ai-portal/services/factory/.env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip()
    twbx = Path("/tmp/wb-mey-ciel-V1.twbx")
    with zipfile.ZipFile(twbx, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(OUT_TWB, arcname="Mey Group - Ciel Deep Dive V1.twb")
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        item = tsc.WorkbookItem(project_id="fab7f92a-6f33-4572-9e6f-7769017f58cf", name="Mey Group - Ciel Deep Dive V1", show_tabs=False)
        pub = server.workbooks.publish(item, str(twbx), mode=tsc.Server.PublishMode.Overwrite, skip_connection_check=True)
        print(f"PUBLISHED: {pub.name}  id={pub.id}")
        return pub.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
