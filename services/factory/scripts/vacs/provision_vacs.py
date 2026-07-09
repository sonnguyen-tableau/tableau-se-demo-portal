"""VACS provisioning — generate data -> .hyper -> .tdsx -> publish Cloud datasource.

Standalone (bypasses the enum-driven FastAPI pipeline since `airline-catering`
isn't in the Industry enum) — same standalone pattern the meygroup/nam-a-bank
builds used. Emits a FLAT 6-table .tds (all tables as sibling relations); the
user then opens the .tdsx in Tableau Desktop, draws the relationships on the
canvas (Airlines/Routes hub → the 3 feedback facts + MealVolume) and republishes
— Cloud strict-mode only accepts Desktop-authored multi-table relationships.

Run:
  uv run python scripts/vacs/provision_vacs.py            # build .hyper + .tdsx only
  uv run python scripts/vacs/provision_vacs.py --publish  # + publish datasource to Cloud
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))

from app.generators.vacs import generate_vacs, VacsParameters  # noqa: E402
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "vacs"
OUT_DIR = Path("/tmp/vacs")
HYPER = OUT_DIR / "vacs.hyper"
TDSX = OUT_DIR / "vacs.tdsx"
PROJECT = "Demo/VACS"

# 7 tables — Complaints is the primary complaint-summary fact; MonthlySummary
# is a pre-aggregated month×airline fact so the index/COF dashboards stay
# single-table (no cross-table relationship needed at render time).
TABLES = ("Airlines", "Routes", "Complaints", "Compliments", "SLARecords",
          "MealVolume", "MonthlySummary")


def build_tds_xml(hyper_filename: str) -> bytes:
    """Flat sibling-<relation> emitter (legacy 'Migrated Data' view). Publishes
    fine; user draws real relationships on Desktop afterward."""
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
    ds = generate_vacs(VacsParameters(tenant_id="vacs"))
    tables = ds.all_tables()
    for name, df in tables.items():
        print(f"  {name:14s} {len(df):>8,} rows")
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
        # ensure Demo/VACS project path exists
        all_projects, _ = server.projects.get()
        parent_id = None
        for part in ("Demo", "VACS"):
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
        print(f"project Demo/VACS id={parent_id}")

        item = tsc.DatasourceItem(project_id=parent_id, name=DS_NAME)
        published = server.datasources.publish(item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite)
        print(f"PUBLISHED datasource: {published.name}  id={published.id}  project={published.project_name}")
        return published.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
