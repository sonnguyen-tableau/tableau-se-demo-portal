from __future__ import annotations

import pytest

from app.brand import _fallback_theme, extract_brand, extract_image_url
from app.config import Settings
from app.scrape import ScrapeResult


def _scrape(html: str = "<html></html>", url: str = "https://example.com/") -> ScrapeResult:
    return ScrapeResult(html=html, title=None, final_url=url)


def test_image_extraction_prefers_og_image() -> None:
    html = (
        "<html><head>"
        '<meta property="og:image" content="https://cdn.example.com/hero.png" />'
        '<link rel="icon" href="/favicon.ico" />'
        "</head></html>"
    )
    assert extract_image_url(_scrape(html)) == "https://cdn.example.com/hero.png"


def test_image_extraction_resolves_relative_paths() -> None:
    html = '<html><head><link rel="apple-touch-icon" href="/static/touch.png"></head></html>'
    assert (
        extract_image_url(_scrape(html, "https://acme.com/x"))
        == "https://acme.com/static/touch.png"
    )


def test_image_extraction_none_when_no_candidates() -> None:
    assert extract_image_url(_scrape("<html></html>")) is None


def test_fallback_theme_is_deterministic() -> None:
    a = _fallback_theme(_scrape(url="https://acme.com/"))
    b = _fallback_theme(_scrape(url="https://acme.com/"))
    assert a.primary_color == b.primary_color
    assert a.secondary_color == b.secondary_color


@pytest.mark.asyncio
async def test_extract_brand_uses_fallback_when_anthropic_absent() -> None:
    s = Settings(
        portal_env="dev",
        anthropic_api_key=None,
        tableau_site_url=None,
        tableau_site_name=None,
        tableau_pat_name=None,
        tableau_pat_secret=None,
    )
    theme = await extract_brand(_scrape(), s)
    assert theme.primary_color.startswith("#")
    assert len(theme.primary_color) == 7
    assert theme.tone in {"professional", "playful", "technical"}
