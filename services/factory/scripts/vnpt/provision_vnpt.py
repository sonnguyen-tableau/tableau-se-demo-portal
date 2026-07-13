"""VNPT provisioning — generate data -> .hyper -> .tdsx -> publish Cloud datasource.

Standalone (bypasses the enum-driven FastAPI pipeline since `telecom` isn't in
the Industry enum) — the meygroup / nam-a-bank / vacs / shb standalone pattern.
Emits a FLAT 6-table .tds (all tables as sibling relations) for the published
`Demo/VNPT` datasource that serves the MCP AI agent; the portal DASHBOARDS use
self-contained extract-workbooks (vnpt_lib) so no Desktop relationship-drawing
is required for them to render.

Run:
  uv run python scripts/vnpt/provision_vnpt.py            # build .hyper + .tdsx only
  uv run python scripts/vnpt/provision_vnpt.py --publish  # + publish datasource to Cloud
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))

from app.generators.vnpt import generate_vnpt, VnptParameters  # noqa: E402
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "vnpt"
OUT_DIR = Path("/tmp/vnpt")
HYPER = OUT_DIR / "vnpt.hyper"
TDSX = OUT_DIR / "vnpt.tdsx"
PROJECT = "Demo/VNPT"

# 6 pre-aggregated tables — every dashboard sheet is single-table, so no
# cross-table relationship is needed at render time.
TABLES = ("Services", "Provinces", "MonthlyTotals", "MonthlyService",
          "ProvinceSummary", "ChurnReasons")


def build_tds_xml(hyper_filename: str) -> bytes:
    """Flat sibling-<relation> emitter (legacy 'Migrated Data' view). Publishes
    fine; user can draw real relationships on Desktop afterward for the agent."""
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
    ds = generate_vnpt(VnptParameters(tenant_id="vnpt"))
    tables = ds.all_tables()
    for name, df in tables.items():
        print(f"  {name:16s} {len(df):>8,} rows")
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
        # ensure Demo/VNPT project path exists
        all_projects, _ = server.projects.get()
        parent_id = None
        for part in ("Demo", "VNPT"):
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
        print(f"project Demo/VNPT id={parent_id}")

        item = tsc.DatasourceItem(project_id=parent_id, name=DS_NAME)
        published = server.datasources.publish(item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite)
        print(f"PUBLISHED datasource: {published.name}  id={published.id}  project={published.project_name}")
        return published.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
