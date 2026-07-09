"""SHB provisioning — data -> .hyper -> .tdsx -> publish Cloud datasource.

Standalone (bypasses the enum pipeline; sme-corporate-banking is not in the
Industry enum) — same pattern as scripts/vacs/provision_vacs.py. Flat 2-table
.tds; the published `vacs`-style datasource feeds the MCP AI agent (campaign
advisory). Dashboard uses an embedded-extract .twbx (shb_lib).

Run:
  uv run python scripts/shb/provision_shb.py            # build .hyper + .tdsx
  uv run python scripts/shb/provision_shb.py --publish  # + publish datasource
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.generators.shb import generate_shb, ShbParameters  # noqa: E402
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "shb"
OUT_DIR = Path("/tmp/shb")
HYPER = OUT_DIR / "shb.hyper"
TDSX = OUT_DIR / "shb.tdsx"
PROJECT = "Demo/SHB"
TABLES = ("IndustrySummary", "SmeClients")


def build_tds_xml(hyper_filename: str) -> bytes:
    ds = Element("datasource", attrib={"formatted-name": DS_NAME, "inline": "true", "version": "18.1"})
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
            "connection": "hyperconn", "name": t, "table": f"[Extract].[{t}]", "type": "table"})
    return b'<?xml version="1.0" encoding="utf-8" ?>\n' + tostring(ds, encoding="utf-8")


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ds = generate_shb(ShbParameters(tenant_id="shb"))
    tables = ds.all_tables()
    for name, df in tables.items():
        print(f"  {name:16s} {len(df):>7,} rows")
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
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        all_projects, _ = server.projects.get()
        parent_id = None
        for part in ("Demo", "SHB"):
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
        print(f"project Demo/SHB id={parent_id}")
        item = tsc.DatasourceItem(project_id=parent_id, name=DS_NAME)
        published = server.datasources.publish(item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite)
        print(f"PUBLISHED datasource: {published.name}  id={published.id}  project={published.project_name}")
        return published.id


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
