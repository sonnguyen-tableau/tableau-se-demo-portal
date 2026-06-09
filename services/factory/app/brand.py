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
import logging
import re
from typing import Any

import httpx

_log = logging.getLogger(__name__)

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


def _linearize(channel: float) -> float:
    """sRGB channel [0,1] → linear light (WCAG relative luminance formula)."""
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def _luminance(hex_color: str) -> float:
    """Relative luminance of a #rrggbb hex color."""
    r = int(hex_color[1:3], 16) / 255
    g = int(hex_color[3:5], 16) / 255
    b = int(hex_color[5:7], 16) / 255
    return 0.2126 * _linearize(r) + 0.7152 * _linearize(g) + 0.0722 * _linearize(b)


def _contrast(hex1: str, hex2: str) -> float:
    """WCAG 2.1 contrast ratio between two #rrggbb colors."""
    l1, l2 = _luminance(hex1), _luminance(hex2)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _darken(hex_color: str, steps: int = 1) -> str:
    """Reduce each RGB channel by 12% per step to increase contrast on white."""
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    factor = 0.88 ** steps
    r2, g2, b2 = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r2:02x}{g2:02x}{b2:02x}"


def _ensure_wcag_aa(theme: "BrandTheme") -> "BrandTheme":
    """Darken primary_color until it passes WCAG AA (4.5:1) against white.

    Three darkening passes are attempted; if still failing a warning is emitted
    and the original value is kept (better than silent failure).
    """
    WHITE = "#ffffff"
    color = theme.primary_color
    ratio = _contrast(color, WHITE)
    if ratio >= 4.5:
        return theme

    for step in range(1, 6):
        candidate = _darken(theme.primary_color, steps=step)
        new_ratio = _contrast(candidate, WHITE)
        if new_ratio >= 4.5:
            _log.info(
                "WCAG AA: adjusted primary %s → %s (ratio %.2f → %.2f)",
                theme.primary_color, candidate, ratio, new_ratio,
            )
            return theme.model_copy(update={"primary_color": candidate})

    _log.warning(
        "WCAG AA: primary %s has contrast %.2f against white — could not reach 4.5:1 in 5 steps",
        theme.primary_color, ratio,
    )
    return theme


def _fallback_theme(scrape: ScrapeResult) -> BrandTheme:
    """Deterministic palette derived from the URL hostname.

    Hash the hostname, take the first three byte triples as HSV-rotated
    hex colors. Stable across runs for the same input.
    """
    seed = hashlib.sha256(scrape.final_url.encode()).digest()
    primary = f"#{seed[0]:02x}{seed[1]:02x}{seed[2]:02x}"
    secondary = f"#{seed[3]:02x}{seed[4]:02x}{seed[5]:02x}"
    neutral = "#0F172A"
    theme = BrandTheme(
        primary_color=primary,
        secondary_color=secondary,
        neutral_color=neutral,
        font_family="Inter",
        logo_url=extract_image_url(scrape),
        tone="professional",
    )
    return _ensure_wcag_aa(theme)


def generate_tenant_design_md(
    company_name: str,
    source_url: str,
    industry: str,
    theme: "BrandTheme",
) -> str:
    """Return a minimal per-tenant DESIGN.md string for the AI agent system prompt."""
    primary_contrast = _contrast(theme.primary_color, "#ffffff")
    wcag_note = (
        f"WCAG AA compliant ({primary_contrast:.1f}:1 vs white)"
        if primary_contrast >= 4.5
        else f"WARNING: contrast {primary_contrast:.1f}:1 — below WCAG AA threshold"
    )
    return f"""---
tenant: "{company_name}"
source_url: "{source_url}"
industry: "{industry}"
brand:
  primary:   "{theme.primary_color}"   # {wcag_note}
  secondary: "{theme.secondary_color}"
  neutral:   "{theme.neutral_color}"
  font:      "{theme.font_family}"
  tone:      "{theme.tone}"
---

# {company_name} — Tenant Design Context

## Brand Identity

- **Primary color:** `{theme.primary_color}` — used for CTAs, active states, and links in the portal.
- **Secondary color:** `{theme.secondary_color}` — used for accents, tag backgrounds, and hover states.
- **Neutral color:** `{theme.neutral_color}` — sidebar background and inverted surfaces.
- **Font family:** {theme.font_family} — override applied globally via `--font-sans`.
- **Tone:** {theme.tone} — informs how the AI assistant phrases answers for this tenant.

## Portal Theme

This tenant's portal overrides three CSS variables at runtime:
```css
--brand-primary:   {theme.primary_color};
--brand-secondary: {theme.secondary_color};
--brand-neutral:   {theme.neutral_color};
--font-sans:       {theme.font_family}, Inter, system-ui, sans-serif;
```

## AI Assistant Guidance

When answering questions for this tenant:
- Match the **{theme.tone}** tone of the brand.
- Reference the company name **{company_name}** when describing data.
- Industry context: **{industry}** — apply relevant domain vocabulary.
- Never use placeholder names or generic company names in responses.
"""


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

    theme = BrandTheme(
        primary_color=_hex(payload.get("primary_color"), "#1A56DB"),
        secondary_color=_hex(payload.get("secondary_color"), "#F59E0B"),
        neutral_color=_hex(payload.get("neutral_color"), "#0F172A"),
        font_family=str(payload.get("font_family") or "Inter")[:80],
        logo_url=str(payload.get("logo_url") or image_url)[:1024],
        tone=(payload.get("tone") if payload.get("tone") in {"professional", "playful", "technical"} else "professional"),
    )
    return _ensure_wcag_aa(theme)
