"""Pulse REST API probe for MediaMart.

TSC 0.40 has NO Pulse endpoints, so we sign in with TSC only to borrow its
auth token + site LUID, then call the raw Pulse REST API with httpx.

Pulse base path: {server}/api/-/pulse/   (literal '-' in place of a version)
Endpoints (API 3.21+, Tableau Cloud only):
  POST /api/-/pulse/definitions            create metric definition
  GET  /api/-/pulse/definitions            list definitions
  POST /api/-/pulse/metrics:getOrCreate    default metric from a definition
  POST /api/-/pulse/insights/ban           generate insight bundle (value)

Run:
  uv run python scripts/mediamart/pulse_probe.py          # auth + datasource + list defs
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DS_NAME = "mediamart"


def _env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def sign_in(env: dict) -> tuple[str, str, str]:
    """Return (token, site_luid, server_origin) via TSC sign-in."""
    import tableauserverclient as tsc

    auth = tsc.PersonalAccessTokenAuth(
        env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"], site_id=env["TABLEAU_SITE_NAME"]
    )
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    server.auth.sign_in(auth)
    return server.auth_token, server.site_id, env["TABLEAU_SITE_URL"].rstrip("/")


def main() -> None:
    env = _env()
    token, site_luid, origin = sign_in(env)
    print(f"signed in — site_luid={site_luid}")
    print(f"server rest api version = {origin}")

    headers = {
        "X-Tableau-Auth": token,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    base = f"{origin}/api/-/pulse"

    with httpx.Client(timeout=30.0) as http:
        # 1) confirm the datasource LUID via REST (TSC would also work).
        ds_url = f"{origin}/api/3.21/sites/{site_luid}/datasources"
        r = http.get(ds_url, headers=headers, params={"filter": f"name:eq:{DS_NAME}"})
        print(f"\n[datasources] {r.status_code}")
        if r.status_code == 200:
            dss = r.json().get("datasources", {}).get("datasource", [])
            for d in dss:
                print(f"  {d.get('name')}  id={d.get('id')}  project={d.get('project',{}).get('name')}")

        # 2) list existing Pulse definitions (learn the response shape).
        r = http.get(f"{base}/definitions", headers=headers)
        print(f"\n[GET definitions] {r.status_code}")
        if r.status_code == 200:
            defs = r.json().get("definitions", [])
            print(f"  existing definitions: {len(defs)}")
            for d in defs[:20]:
                md = d.get("metadata", {})
                print(f"  - {md.get('name')}  ext_id={md.get('ext_assigned_id')}  id={md.get('id')}")
            if defs:
                print("\n  --- first definition full JSON (shape reference) ---")
                print(json.dumps(defs[0], indent=2)[:2500])
        else:
            print(f"  body: {r.text[:600]}")


if __name__ == "__main__":
    main()
