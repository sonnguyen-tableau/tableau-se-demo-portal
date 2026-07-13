"""Prove the metadata-records fix: build a .tdsx WITH metadata-records, publish
to a throwaway project, wait for Catalog indexing, then try a Pulse create.

Run:
  uv run python scripts/mediamart/pulse_meta_test.py
"""
from __future__ import annotations

import sys
import time
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import scripts.mediamart.pulse_create as pc
from scripts.mediamart.provision_mediamart import build, TABLES, HYPER
from scripts.mediamart.tds_metadata import build_metadata_records, build_column_defs

DS_NAME = "mediamart-meta-probe"
OUT_DIR = Path("/tmp/mediamart")
TDSX = OUT_DIR / "mediamart-meta-probe.tdsx"
PROBE_PROJECT = "_PROBE"  # existing throwaway project


def build_tds_with_metadata(tables, hyper_filename: str) -> bytes:
    """Federated-extract .tds identical to provision_mediamart's, PLUS a
    <metadata-records> block and top-level <column> defs."""
    ds = Element("datasource", attrib={"formatted-name": DS_NAME, "inline": "true", "version": "18.1"})
    conn = SubElement(ds, "connection", attrib={"class": "federated"})
    named = SubElement(conn, "named-connections")
    nc = SubElement(named, "named-connection", attrib={"caption": DS_NAME, "name": "hyperconn"})
    SubElement(nc, "connection", attrib={
        "class": "hyper", "authentication": "auth-none",
        "dbname": f"Data/Datasources/{hyper_filename}",
        "schema": "Extract", "server": "", "default-settings": "yes",
    })
    for t in TABLES:
        SubElement(conn, "relation", attrib={
            "connection": "hyperconn", "name": t,
            "table": f"[Extract].[{t}]", "type": "table",
        })
    # Serialize the element, then splice in the raw metadata-records + columns XML
    # (ElementTree can't easily hold the pre-built string, so string-splice).
    conn_xml = tostring(ds, encoding="unicode")
    meta = build_metadata_records(tables)
    cols = build_column_defs(tables)
    # insert metadata-records just before </connection>, columns just after
    conn_xml = conn_xml.replace("</connection>", meta + "\n</connection>\n" + cols)
    return b'<?xml version="1.0" encoding="utf-8" ?>\n' + conn_xml.encode("utf-8")


def main() -> None:
    env = pc._env()
    tables = build()  # writes /tmp/mediamart/mediamart.hyper
    tds = build_tds_with_metadata(tables, HYPER.name)
    Path("/tmp/mediamart/meta-probe.tds").write_bytes(tds)
    with zipfile.ZipFile(TDSX, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{DS_NAME}.tds", tds)
        zf.write(HYPER, arcname=f"Data/Datasources/{HYPER.name}")
    print(f"tdsx -> {TDSX} ({TDSX.stat().st_size:,} bytes)")
    print(f"metadata-records: {tds.count(b'<metadata-record ')} columns")

    import tableauserverclient as tsc
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        # find or create _PROBE project
        all_projects, _ = server.projects.get()
        proj = next((p for p in all_projects if p.name == PROBE_PROJECT and not getattr(p, "parent_id", None)), None)
        if not proj:
            proj = server.projects.create(tsc.ProjectItem(name=PROBE_PROJECT))
        item = tsc.DatasourceItem(project_id=proj.id, name=DS_NAME)
        published = server.datasources.publish(item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite)
        ds_luid = published.id
        print(f"PUBLISHED {DS_NAME} luid={ds_luid} project={published.project_name}")

    # Check Catalog indexing (poll — indexing is async)
    import httpx
    token, site_luid, origin = pc.sign_in(env)
    H = {"X-Tableau-Auth": token, "Content-Type": "application/json", "Accept": "application/json"}
    gql = f"{origin}/api/metadata/graphql"
    q = '{publishedDatasources(filter:{luid:"%s"}){name fields{name}}}' % ds_luid
    indexed = 0
    with httpx.Client(timeout=60.0) as http:
        for attempt in range(8):
            r = http.post(gql, headers=H, json={"query": q})
            dss = r.json().get("data", {}).get("publishedDatasources", [])
            indexed = len(dss[0].get("fields", [])) if dss else 0
            print(f"  [poll {attempt}] Catalog indexed fields = {indexed}")
            if indexed > 0:
                break
            time.sleep(15)

        if indexed == 0:
            print("\n❌ Catalog still 0 fields after polling — metadata-records not sufficient.")
            return
        print(f"\n✅ Catalog indexed {indexed} fields — trying Pulse create…")

        base = f"{origin}/api/-/pulse"
        ALL = [{"type": t, "disabled": False} for t in [
            "INSIGHT_TYPE_UNUSUAL_CHANGE", "INSIGHT_TYPE_TOP_DRIVERS", "INSIGHT_TYPE_CURRENT_TREND",
            "INSIGHT_TYPE_METRIC_FORECAST", "INSIGHT_TYPE_BOTTOM_CONTRIBUTORS",
            "INSIGHT_TYPE_TOP_DETRACTORS", "INSIGHT_TYPE_NEW_TREND"]]
        payload = {
            "name": "PROBE Doanh thu",
            "specification": {"basic_specification": {"measure": {"field": "LineTotal", "aggregation": "AGGREGATION_SUM"},
                "time_dimension": {"field": "OrderDate"}, "filters": []}, "is_running_total": False,
                "datasource": {"id": ds_luid}},
            "extension_options": {"allowed_dimensions": ["Category", "Region", "Channel", "Tier"],
                "allowed_granularities": ["GRANULARITY_BY_DAY", "GRANULARITY_BY_WEEK", "GRANULARITY_BY_MONTH", "GRANULARITY_BY_QUARTER", "GRANULARITY_BY_YEAR"],
                "offset_from_today": 0, "correlation_candidate_definition_ids": [], "use_dynamic_offset": False},
            "representation_options": {"type": "NUMBER_FORMAT_TYPE_CURRENCY", "number_units": {"singular_noun": "", "plural_noun": ""},
                "sentiment_type": "SENTIMENT_TYPE_UP_IS_GOOD", "row_level_id_field": {"identifier_col": "OrderId", "identifier_label": ""},
                "row_level_entity_names": {"entity_name_singular": "", "entity_name_plural": ""}, "row_level_name_field": {"name_col": ""},
                "currency_code": "CURRENCY_CODE_UNSPECIFIED", "positive_only": False},
            "insights_options": {"show_insights": True, "settings": ALL},
            "comparisons": {"comparisons": [{"compare_config": {"comparison": "TIME_COMPARISON_PREVIOUS_PERIOD", "comparison_period_override": []}, "index": 0}]},
            "datasource_goals": [], "related_links": [], "certification": {"is_certified": False},
        }
        r = http.post(f"{base}/definitions", headers=H, json=payload)
        print(f"[Pulse create on probe ds] {r.status_code} vcode={r.headers.get('validation_code')}: {r.text[:160]}")
        if r.status_code in (200, 201):
            did = r.json().get("definition", {}).get("metadata", {}).get("id") or r.json().get("metadata", {}).get("id")
            print(f"  🎉 CREATED def_id={did}")
            gm = http.post(f"{base}/metrics:getOrCreate", headers=H, json={"definition_id": did, "specification": {"filters": []}})
            mb = gm.json() if gm.status_code in (200, 201) else {}
            print(f"  [getOrCreate] {gm.status_code} metric_id={mb.get('metric', {}).get('id') or mb.get('id')}")
            http.delete(f"{base}/definitions/{did}", headers=H)
            print("  cleaned up probe definition")


if __name__ == "__main__":
    main()
