"""Per-run Tableau site override (`config.resolve_tableau` + `TableauTarget`).

Verifies that a factory job can publish to a caller-specified site without
touching the global .env — the mechanism that lets each SE target their own
Tableau Cloud site.
"""

from __future__ import annotations

from app.config import Settings, resolve_tableau
from app.models import TableauTarget
from app.publish import is_configured


def _base() -> Settings:
    return Settings(
        portal_env="dev",
        anthropic_api_key=None,
        tableau_site_url=None,
        tableau_site_name=None,
        tableau_pat_name=None,
        tableau_pat_secret=None,
        target_row_count=200_000,
    )


def test_none_target_is_passthrough():
    s = _base()
    assert resolve_tableau(s, None) is s


def test_full_target_overrides_empty_env():
    # An SE with an empty global .env supplies a complete target → configured.
    s = _base()
    target = TableauTarget(
        site_url="https://10ax.online.tableau.com",
        site_name="my-site",
        pat_name="my-pat",
        pat_secret="super-secret",
    )
    resolved = resolve_tableau(s, target)

    assert resolved.tableau_site_url == "https://10ax.online.tableau.com"
    assert resolved.tableau_site_name == "my-site"
    assert resolved.tableau_pat_name == "my-pat"
    assert resolved.tableau_pat_secret is not None
    assert resolved.tableau_pat_secret.get_secret_value() == "super-secret"
    # publish.is_configured should now pass on the resolved copy...
    assert is_configured(resolved) is True
    # ...without mutating the original.
    assert is_configured(s) is False


def test_partial_target_falls_back_to_env():
    # Global .env has site + PAT; target only re-points the site name.
    s = _base().model_copy(
        update={
            "tableau_site_url": "https://env-host.online.tableau.com",
            "tableau_site_name": "env-site",
            "tableau_pat_name": "env-pat",
        }
    )
    target = TableauTarget(site_name="override-site")
    resolved = resolve_tableau(s, target)

    assert resolved.tableau_site_name == "override-site"  # target wins
    assert resolved.tableau_site_url == "https://env-host.online.tableau.com"  # fallback
    assert resolved.tableau_pat_name == "env-pat"  # fallback
