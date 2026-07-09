"""Probe: does a self-contained .twbx (embedded .hyper extract) render on Cloud?

If YES → we author all VACS dashboards as extract-workbooks (no fragile
sqlproxy seed block needed; every VACS dashboard is single-table by design).
If NO  → fall back to synthesizing the sqlproxy seed block from schema.

Builds a 2-sheet workbook (a BAN + a bar) on the MonthlySummary table using a
federated hyper connection, packages the vacs.hyper inside, publishes to
Demo/VACS, renders the sheet to PNG.

Run: uv run python scripts/vacs/probe_extract.py --publish
"""
from __future__ import annotations

import sys
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HYPER = Path("/tmp/vacs/vacs.hyper")
OUT_TWBX = Path("/tmp/vacs/probe.twbx")
CONN = "hyperconn"


def U() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


# Federated → hyper named-connection (relative dbname inside the .twbx). NO
# server='localhost' (that's what fails); a packaged extract uses server=''.
def datasource_block() -> str:
    return f"""  <datasource caption='vacs' inline='true' name='federated.vacs01' version='18.1'>
    <connection class='federated'>
      <named-connections>
        <named-connection caption='vacs' name='{CONN}'>
          <connection class='hyper' authentication='auth-none' dbname='Data/Datasources/vacs.hyper' schema='Extract' server='' default-settings='yes' />
        </named-connection>
      </named-connections>
      <relation connection='{CONN}' name='MonthlySummary' table='[Extract].[MonthlySummary]' type='table' />
      <cols>
        <map key='[Complaints]' value='[MonthlySummary].[Complaints]' />
        <map key='[Meals]' value='[MonthlySummary].[Meals]' />
        <map key='[AirlineName]' value='[MonthlySummary].[AirlineName]' />
        <map key='[Year]' value='[MonthlySummary].[Year]' />
      </cols>
    </connection>
    <column datatype='string' name='[AirlineName]' role='dimension' type='nominal' />
    <column datatype='integer' name='[Complaints]' role='measure' type='quantitative' />
    <column datatype='integer' name='[Meals]' role='measure' type='quantitative' />
    <column datatype='integer' name='[Year]' role='dimension' type='ordinal' />
  </datasource>"""


def ban_sheet() -> str:
    ds = "federated.vacs01"
    return f"""    <worksheet name='ProbeBAN'>
      <table>
        <view>
          <datasources>
            <datasource caption='vacs' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
            <column datatype='integer' name='[Complaints]' role='measure' type='quantitative' />
            <column-instance column='[Complaints]' derivation='Sum' name='[sum:Complaints:qk]' pivot='key' type='quantitative' />
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings><text column='[{ds}].[sum:Complaints:qk]' /></encodings>
          </pane>
        </panes>
        <rows /><cols />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


def bar_sheet() -> str:
    ds = "federated.vacs01"
    return f"""    <worksheet name='ProbeBar'>
      <table>
        <view>
          <datasources>
            <datasource caption='vacs' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
            <column datatype='string' name='[AirlineName]' role='dimension' type='nominal' />
            <column datatype='integer' name='[Complaints]' role='measure' type='quantitative' />
            <column-instance column='[AirlineName]' derivation='None' name='[none:AirlineName:nk]' pivot='key' type='nominal' />
            <column-instance column='[Complaints]' derivation='Sum' name='[sum:Complaints:qk]' pivot='key' type='quantitative' />
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Bar' />
          </pane>
        </panes>
        <rows>[{ds}].[none:AirlineName:nk]</rows>
        <cols>[{ds}].[sum:Complaints:qk]</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


def build() -> Path:
    twb = f"""<?xml version='1.0' encoding='utf-8' ?>
<workbook original-version='18.1' source-build='2026.1.1 (20261.26.0410.0924)' version='18.1' xmlns:user='http://www.tableausoftware.com/xml/user'>
  <datasources>
{datasource_block()}
  </datasources>
  <worksheets>
{ban_sheet()}
{bar_sheet()}
  </worksheets>
  <windows>
    <window class='worksheet' name='ProbeBAN' />
    <window class='worksheet' name='ProbeBar' />
  </windows>
</workbook>
"""
    import xml.etree.ElementTree as ET
    ET.fromstring(twb)  # validate
    with zipfile.ZipFile(OUT_TWBX, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("probe.twb", twb)
        z.write(HYPER, arcname="Data/Datasources/vacs.hyper")
    print(f"probe.twbx built ({OUT_TWBX.stat().st_size:,} bytes)")
    return OUT_TWBX


def _env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def publish_and_render():
    import tableauserverclient as tsc
    env = _env()
    auth = tsc.PersonalAccessTokenAuth(
        env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        proj_id = "96c71641-895b-466b-a972-2b2b34a7861f"  # Demo/VACS
        item = tsc.WorkbookItem(project_id=proj_id, name="VACS Probe", show_tabs=True)
        pub = server.workbooks.publish(item, str(OUT_TWBX), mode=tsc.Server.PublishMode.Overwrite,
                                       skip_connection_check=True)
        print(f"PUBLISHED: {pub.name} id={pub.id}")
        server.workbooks.populate_views(pub)
        for v in pub.views:
            server.views.populate_image(v, tsc.ImageRequestOptions(maxage=1))
            out = Path(f"/tmp/vacs/probe_{v.name}.png")
            out.write_bytes(v.image)
            print(f"  rendered {v.name} -> {out} ({len(v.image):,} bytes)")


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish_and_render()
