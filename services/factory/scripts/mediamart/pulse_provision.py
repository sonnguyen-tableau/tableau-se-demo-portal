"""MediaMart Pulse provisioning — the WORKING end-to-end path.

Publishes a dedicated SINGLE-TABLE (SalesFact) extract datasource WITH
metadata-records so the Tableau Metadata Catalog indexes its fields, which
makes Tableau Pulse able to resolve them. Then creates the MediaMart Pulse
metric definitions + default metrics via the raw REST API.

WHY single-table + metadata-records (see tds_metadata.py header + memory
tableau-pulse-metadata-catalog):
  - Our self-contained federated-extract .tds carries no metadata-records →
    Catalog indexes 0 fields → Pulse 404 (vcode 404904) on every field.
  - A 3-table extract WITH metadata-records indexes fine (48 fields) but Pulse
    still fails (vcode 400913) because the invented object-id doesn't match the
    multi-relation object model.
  - A SINGLE-table extract WITH metadata-records is structurally like Superstore
    → Catalog indexes 32 fields → Pulse create + getOrCreate both 201. ✅
  - All 4 metrics use SalesFact fields only, so a dedicated SalesFact Pulse ds
    leaves the live 3-table `mediamart` ds (D2–D5 dashboards) untouched.

Run:
  uv run python scripts/mediamart/pulse_provision.py --publish   # build+publish ds only
  uv run python scripts/mediamart/pulse_provision.py --create    # +create metrics (needs published ds)
  uv run python scripts/mediamart/pulse_provision.py --publish --create
"""
from __future__ import annotations

import json
import sys
import time
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import scripts.mediamart.pulse_create as pc  # METRICS catalog + sign_in + _env
from scripts.mediamart.provision_mediamart import build, HYPER
from scripts.mediamart.tds_metadata import build_metadata_records, build_column_defs

DS_NAME = "mediamart-pulse"
PROJECT = "Demo/MediaMart"
TDSX = Path("/tmp/mediamart/mediamart-pulse.tdsx")

# All Pulse insight types (from the live Superstore sample definition).
ALL_INSIGHTS = [
    "INSIGHT_TYPE_UNUSUAL_CHANGE", "INSIGHT_TYPE_PACE_TO_GOAL", "INSIGHT_TYPE_TOP_DRIVERS",
    "INSIGHT_TYPE_METRIC_FORECAST", "INSIGHT_TYPE_BENCHMARK_BREAKDOWN", "INSIGHT_TYPE_CURRENT_TREND",
    "INSIGHT_TYPE_TOP_DETRACTORS", "INSIGHT_TYPE_RECORD_LEVEL_OUTLIERS", "INSIGHT_TYPE_CORRELATED_METRIC",
    "INSIGHT_TYPE_BOTTOM_CONTRIBUTORS", "INSIGHT_TYPE_NEW_TREND", "INSIGHT_TYPE_RISKY_MONOPOLY",
]
GRANULARITIES = ["GRANULARITY_BY_DAY", "GRANULARITY_BY_WEEK", "GRANULARITY_BY_MONTH", "GRANULARITY_BY_QUARTER", "GRANULARITY_BY_YEAR"]
ALLOWED_DIMENSIONS = ["Category", "Brand", "Region", "Province", "City", "Channel", "Tier", "PaymentMethod"]


def build_single_table_tdsx() -> None:
    """Build a SalesFact-only extract .tdsx with metadata-records."""
    tables = build()  # writes /tmp/mediamart/mediamart.hyper (all 3 tables)
    sf = {"SalesFact": tables["SalesFact"]}
    ds = Element("datasource", attrib={"formatted-name": DS_NAME, "inline": "true", "version": "18.1"})
    conn = SubElement(ds, "connection", attrib={"class": "federated"})
    named = SubElement(conn, "named-connections")
    nc = SubElement(named, "named-connection", attrib={"caption": DS_NAME, "name": "hyperconn"})
    SubElement(nc, "connection", attrib={"class": "hyper", "authentication": "auth-none",
        "dbname": f"Data/Datasources/{HYPER.name}", "schema": "Extract", "server": "", "default-settings": "yes"})
    SubElement(conn, "relation", attrib={"connection": "hyperconn", "name": "SalesFact",
        "table": "[Extract].[SalesFact]", "type": "table"})
    conn_xml = tostring(ds, encoding="unicode")
    conn_xml = conn_xml.replace("</connection>", build_metadata_records(sf) + "\n</connection>\n" + build_column_defs(sf))
    tds = b'<?xml version="1.0" encoding="utf-8" ?>\n' + conn_xml.encode("utf-8")
    TDSX.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(TDSX, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{DS_NAME}.tds", tds)
        zf.write(HYPER, arcname=f"Data/Datasources/{HYPER.name}")
    print(f"tdsx -> {TDSX} ({TDSX.stat().st_size:,} bytes, {tds.count(b'<metadata-record ')} metadata-records)")


def publish_datasource(env: dict) -> str:
    import tableauserverclient as tsc
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        all_projects, _ = server.projects.get()
        parent_id = None
        for part in ("Demo", "MediaMart"):
            found = next((p for p in all_projects if p.name == part and getattr(p, "parent_id", None) == parent_id), None)
            if not found:
                raise RuntimeError(f"project part {part!r} not found")
            parent_id = found.id
        item = tsc.DatasourceItem(project_id=parent_id, name=DS_NAME)
        pub = server.datasources.publish(item, str(TDSX), mode=tsc.Server.PublishMode.Overwrite)
        print(f"PUBLISHED {pub.name} luid={pub.id} project={pub.project_name}")
        return pub.id


def wait_for_index(http, gql: str, H: dict, luid: str, want: int = 1) -> int:
    for attempt in range(10):
        r = http.post(gql, headers=H, json={"query": '{publishedDatasources(filter:{luid:"%s"}){fields{name}}}' % luid})
        dss = r.json().get("data", {}).get("publishedDatasources", [])
        n = len(dss[0].get("fields", [])) if dss else 0
        print(f"  [index poll {attempt}] {n} fields")
        if n >= want:
            return n
        time.sleep(15)
    return 0


def metric_payload(m: dict, ds_luid: str) -> dict:
    repr_opts = {
        "type": m["format"], "number_units": {"singular_noun": "", "plural_noun": ""},
        "sentiment_type": m["sentiment"],
        "row_level_id_field": {"identifier_col": "OrderId", "identifier_label": "Đơn hàng"},
        "row_level_entity_names": {"entity_name_singular": "đơn hàng", "entity_name_plural": "đơn hàng"},
        "row_level_name_field": {"name_col": ""}, "currency_code": "CURRENCY_CODE_UNSPECIFIED", "positive_only": False,
    }
    return {
        "name": m["name"],
        "specification": {
            "basic_specification": {"measure": {"field": m["field"], "aggregation": m["aggregation"]},
                "time_dimension": {"field": "OrderDate"}, "filters": []},
            "is_running_total": False, "datasource": {"id": ds_luid},
        },
        "extension_options": {"allowed_dimensions": ALLOWED_DIMENSIONS, "allowed_granularities": GRANULARITIES,
            "offset_from_today": 0, "correlation_candidate_definition_ids": [], "use_dynamic_offset": False},
        "representation_options": repr_opts,
        "insights_options": {"show_insights": True, "settings": [{"type": t, "disabled": False} for t in ALL_INSIGHTS]},
        "comparisons": {"comparisons": [
            {"compare_config": {"comparison": "TIME_COMPARISON_PREVIOUS_PERIOD", "comparison_period_override": []}, "index": 0},
            {"compare_config": {"comparison": "TIME_COMPARISON_YEAR_AGO_PERIOD", "comparison_period_override": []}, "index": 1}]},
        "datasource_goals": [], "related_links": [], "certification": {"is_certified": False},
    }


def create_metrics(env: dict, ds_luid: str) -> list[dict]:
    import httpx
    token, site_luid, origin = pc.sign_in(env)
    H = {"X-Tableau-Auth": token, "Content-Type": "application/json", "Accept": "application/json"}
    base = f"{origin}/api/-/pulse"
    gql = f"{origin}/api/metadata/graphql"
    results = []
    with httpx.Client(timeout=60.0) as http:
        n = wait_for_index(http, gql, H, ds_luid, want=1)
        if n == 0:
            print("❌ Catalog never indexed the datasource — aborting metric creation.")
            return results
        # idempotency by name
        existing = {d.get("metadata", {}).get("name"): d for d in http.get(f"{base}/definitions", headers=H).json().get("definitions", [])}
        for m in pc.METRICS:
            name = m["name"]
            if name in existing:
                def_id = existing[name]["metadata"]["id"]
                print(f"[skip] '{name}' exists def_id={def_id}")
            else:
                r = http.post(f"{base}/definitions", headers=H, json=metric_payload(m, ds_luid))
                if r.status_code not in (200, 201):
                    print(f"[FAIL] '{name}' {r.status_code} vcode={r.headers.get('validation_code')}: {r.text[:160]}")
                    continue
                def_id = r.json().get("definition", {}).get("metadata", {}).get("id") or r.json().get("metadata", {}).get("id")
                print(f"[create] '{name}' def_id={def_id}")
            gm = http.post(f"{base}/metrics:getOrCreate", headers=H, json={"definition_id": def_id, "specification": {"filters": []}})
            metric_id = None
            if gm.status_code in (200, 201):
                mb = gm.json(); metric_id = mb.get("metric", {}).get("id") or mb.get("id")
                print(f"          default metric_id={metric_id}")
            else:
                print(f"          [metric FAIL] {gm.status_code}: {gm.text[:160]}")
            results.append({"slug": m["slug"], "name": name, "def_id": def_id, "metric_id": metric_id})
            time.sleep(0.4)

        print("\n--- verify insight bundles (BAN) ---")
        for res in results:
            if not res["metric_id"]:
                continue
            vb = http.post(f"{base}/insights/ban", headers=H, json={"bundle_request": {"version": 1,
                "options": {"output_format": "OUTPUT_FORMAT_TEXT"},
                "input": {"metric_id": res["metric_id"], "metric": {"definition_id": res["def_id"]}}}})
            print(f"  {res['name']:16s} [{'OK' if vb.status_code == 200 else vb.status_code}] {vb.text[:160].strip()[:160]}")

    print("\n=== SUMMARY (metric IDs for lib/pulse.ts) ===")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return results


def main() -> None:
    env = pc._env()
    ds_luid = None
    if "--publish" in sys.argv:
        build_single_table_tdsx()
        ds_luid = publish_datasource(env)
    if "--create" in sys.argv:
        if not ds_luid:
            # look up the published datasource LUID
            token, site_luid, origin = pc.sign_in(env)
            import httpx
            r = httpx.get(f"{origin}/api/3.21/sites/{site_luid}/datasources",
                          headers={"X-Tableau-Auth": token, "Accept": "application/json"},
                          params={"filter": f"name:eq:{DS_NAME}"}, timeout=30)
            dss = r.json().get("datasources", {}).get("datasource", [])
            if not dss:
                print(f"❌ datasource {DS_NAME!r} not found — run with --publish first.")
                return
            ds_luid = dss[0]["id"]
            print(f"found published {DS_NAME} luid={ds_luid}")
        create_metrics(env, ds_luid)


if __name__ == "__main__":
    main()
