"""Open-industry behaviour: any kebab-case industry slug is accepted at the API
boundary; a slug with no registered generator fails the generate stage with an
actionable message (not a bare NotImplementedError), while the built-in
industries keep working through the registry.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.models import CompanyProfile, DirectStartRequest
from app.pipeline import FactoryJob


def _settings() -> Settings:
    return Settings(
        portal_env="dev",
        anthropic_api_key=None,
        tableau_site_url=None,
        tableau_site_name=None,
        tableau_pat_name=None,
        tableau_pat_secret=None,
        target_row_count=200_000,
    )


def test_arbitrary_industry_accepted_by_request_model():
    # Previously `industry: Industry` rejected anything outside the 7-enum.
    req = DirectStartRequest(
        company_name="Skyline Catering",
        company_url="https://example.com",
        industry="airline-catering",
    )
    assert req.industry == "airline-catering"


def test_bad_industry_slug_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DirectStartRequest(
            company_name="X", company_url="https://example.com", industry="Bad Slug!"
        )


def test_builtin_industry_generates_via_registry():
    job = FactoryJob(
        job_id="t", url="https://example.com", tenant_slug="acme",
        settings=_settings(),
        direct_profile=CompanyProfile(
            company_name="Acme", company_url="https://example.com",
            industry="retail-ecommerce",
        ),
    )
    tables, rows = job._generate_for(job._direct_profile)  # type: ignore[arg-type]
    assert rows > 0
    assert tables  # non-empty table dict


def test_unknown_industry_raises_actionable_error():
    job = FactoryJob(
        job_id="t", url="https://example.com", tenant_slug="foo",
        settings=_settings(),
        direct_profile=CompanyProfile(
            company_name="Foo", company_url="https://example.com",
            industry="airline-catering",  # valid slug, no registered generator
        ),
    )
    with pytest.raises(ValueError) as exc:
        job._generate_for(job._direct_profile)  # type: ignore[arg-type]
    msg = str(exc.value)
    assert "airline-catering" in msg
    assert "scaffold" in msg.lower()
