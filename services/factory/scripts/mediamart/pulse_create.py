"""Create MediaMart Pulse metric definitions via the raw REST API.

TSC 0.40 has no Pulse endpoints, so we borrow its auth token + site LUID and
call {server}/api/-/pulse/ directly. Payload enums verified against the live
Superstore sample definitions on this site (see pulse_probe.py):
  aggregation:  AGGREGATION_SUM | AGGREGATION_COUNT_DISTINCT
  granularity:  GRANULARITY_BY_DAY | _WEEK | _MONTH | _QUARTER | _YEAR
  temporality:  TEMPORALITY_OVER_TIME
  sentiment:    SENTIMENT_TYPE_UP_IS_GOOD | _DOWN_IS_GOOD | _NONE
  format:       NUMBER_FORMAT_TYPE_CURRENCY | _NUMBER | _PERCENT

The mediamart datasource is single-tenant (its own project + no data policy),
so filters = [] — a user-attribute RLS filter would only risk blanking.

Run:
  uv run python scripts/mediamart/pulse_create.py            # dry-run: print payloads
  uv run python scripts/mediamart/pulse_create.py --create   # create defs + default metrics + verify
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DS_NAME = "mediamart"
DS_LUID = "e646e8a7-baa5-42db-bcfd-3550fba4f21f"  # confirmed live via pulse_probe

# ── Metric catalog ───────────────────────────────────────────────────────────
# Fields are bare SalesFact columns (verified rendering in build_mediamart_d1).
# Pulse basic_specification is single measure + aggregation — no conditional
# calcs — so Revenue = SUM(LineTotal) over all statuses (returns included),
# a slight but acceptable simplification of the dashboard's Completed-only calc.
METRICS = [
    {
        "slug": "doanh-thu",
        "name": "Doanh thu",
        "description": "Tổng doanh thu bán hàng (LineTotal). Bóc tách theo Category, Region, ChannelName, Tier.",
        "field": "LineTotal",
        "aggregation": "AGGREGATION_SUM",
        "format": "NUMBER_FORMAT_TYPE_CURRENCY",
        "currency_code": "CURRENCY_CODE_VND",
        "sentiment": "SENTIMENT_TYPE_UP_IS_GOOD",
    },
    {
        "slug": "loi-nhuan-gop",
        "name": "Lợi nhuận gộp",
        "description": "Lợi nhuận gộp (GrossProfit) trước chi phí vận hành.",
        "field": "GrossProfit",
        "aggregation": "AGGREGATION_SUM",
        "format": "NUMBER_FORMAT_TYPE_CURRENCY",
        "currency_code": "CURRENCY_CODE_VND",
        "sentiment": "SENTIMENT_TYPE_UP_IS_GOOD",
    },
    {
        "slug": "so-don-hang",
        "name": "Số đơn hàng",
        "description": "Số đơn hàng riêng biệt (COUNTD OrderId).",
        "field": "OrderId",
        "aggregation": "AGGREGATION_COUNT_DISTINCT",
        "format": "NUMBER_FORMAT_TYPE_NUMBER",
        "sentiment": "SENTIMENT_TYPE_UP_IS_GOOD",
    },
    {
        "slug": "san-luong-ban",
        "name": "Sản lượng bán",
        "description": "Tổng số lượng sản phẩm bán ra (Quantity).",
        "field": "Quantity",
        "aggregation": "AGGREGATION_SUM",
        "format": "NUMBER_FORMAT_TYPE_NUMBER",
        "sentiment": "SENTIMENT_TYPE_UP_IS_GOOD",
    },
]

TIME_FIELD = "OrderDate"
ALLOWED_DIMENSIONS = ["Category", "Brand", "Region", "Province", "City", "ChannelName", "Tier", "PaymentMethod"]
GRANULARITIES = [
    "GRANULARITY_BY_DAY",
    "GRANULARITY_BY_WEEK",
    "GRANULARITY_BY_MONTH",
    "GRANULARITY_BY_QUARTER",
    "GRANULARITY_BY_YEAR",
]
INSIGHT_TYPES = [
    "INSIGHT_TYPE_UNUSUAL_CHANGE",
    "INSIGHT_TYPE_TOP_DRIVERS",
    "INSIGHT_TYPE_CURRENT_TREND",
    "INSIGHT_TYPE_METRIC_FORECAST",
    "INSIGHT_TYPE_BOTTOM_CONTRIBUTORS",
    "INSIGHT_TYPE_TOP_DETRACTORS",
    "INSIGHT_TYPE_NEW_TREND",
]


def _env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def sign_in(env: dict) -> tuple[str, str, str]:
    import tableauserverclient as tsc

    auth = tsc.PersonalAccessTokenAuth(
        env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"]
    )
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    server.auth.sign_in(auth)
    return server.auth_token, server.site_id, env["TABLEAU_SITE_URL"].rstrip("/")


def build_definition_payload(m: dict) -> dict:
    repr_opts: dict = {
        "type": m["format"],
        "sentiment_type": m["sentiment"],
        "row_level_id_field": {"identifier_col": "OrderId", "identifier_label": "Đơn hàng"},
        "row_level_entity_names": {"entity_name_singular": "đơn hàng", "entity_name_plural": "đơn hàng"},
    }
    if m.get("currency_code"):
        repr_opts["currency_code"] = m["currency_code"]
    return {
        "metadata": {
            "name": m["name"],
            "description": m["description"],
        },
        "specification": {
            "datasource": {"id": DS_LUID},
            "basic_specification": {
                "measure": {"field": m["field"], "aggregation": m["aggregation"]},
                "time_dimension": {"field": TIME_FIELD},
                "filters": [],
            },
            "is_running_total": False,
        },
        "extension_options": {
            "allowed_dimensions": ALLOWED_DIMENSIONS,
            "allowed_granularities": GRANULARITIES,
            "offset_from_today": 0,
        },
        "representation_options": repr_opts,
        "insights_options": {
            "show_insights": True,
            "settings": [{"type": t, "disabled": False} for t in INSIGHT_TYPES],
        },
    }


def main() -> None:
    do_create = "--create" in sys.argv
    env = _env()

    if not do_create:
        print("DRY RUN — payloads (pass --create to POST):\n")
        for m in METRICS:
            print(f"### {m['name']} ({m['slug']})")
            print(json.dumps(build_definition_payload(m), ensure_ascii=False, indent=2))
            print()
        return

    token, site_luid, origin = sign_in(env)
    print(f"signed in — site_luid={site_luid}\n")
    headers = {"X-Tableau-Auth": token, "Content-Type": "application/json", "Accept": "application/json"}
    base = f"{origin}/api/-/pulse"

    results = []
    with httpx.Client(timeout=45.0) as http:
        # Idempotency: index existing definitions by name.
        r = http.get(f"{base}/definitions", headers=headers)
        existing = {d.get("metadata", {}).get("name"): d for d in r.json().get("definitions", [])}

        for m in METRICS:
            name = m["name"]
            if name in existing:
                def_id = existing[name]["metadata"]["id"]
                print(f"[skip] '{name}' already exists — def_id={def_id}")
            else:
                payload = build_definition_payload(m)
                r = http.post(f"{base}/definitions", headers=headers, json=payload)
                if r.status_code not in (200, 201):
                    print(f"[FAIL] create '{name}' → {r.status_code}: {r.text[:500]}")
                    continue
                def_id = r.json().get("metadata", {}).get("id") or r.json().get("definition", {}).get("metadata", {}).get("id")
                print(f"[create] '{name}' → def_id={def_id}")

            # Create the default metric (unfiltered) for this definition.
            gm = http.post(
                f"{base}/metrics:getOrCreate",
                headers=headers,
                json={"definition_id": def_id, "specification": {"filters": []}},
            )
            metric_id = None
            if gm.status_code in (200, 201):
                body = gm.json()
                metric_id = body.get("metric", {}).get("id") or body.get("id")
                print(f"          default metric_id={metric_id}")
            else:
                print(f"          [metric FAIL] {gm.status_code}: {gm.text[:300]}")

            results.append({"slug": m["slug"], "name": name, "def_id": def_id, "metric_id": metric_id})
            time.sleep(0.4)  # gentle rate-limit

        # Verify: generate a BAN insight bundle for the first metric with a value.
        print("\n--- verifying insight bundles ---")
        for res in results:
            if not res["metric_id"]:
                continue
            vb = http.post(
                f"{base}/insights/ban",
                headers=headers,
                json={
                    "bundle_request": {
                        "version": 1,
                        "options": {"output_format": "OUTPUT_FORMAT_TEXT"},
                        "input": {
                            "metric_id": res["metric_id"],
                            "metric": {"definition_id": res["def_id"]},
                        },
                    }
                },
            )
            tag = "OK" if vb.status_code == 200 else f"HTTP {vb.status_code}"
            snippet = vb.text[:220].replace("\n", " ")
            print(f"  {res['name']:16s} [{tag}] {snippet}")

    print("\n=== SUMMARY (paste into lib/pulse.ts CATALOG) ===")
    for res in results:
        print(f"  {res['slug']:16s} def={res['def_id']}  metric={res['metric_id']}")


if __name__ == "__main__":
    main()
