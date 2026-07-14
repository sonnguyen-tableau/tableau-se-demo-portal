"""Reusable self-contained-extract publisher.

This promotes the pattern proven by the VACS / ACB / MediaMart tenant builds
(see `scripts/<tenant>/provision_*.py`) into one shared helper so every new
tenant script can call ONE function instead of re-deriving the .tds/.tdsx zip
and the sign-in/project-ensure/publish dance by hand.

The pattern: bundle a multi-table .hyper into a .tdsx whose .tds lists each
table as a flat sibling `<relation>` under a single federated hyper
named-connection. Published this way, the datasource renders on Tableau Cloud
and — crucially — a self-contained extract-*workbook* built on the same shape
renders with `skip_connection_check=True` and NO sqlproxy seed block and NO
manual "open in Desktop, draw relationships, extract the hash" step.

Use `build_extract_tdsx()` when you only need the .tdsx on disk (tests, dry
runs) and `publish_extract_tenant()` to also publish it to Tableau Cloud.

Credentials come from a `Settings` (see `config.py`), so this composes with the
per-run `TableauTarget` override: pass `resolve_tableau(settings, target)` and
the publish lands on whichever site the caller specified.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

from .config import Settings
from .publish import _ensure_project_path, is_configured


@dataclass
class ExtractPublishResult:
    datasource_id: str
    datasource_name: str
    project_name: str
    tdsx_path: Path
    skipped: bool = False
    reason: str | None = None


def build_flat_tds_xml(*, datasource_name: str, hyper_filename: str, tables: tuple[str, ...]) -> bytes:
    """Emit the flat sibling-`<relation>` .tds XML (the 'Migrated Data' shape).

    Every table is a single-relation sibling under one federated hyper
    named-connection pointing at the packaged .hyper. This is the shape the
    VACS/ACB builds use for the published datasource.
    """
    ds = Element(
        "datasource",
        attrib={"formatted-name": datasource_name, "inline": "true", "version": "18.1"},
    )
    conn = SubElement(ds, "connection", attrib={"class": "federated"})
    named = SubElement(conn, "named-connections")
    nc = SubElement(
        named, "named-connection", attrib={"caption": datasource_name, "name": "hyperconn"}
    )
    SubElement(
        nc,
        "connection",
        attrib={
            "class": "hyper",
            "authentication": "auth-none",
            "dbname": f"Data/Datasources/{hyper_filename}",
            "schema": "Extract",
            "server": "",
            "default-settings": "yes",
        },
    )
    for t in tables:
        SubElement(
            conn,
            "relation",
            attrib={
                "connection": "hyperconn",
                "name": t,
                "table": f"[Extract].[{t}]",
                "type": "table",
            },
        )
    body: bytes = tostring(ds, encoding="utf-8")
    return b'<?xml version="1.0" encoding="utf-8" ?>\n' + body


def build_extract_tdsx(
    *,
    hyper_path: Path,
    datasource_name: str,
    tables: tuple[str, ...],
    output_path: Path | None = None,
) -> Path:
    """Zip a .hyper + flat .tds into a .tdsx on disk. Returns the .tdsx path."""
    out = output_path or hyper_path.with_suffix(".tdsx")
    out.parent.mkdir(parents=True, exist_ok=True)
    tds = build_flat_tds_xml(
        datasource_name=datasource_name, hyper_filename=hyper_path.name, tables=tables
    )
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{datasource_name}.tds", tds)
        zf.write(hyper_path, arcname=f"Data/Datasources/{hyper_path.name}")
    return out


def publish_extract_tenant(
    *,
    hyper_path: Path,
    datasource_name: str,
    project_name: str,
    tables: tuple[str, ...],
    settings: Settings,
    tdsx_path: Path | None = None,
) -> ExtractPublishResult:
    """Build the .tdsx and publish it to `project_name` (e.g. "Demo/Acme").

    Skips cleanly (no exception) when Tableau credentials aren't configured, so
    a local/dry run still produces the .tdsx via `build_extract_tdsx`. Creates
    the nested project path if it doesn't exist. Overwrites an existing
    same-named datasource.
    """
    tdsx = build_extract_tdsx(
        hyper_path=hyper_path,
        datasource_name=datasource_name,
        tables=tables,
        output_path=tdsx_path,
    )

    if not is_configured(settings):
        return ExtractPublishResult(
            datasource_id="",
            datasource_name=datasource_name,
            project_name=project_name,
            tdsx_path=tdsx,
            skipped=True,
            reason="Tableau Cloud credentials not configured (TABLEAU_PAT_NAME/SECRET).",
        )

    import tableauserverclient as TSC

    assert settings.tableau_pat_name is not None
    assert settings.tableau_pat_secret is not None
    assert settings.tableau_site_name is not None
    assert settings.tableau_site_url is not None

    auth = TSC.PersonalAccessTokenAuth(
        settings.tableau_pat_name,
        settings.tableau_pat_secret.get_secret_value(),
        site_id=settings.tableau_site_name,
    )
    server = TSC.Server(settings.tableau_site_url, use_server_version=True)  # type: ignore[no-untyped-call]

    with server.auth.sign_in(auth):
        all_projects, _ = server.projects.get()
        project_id = _ensure_project_path(server, all_projects, project_name, datasource_name)
        item = TSC.DatasourceItem(project_id=project_id, name=datasource_name)
        published = server.datasources.publish(
            item, str(tdsx), mode=TSC.Server.PublishMode.Overwrite
        )
        return ExtractPublishResult(
            datasource_id=published.id or "",
            datasource_name=published.name or datasource_name,
            project_name=project_name,
            tdsx_path=tdsx,
        )
