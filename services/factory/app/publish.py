"""Stage 7 — publish the .hyper extract to Tableau Cloud via TSC.

Multi-table extracts must be wrapped in a .tdsx (zip of .hyper + .tds) so
Tableau learns the table relationships. We package on the fly here using
`packager.package_tdsx` and upload the resulting .tdsx instead of the raw
.hyper.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .models import Industry
from .packager import package_tdsx


@dataclass
class PublishResult:
    datasource_id: str
    datasource_name: str
    project_name: str
    skipped: bool = False
    reason: str | None = None


def is_configured(settings: Settings) -> bool:
    return (
        settings.tableau_site_url is not None
        and settings.tableau_site_name is not None
        and settings.tableau_pat_name is not None
        and settings.tableau_pat_secret is not None
    )


def publish_hyper(
    hyper_path: Path,
    *,
    tenant_slug: str,
    industry: Industry,
    settings: Settings,
    project_name: str | None = None,
) -> PublishResult:
    """Publish to a per-tenant project folder. Returns metadata for downstream stages.

    project_name: explicit folder name to create/use on Tableau Cloud.
    Defaults to "Demo/{tenant_slug}" so all factory-generated demos live under
    a shared "Demo" parent — matching the Option A multi-project architecture.
    """

    default_project = project_name or f"Demo/{tenant_slug}"

    if not is_configured(settings):
        return PublishResult(
            datasource_id="",
            datasource_name=hyper_path.stem,
            project_name=default_project,
            skipped=True,
            reason="Tableau Cloud credentials not configured (TABLEAU_PAT_NAME/SECRET).",
        )

    import tableauserverclient as TSC

    assert settings.tableau_pat_name is not None
    assert settings.tableau_pat_secret is not None
    assert settings.tableau_site_name is not None
    assert settings.tableau_site_url is not None

    # Package .hyper + per-industry .tds (with table relationships) into a
    # .tdsx so Tableau Cloud accepts the multi-table extract.
    datasource_name = hyper_path.stem
    tdsx_path = package_tdsx(
        hyper_path=hyper_path,
        datasource_name=datasource_name,
        industry=industry,
    )

    tableau_auth = TSC.PersonalAccessTokenAuth(
        settings.tableau_pat_name,
        settings.tableau_pat_secret.get_secret_value(),
        site_id=settings.tableau_site_name,
    )
    server = TSC.Server(  # type: ignore[no-untyped-call]
        settings.tableau_site_url, use_server_version=True
    )

    with server.auth.sign_in(tableau_auth):
        all_projects, _ = server.projects.get()
        project_id = _ensure_project_path(server, all_projects, default_project, tenant_slug)

        datasource = TSC.DatasourceItem(project_id=project_id, name=datasource_name)
        published = server.datasources.publish(
            datasource,
            str(tdsx_path),
            mode=TSC.Server.PublishMode.Overwrite,
        )

        return PublishResult(
            datasource_id=published.id or "",
            datasource_name=published.name or datasource_name,
            project_name=default_project,
        )


def _ensure_project_path(server: object, all_projects: list, path: str, description: str) -> str:
    """Ensure a (possibly nested) project path exists and return the leaf project id.

    "Demo/VinCommerce" creates parent "Demo" first (if missing), then child.
    Single-segment paths create a top-level project directly.
    """
    import tableauserverclient as TSC

    parts = [p.strip() for p in path.split("/") if p.strip()]
    parent_id: str | None = None

    # Build a lookup keyed by (name, parent_id) to handle duplicates gracefully
    def find(name: str, par_id: str | None) -> str | None:
        for p in all_projects:
            pid = getattr(p, "parent_id", None) or getattr(p, "parentProjectId", None)
            if p.name == name and pid == par_id:
                return p.id  # type: ignore[return-value]
        return None

    for i, part in enumerate(parts):
        existing_id = find(part, parent_id)
        if existing_id:
            parent_id = existing_id
        else:
            new_proj = TSC.ProjectItem(  # type: ignore[no-untyped-call]
                name=part,
                description=f"Auto-created for {description}" if i == len(parts) - 1 else "",
            )
            if parent_id:
                new_proj.parent_id = parent_id  # type: ignore[attr-defined]
            created = server.projects.create(new_proj)  # type: ignore[attr-defined]
            # Refresh list so child lookups work
            all_projects, _ = server.projects.get()  # type: ignore[attr-defined]
            parent_id = created.id

    return parent_id or ""
