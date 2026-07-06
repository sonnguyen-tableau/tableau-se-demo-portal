"""D3 Dự Án & Gói Thầu — VERSION 1 (target-tick upgrade).

D3's Packages data is a SNAPSHOT (no time dimension) → a monthly sparkline would
be fabricated, so per the user's decision we do NOT add sparklines here. Instead
we add the "vs target" story that D1/D2 have, honestly:
  - a GOLD constant reference-line at the 85% progress target on the two
    "Tiến độ TB" charts (theo Dự án + theo Loại gói thầu) — instantly shows which
    projects/package-types are behind the on-track bar.
  - keeps the existing Mey Sequential Blue gradient emphasis (darkest = highest).

Surgical patch of the LIVE workbook (never rebuild). Publish as
"Mey Group - Du An Goi Thau V1".

Run:  uv run python scripts/meygroup/build_mey_d3_V1.py [--publish]
"""
import re
import sys
from pathlib import Path

LIVE_TWB = Path("/tmp/d3/d3.twb")
OUT_TWB = Path("/tmp/wb-mey-d3-V1.twb")
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
GOLD = "#c29b54"
TARGET = 0.85            # progress target (85% on-track)
PROGRESS_CALC = "Calculation_0090030000000104"   # AVG(ProgressPct), p0%

# The two progress charts get the target tick (both plot AVG(ProgressPct) on cols).
PROGRESS_CHARTS = ["TienDoDuAn", "TienDoLoaiGoi"]


def refline_and_style(axis_ref: str) -> tuple[str, str]:
    """A vertical CONSTANT gold reference-line at TARGET on the progress axis,
    with a labelled 'Mục tiêu 85%' + the refline style-rule."""
    rl = (f"            <reference-line axis-column='{axis_ref}' enable-instant-analytics='true' "
          f"formula='constant' id='kpiline' label='Mục tiêu {int(TARGET*100)}%' label-type='custom' "
          f"scope='per-pane' tooltip-type='none' value='{TARGET}' value-column='{axis_ref}' z-order='1' />")
    style = (
        "          <style-rule element='refline'>\n"
        f"            <format attr='stroke-color' id='kpiline' value='{GOLD}' />\n"
        "            <format attr='stroke-size' id='kpiline' value='2.5' />\n"
        "            <format attr='line-visibility' id='kpiline' value='on' />\n"
        "            <format attr='line-pattern-only' id='kpiline' value='dashed' />\n"
        "            <format attr='fill-above' id='kpiline' value='#00000000' />\n"
        "            <format attr='fill-below' id='kpiline' value='#00000000' />\n"
        "          </style-rule>")
    return rl, style


def patch(xml: str) -> str:
    axis_ref = f"[{DS}].[usr:{PROGRESS_CALC}:qk]"
    rl, style = refline_and_style(axis_ref)
    for name in PROGRESS_CHARTS:
        ws_pat = re.compile(r"(<worksheet name='%s'>.*?</worksheet>)" % re.escape(name), re.S)
        m = ws_pat.search(xml)
        assert m, f"worksheet {name} not found"
        ws = m.group(1)
        assert "<reference-line" not in ws, f"{name} already has a reference-line"
        # 1) add the refline style-rule inside the worksheet <style> (after axis rule)
        ws2 = ws.replace(
            "        </style>\n        <panes>",
            style + "\n        </style>\n        <panes>", 1)
        assert ws2 != ws, f"{name}: could not inject refline style"
        # 2) add the reference-line inside the pane, right after </encodings>
        ws3 = ws2.replace("            </encodings>\n",
                          "            </encodings>\n" + rl + "\n", 1)
        assert ws3 != ws2, f"{name}: could not inject reference-line"
        xml = xml.replace(ws, ws3, 1)
    return xml


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml)
        return "OK"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"


def build():
    assert LIVE_TWB.exists(), f"missing {LIVE_TWB}"
    xml = LIVE_TWB.read_text(encoding="utf-8")
    xml2 = patch(xml)
    assert xml2.count("<![CDATA[") == xml2.count("]]>"), "CDATA imbalance"
    OUT_TWB.write_text(xml2, encoding="utf-8")
    print(f"D3 V1: {len(xml2):,} bytes  XML {validate(xml2)}")
    print(f"  target ticks on: {PROGRESS_CHARTS} @ {int(TARGET*100)}%")
    return xml2


def publish():
    import tableauserverclient as tsc, zipfile
    env = {}
    for line in Path("/Users/son.nguyen/tableau-ai-portal/services/factory/.env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    twbx = Path("/tmp/wb-mey-d3-V1.twbx")
    with zipfile.ZipFile(twbx, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(OUT_TWB, arcname="Mey Group - Du An Goi Thau V1.twb")
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        proj_id = "fab7f92a-6f33-4572-9e6f-7769017f58cf"
        item = tsc.WorkbookItem(project_id=proj_id, name="Mey Group - Du An Goi Thau V1", show_tabs=False)
        pub = server.workbooks.publish(item, str(twbx), mode=tsc.Server.PublishMode.Overwrite, skip_connection_check=True)
        print(f"PUBLISHED: {pub.name}  id={pub.id}")
        return pub.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
