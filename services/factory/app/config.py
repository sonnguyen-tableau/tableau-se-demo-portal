"""Pydantic-settings-backed runtime configuration."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    from .models import TableauTarget


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    portal_env: str = Field(default="dev", description="dev | staging | prod")
    factory_data_dir: Path = Field(default=Path("/tmp/factory"))

    # Anthropic — optional; pipeline stages that need it skip gracefully.
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-sonnet-4-5-20250929"

    # Tableau Cloud — optional for local tests.
    tableau_site_url: str | None = None
    tableau_site_name: str | None = None
    tableau_pat_name: str | None = None
    tableau_pat_secret: SecretStr | None = None

    # Row count budget per generated tenant.
    target_row_count: int = Field(default=200_000, ge=10_000, le=1_000_000)


def get_settings() -> Settings:
    return Settings()


def resolve_tableau(settings: Settings, target: "TableauTarget | None") -> Settings:
    """Return a Settings copy where a per-run TableauTarget overrides the
    global .env Tableau credentials.

    Target fields win when set; anything the target leaves unset falls back to
    the global setting. When `target` is None the input settings are returned
    unchanged — so behaviour is identical to before for callers that don't send
    a per-run target. This lets each SE publish to their own site by passing a
    target, while the shared .env remains the default.
    """
    if target is None:
        return settings
    return settings.model_copy(
        update={
            "tableau_site_url": target.site_url or settings.tableau_site_url,
            "tableau_site_name": target.site_name or settings.tableau_site_name,
            "tableau_pat_name": target.pat_name or settings.tableau_pat_name,
            "tableau_pat_secret": (
                SecretStr(target.pat_secret)
                if target.pat_secret
                else settings.tableau_pat_secret
            ),
        }
    )
