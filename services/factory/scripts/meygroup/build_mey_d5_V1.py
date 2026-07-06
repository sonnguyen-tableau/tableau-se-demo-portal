"""D5 Kênh Đại Lý — VERSION 1 (target-tick upgrade).

D5's Agencies data is a cross-sectional SNAPSHOT (8 sàn, no time dimension), so
per the user's decision we apply the D3-style best practice — target ticks +
existing Sequential-Blue emphasis — NOT a fabricated sparkline.

Adds a GOLD constant reference-line at the 7% group-average conversion target on
"Tỷ lệ chuyển đổi theo Sàn" (group = 728 deals / 10,728 leads ≈ 6.8% → 7%). Shows
instantly which sàn beat the benchmark (CEN 10.2%, Âu Lạc/Euro 8.4%) vs lag
(BTB 3.7%, FTN 4.4%). Surgical patch; publish as "Mey Group - Kenh Dai Ly V1".

Run:  uv run python scripts/meygroup/build_mey_d5_V1.py [--publish]
"""
import re
import sys
from pathlib import Path

LIVE_TWB = Path("/tmp/d5/d5.twb")
OUT_TWB = Path("/tmp/wb-mey-d5-V1.twb")
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
GOLD = "#c29b54"
CONV_TARGET = 0.07
CONV_CALC = "Calculation_0090050000000106"   # SUM(DealCount)/SUM(LeadsReferred)


def refline_and_style(axis_ref: str) -> tuple[str, str]:
    rl = (f"            <reference-line axis-column='{axis_ref}' enable-instant-analytics='true' "
          f"formula='constant' id='kpiline' label='Mục tiêu {int(CONV_TARGET*100)}%' label-type='custom' "
          f"scope='per-pane' tooltip-type='none' value='{CONV_TARGET}' value-column='{axis_ref}' z-order='1' />")
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
    axis_ref = f"[{DS}].[usr:{CONV_CALC}:qk]"
    rl, style = refline_and_style(axis_ref)
    ws_pat = re.compile(r"(<worksheet name='ConversionSan'>.*?</worksheet>)", re.S)
    m = ws_pat.search(xml)
    assert m, "ConversionSan not found"
    ws = m.group(1)
    assert "<reference-line" not in ws, "ConversionSan already has a reference-line"
    ws2 = ws.replace("        </style>\n        <panes>", style + "\n        </style>\n        <panes>", 1)
    assert ws2 != ws, "could not inject refline style"
    ws3 = ws2.replace("            </encodings>\n", "            </encodings>\n" + rl + "\n", 1)
    assert ws3 != ws2, "could not inject reference-line"
    return xml.replace(ws, ws3, 1)


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml); return "OK"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"


def build():
    assert LIVE_TWB.exists(), f"missing {LIVE_TWB}"
    xml = LIVE_TWB.read_text(encoding="utf-8")
    xml2 = patch(xml)
    assert xml2.count("<![CDATA[") == xml2.count("]]>"), "CDATA imbalance"
    OUT_TWB.write_text(xml2, encoding="utf-8")
    print(f"D5 V1: {len(xml2):,} bytes  XML {validate(xml2)}  target {int(CONV_TARGET*100)}% on ConversionSan")
    return xml2


def publish():
    import tableauserverclient as tsc, zipfile
    env = {}
    for line in Path("/Users/son.nguyen/tableau-ai-portal/services/factory/.env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip()
    twbx = Path("/tmp/wb-mey-d5-V1.twbx")
    with zipfile.ZipFile(twbx, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(OUT_TWB, arcname="Mey Group - Kenh Dai Ly V1.twb")
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        item = tsc.WorkbookItem(project_id="fab7f92a-6f33-4572-9e6f-7769017f58cf", name="Mey Group - Kenh Dai Ly V1", show_tabs=False)
        pub = server.workbooks.publish(item, str(twbx), mode=tsc.Server.PublishMode.Overwrite, skip_connection_check=True)
        print(f"PUBLISHED: {pub.name}  id={pub.id}")
        return pub.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
