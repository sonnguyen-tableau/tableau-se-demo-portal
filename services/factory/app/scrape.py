"""Stage 1 — scrape the customer's website."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 tableau-ai-portal/factory"
)


@dataclass
class ScrapeResult:
    html: str
    title: str | None
    final_url: str
    screenshot_png: bytes | None = None


async def scrape_basic(url: str, *, timeout_s: float = 20.0) -> ScrapeResult:
    """HTML-only fetch via httpx. Sufficient when the site is server-rendered.

    For JS-heavy sites the portal flips to the Playwright path (Phase 10);
    for now the basic fetch is good enough for industry detection because
    Claude only needs a few hundred words of body copy.
    """
    async with httpx.AsyncClient(
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        timeout=timeout_s,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text
    title = _extract_title(html)
    return ScrapeResult(html=html, title=title, final_url=str(resp.url))


def _extract_title(html: str) -> str | None:
    lower = html.lower()
    s = lower.find("<title")
    if s < 0:
        return None
    s = lower.find(">", s)
    if s < 0:
        return None
    e = lower.find("</title>", s)
    if e < 0:
        return None
    return html[s + 1 : e].strip() or None
