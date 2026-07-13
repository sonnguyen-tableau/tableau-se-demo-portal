"""Singapore Airlines provisioning — generate -> .hyper -> .tdsx -> publish.

Standalone (bypasses the enum-driven FastAPI pipeline since `airline-passenger`
isn't in the Industry enum) — the vnpt / acb standalone pattern. Emits a FLAT
6-table .tds (all tables as sibling relations) for the published
`Demo/Singapore Airlines` datasource that serves the MCP AI agent; the portal
DASHBOARDS use a self-contained extract-workbook (sia_lib) so no Desktop
relationship-drawing is required for them to render.

Run:
  uv run python scripts/singaporeair/provision_sia.py             # build only
  uv run python scripts/singaporeair/provision_sia.py --publish   # + publish
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))

from app.generators.singaporeair import SingaporeAirParameters, generate_singaporeair  # noqa: E402
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "singaporeair"
OUT_DIR = Path("/tmp/singaporeair")
HYPER = OUT_DIR / "singaporeair.hyper"
TDSX = OUT_DIR / "singaporeair.tdsx"
PROJECT = "Demo/Singapore Airlines"

TABLES = ("monthly_performance", "region_performance", "destinations",
          "cabin_class", "loyalty_krisflyer", "metric_dictionary")


def build_tds_xml(hyper_filename: str) -> bytes:
    ds = Element("datasource", attrib={
        "formatted-name": DS_NAME, "inline": "true", "version": "18.1",
    })
    conn = SubElement(ds, "connection", attrib={"class": "federated"})
    named = SubElement(conn, "named-connections")
    nc = SubElement(named, "named-connection", attrib={"caption": DS_NAME, "name": "hyperconn"})
    SubElement(nc, "connection", attrib={
        "class": "hyper", "authentication": "auth-none",
        "dbname": f"Data/Datasources/{hyper_filename}", "schema": "Extract",
        "server": "", "default-settings": "yes",
    })
    for t in TABLES:
        SubElement(conn, "relation", attrib={
            "connection": "hyperconn", "name": t,
            "table": f"[Extract].[{t}]", "type": "table",
        })
    return b'<?xml version="1.0" encoding="utf-8" ?>\n' + tostring(ds, encoding="utf-8")


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ds = generate_singaporeair(SingaporeAirParameters(tenant_id="singapore-airlines"))
    tables = ds.all_tables()
    for name, df in tables.items():
        print(f"  {name:22s} {len(df):>6,} rows")
    write_hyper(tables, HYPER)
    print(f"hyper -> {HYPER}  ({HYPER.stat().st_size:,} bytes)")
    tds = build_tds_xml(HYPER.name)
    with zipfile.ZipFile(TDSX, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{DS_NAME}.tds", tds)
        zf.write(HYPER, arcname=f"Data/Datasources/{HYPER.name}")
    print(f"tdsx  -> {TDSX}  ({TDSX.stat().st_size:,} bytes)")
    return ds


def _env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def publish():
    import tableauserverclient as tsc
    env = _env()
    auth = tsc.PersonalAccessTokenAuth(
        env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        all_projects, _ = server.projects.get()
        parent_id = None
        for part in ("Demo", "Singapore Airlines"):
            found = next((p for p in all_projects
                          if p.name == part and (getattr(p, "parent_id", None) == parent_id)), None)
            if found:
                parent_id = found.id
            else:
                proj = tsc.ProjectItem(name=part)
                if parent_id:
                    proj.parent_id = parent_id
                created = server.projects.create(proj)
                all_projects, _ = server.projects.get()
                parent_id = created.id
        print(f"project {PROJECT} id={parent_id}")
        item = tsc.DatasourceItem(project_id=parent_id, name=DS_NAME)
        published = server.datasources.publish(item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite)
        print(f"PUBLISHED datasource: {published.name}  id={published.id}  project={published.project_name}")
        return published.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
