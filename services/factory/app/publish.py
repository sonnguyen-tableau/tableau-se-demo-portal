"""Stage 7 — publish the .hyper extract to Tableau Cloud via TSC."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Settings


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
    settings: Settings,
) -> PublishResult:
    """Publish to a per-tenant project. Returns metadata for downstream stages."""

    if not is_configured(settings):
        return PublishResult(
            datasource_id="",
            datasource_name=hyper_path.stem,
            project_name=f"tenant-{tenant_slug}",
            skipped=True,
            reason="Tableau Cloud credentials not configured (TABLEAU_PAT_NAME/SECRET).",
        )

    import tableauserverclient as TSC

    assert settings.tableau_pat_name is not None
    assert settings.tableau_pat_secret is not None
    assert settings.tableau_site_name is not None
    assert settings.tableau_site_url is not None

    tableau_auth = TSC.PersonalAccessTokenAuth(
        settings.tableau_pat_name,
        settings.tableau_pat_secret.get_secret_value(),
        site_id=settings.tableau_site_name,
    )
    server = TSC.Server(  # type: ignore[no-untyped-call]
        settings.tableau_site_url, use_server_version=True
    )

    with server.auth.sign_in(tableau_auth):
        # Ensure the tenant project exists.
        project_name = f"tenant-{tenant_slug}"
        all_projects, _ = server.projects.get()
        project = next((p for p in all_projects if p.name == project_name), None)
        if project is None:
            new_proj = TSC.ProjectItem(name=project_name, description=f"Auto-created for {tenant_slug}")
            project = server.projects.create(new_proj)

        datasource = TSC.DatasourceItem(project_id=project.id, name=hyper_path.stem)
        published = server.datasources.publish(
            datasource,
            str(hyper_path),
            mode=TSC.Server.PublishMode.Overwrite,
        )

        return PublishResult(
            datasource_id=published.id or "",
            datasource_name=published.name or hyper_path.stem,
            project_name=project_name,
        )
