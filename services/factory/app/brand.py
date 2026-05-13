"""Stage 10 — extract brand identity from the customer website.

Strategy:
1. Pull the most-likely logo / hero image URL from the scraped HTML
   (`<link rel="apple-touch-icon">`, `<meta property="og:image">`,
   `<link rel="icon">`). No headless browser dependency.
2. If Anthropic is configured, fetch that image and ask Claude vision to
   return a structured `BrandTheme` (palette, font, tone). Otherwise fall
   back to a deterministic palette derived from the URL hostname.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any

import httpx

from .config import Settings
from .models import BrandTheme
from .scrape import ScrapeResult

_OG_PATTERNS = (
    re.compile(r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']', re.IGNORECASE),
    re.compile(r'<link\s+rel=["\']apple-touch-icon["\']\s+href=["\']([^"\']+)["\']', re.IGNORECASE),
    re.compile(r'<link\s+rel=["\']icon["\']\s+href=["\']([^"\']+)["\']', re.IGNORECASE),
)

BRAND_VISION_PROMPT = (
    "You are a brand designer. Look at the screenshot/logo image and return a JSON object with "
    "these fields exactly: primary_color (hex), secondary_color (hex), neutral_color (hex), "
    "font_family (string), logo_url (string or empty), tone (one of professional, playful, technical). "
    "Pick colors that are clearly used by the brand (avoid muddy averages). Return JSON only."
)


def extract_image_url(scrape: ScrapeResult) -> str | None:
    """Pick the best candidate image URL from the scraped HTML."""
    html = scrape.html
    for pattern in _OG_PATTERNS:
        m = pattern.search(html)
        if not m:
            continue
        url = m.group(1).strip()
        return _absolute(url, scrape.final_url)
    return None


def _absolute(url: str, base: str) -> str:
    if url.startswith(("http://", "https://")):
        return url
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        from urllib.parse import urlparse

        u = urlparse(base)
        return f"{u.scheme}://{u.netloc}{url}"
    return url


def _fallback_theme(scrape: ScrapeResult) -> BrandTheme:
    """Deterministic palette derived from the URL hostname.

    Hash the hostname, take the first three byte triples as HSV-rotated
    hex colors. Stable across runs for the same input.
    """
    seed = hashlib.sha256(scrape.final_url.encode()).digest()
    primary = f"#{seed[0]:02x}{seed[1]:02x}{seed[2]:02x}"
    secondary = f"#{seed[3]:02x}{seed[4]:02x}{seed[5]:02x}"
    neutral = "#0F172A"
    return BrandTheme(
        primary_color=primary,
        secondary_color=secondary,
        neutral_color=neutral,
        font_family="Inter",
        logo_url=extract_image_url(scrape),
        tone="professional",
    )


async def extract_brand(scrape: ScrapeResult, settings: Settings) -> BrandTheme:
    image_url = extract_image_url(scrape)

    if settings.anthropic_api_key is None or image_url is None:
        return _fallback_theme(scrape)

    image_bytes: bytes | None = None
    media_type = "image/png"
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as http_client:
            r = await http_client.get(image_url)
            if r.status_code == 200 and len(r.content) <= 4 * 1024 * 1024:
                image_bytes = r.content
                media_type = r.headers.get("content-type", "image/png").split(";")[0].strip()
                if media_type not in {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}:
                    media_type = "image/png"
    except Exception:
        image_bytes = None

    if image_bytes is None:
        return _fallback_theme(scrape)

    from anthropic import AsyncAnthropic

    anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key.get_secret_value())
    encoded = base64.standard_b64encode(image_bytes).decode("ascii")
    # The Anthropic SDK's typed image-content shape uses Literal media-type
    # constants; constructing as Any avoids hard-coding the literal union
    # while preserving the wire shape that the API expects.
    content: list[Any] = [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": encoded},
        },
        {
            "type": "text",
            "text": f"Website: {scrape.final_url}. Image source: {image_url}.",
        },
    ]
    try:
        msg = await anthropic_client.messages.create(
            model=settings.anthropic_model,
            max_tokens=400,
            system=BRAND_VISION_PROMPT,
            messages=[{"role": "user", "content": content}],
        )
    except Exception:
        return _fallback_theme(scrape)

    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
    except Exception:
        return _fallback_theme(scrape)

    # Validate hex shape; bad output falls back.
    def _hex(v: object, default: str) -> str:
        if isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            return v.lower()
        return default

    return BrandTheme(
        primary_color=_hex(payload.get("primary_color"), "#1A56DB"),
        secondary_color=_hex(payload.get("secondary_color"), "#F59E0B"),
        neutral_color=_hex(payload.get("neutral_color"), "#0F172A"),
        font_family=str(payload.get("font_family") or "Inter")[:80],
        logo_url=str(payload.get("logo_url") or image_url)[:1024],
        tone=(payload.get("tone") if payload.get("tone") in {"professional", "playful", "technical"} else "professional"),
    )
