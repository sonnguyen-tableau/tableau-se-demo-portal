"""ACB Market Intelligence provisioning — generate -> .hyper -> .tdsx -> publish.

Standalone (bypasses the enum-driven FastAPI pipeline since `market-intelligence`
isn't in the Industry enum) — the vnpt / vacs / shb standalone pattern. Emits a
FLAT 6-table .tds (all tables as sibling relations) for the published
`Demo/ACB` datasource that serves the MCP AI agent. The portal DASHBOARDS use a
self-contained extract-workbook (acb_lib, authored later) so no Desktop
relationship-drawing is required for them to render.

Before building the mock datasource, this OPTIONALLY overlays live VN-Index data
(collect_market.py, VNDIRECT/TCBS public JSON) onto market_daily so the demo
ships real market history when the network allows, and the calibrated mock
otherwise. Macro stays calibrated-mock by policy (see collect_macro.py).

Run:
  uv run python scripts/acb/provision_acb.py             # build .hyper + .tdsx
  uv run python scripts/acb/provision_acb.py --live      # + overlay live VN-Index
  uv run python scripts/acb/provision_acb.py --publish   # + publish datasource
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.generators.acb import AcbParameters, generate_acb  # noqa: E402
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "acb"
OUT_DIR = Path("/tmp/acb")
HYPER = OUT_DIR / "acb.hyper"
TDSX = OUT_DIR / "acb.tdsx"
PROJECT = "Demo/ACB"

# The 6 customer-requested tables (order = dashboard reading order).
TABLES = ("market_metrics_monthly", "market_daily", "theme_summary",
          "advisor_brief", "metric_dictionary", "market_events")


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


def _overlay_live(tables: dict) -> dict:
    """Replace synthetic market_daily rows with live VN-Index where available.

    Keeps the synthetic turnover / foreign-flow / buy-sell columns (those stay
    mock by policy) but swaps in the real VnIndex + derived returns and flips
    MockData=0 for the affected columns' provenance. Best-effort; on any failure
    the original synthetic table is returned unchanged.
    """
    try:
        from collect_market import collect_vnindex
        live, provider = collect_vnindex(tenant_id="acb")
        if live is None:
            print("  live overlay: unavailable, keeping calibrated mock")
            return tables

        syn = tables["market_daily"].copy()
        # Join on Date: take real VnIndex + returns, keep synthetic liquidity cols.
        live_idx = live.set_index(live["Date"].dt.normalize())
        syn_dates = syn["Date"].dt.normalize()
        for col in ("VnIndex", "ChangePct", "ReturnMtdPct", "ReturnYtdPct"):
            mapped = syn_dates.map(live_idx[col])
            mask = mapped.notna()
            syn.loc[mask, col] = mapped[mask].values
        real_mask = syn_dates.isin(live_idx.index)
        syn.loc[real_mask, "Source"] = live["Source"].iloc[0]
        syn.loc[real_mask, "SourceUrl"] = live["SourceUrl"].iloc[0]
        syn.loc[real_mask, "MockData"] = 0
        tables["market_daily"] = syn
        print(f"  live overlay via {provider}: {int(real_mask.sum())} trading days now real (MockData=0)")
    except Exception as e:
        print(f"  live overlay failed ({type(e).__name__}: {e}); keeping calibrated mock")
    return tables


def build(live: bool = False):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ds = generate_acb(AcbParameters(tenant_id="acb"))
    tables = ds.all_tables()
    if live:
        tables = _overlay_live(tables)
    for name, df in tables.items():
        real = int((df["MockData"] == 0).sum()) if "MockData" in df.columns else 0
        print(f"  {name:24s} {len(df):>7,} rows  ({real} real)")
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
        for part in ("Demo", "ACB"):
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
    build(live="--live" in sys.argv)
    if "--publish" in sys.argv:
        publish()
