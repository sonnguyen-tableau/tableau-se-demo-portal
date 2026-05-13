"""Pydantic-settings-backed runtime configuration."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


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
