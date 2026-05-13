"""Stage 2 — Claude profiles the business from scraped HTML."""

from __future__ import annotations

import json
import re

from .config import Settings
from .models import CompanyProfile, Industry, KpiSpec
from .scrape import ScrapeResult

PROFILE_SYSTEM_PROMPT = (
    "You are an analyst that profiles a B2B/B2C company from its public website. "
    "Return a single JSON object matching the supplied schema EXACTLY. "
    "Choose `industry` from: retail-ecommerce, retail-banking, manufacturing, healthcare, logistics. "
    "Be conservative: if the site doesn't clearly map to one, pick the closest match and add a low-confidence note in `sub_vertical`. "
    "Do not invent specific numbers; use realistic ranges for `growth_trend_pct` (-20 to +50)."
)


PROFILE_SCHEMA = {
    "type": "object",
    "required": ["company_name", "company_url", "industry"],
    "properties": {
        "company_name": {"type": "string"},
        "company_url": {"type": "string"},
        "tagline": {"type": "string"},
        "logo_url": {"type": "string"},
        "industry": {
            "type": "string",
            "enum": [
                "retail-ecommerce",
                "retail-banking",
                "manufacturing",
                "healthcare",
                "logistics",
            ],
        },
        "sub_vertical": {"type": "string"},
        "products": {"type": "array", "items": {"type": "string"}},
        "segments": {"type": "array", "items": {"type": "string"}},
        "geographies": {
            "type": "array",
            "items": {"type": "string", "enum": ["NA", "EMEA", "APAC", "LATAM"]},
        },
        "kpis": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "type", "favorable_direction"],
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string", "enum": ["currency", "percent", "number"]},
                    "favorable_direction": {
                        "type": "string",
                        "enum": ["up", "down", "neutral"],
                    },
                    "time_dim": {"type": "string"},
                },
            },
        },
        "growth_trend_pct": {"type": "number"},
    },
}


def _trim_for_llm(html: str, max_chars: int = 12_000) -> str:
    # Strip script/style content first to save tokens.
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


async def profile_company(scrape: ScrapeResult, settings: Settings) -> CompanyProfile:
    """Call Claude to produce a structured company profile.

    When ANTHROPIC_API_KEY is missing (local dev / tests) we return a static
    profile based on the URL hostname so the pipeline still flows.
    """
    if settings.anthropic_api_key is None:
        return _fallback_profile(scrape)

    # Import locally so tests without anthropic installed still pass for other paths.
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key.get_secret_value())
    body = _trim_for_llm(scrape.html)
    user = (
        f"Website URL: {scrape.final_url}\n"
        f"Page title: {scrape.title or '(none)'}\n\n"
        f"--- BEGIN PAGE TEXT ---\n{body}\n--- END PAGE TEXT ---\n\n"
        f"Return ONLY the JSON object matching this schema:\n"
        f"{json.dumps(PROFILE_SCHEMA)}"
    )

    msg = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2000,
        system=PROFILE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
    )

    text = "".join(block.text for block in msg.content if block.type == "text")
    payload = _parse_json_object(text)
    return CompanyProfile.model_validate(payload)


def _parse_json_object(text: str) -> dict[str, object]:
    text = text.strip()
    # Allow ``` fenced blocks if the model added them.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError(f"profile JSON was not an object: got {type(parsed).__name__}")
    return parsed


def _fallback_profile(scrape: ScrapeResult) -> CompanyProfile:
    """Deterministic profile used when Anthropic is not configured.

    Picks Retail as a safe default since Phase 7 only ships the Retail
    template. The fallback lets the rest of the pipeline run end-to-end in
    tests without making a network call.
    """
    return CompanyProfile(
        company_name=(scrape.title or scrape.final_url)[:80],
        company_url=scrape.final_url,
        industry=Industry.retail,
        sub_vertical="(fallback — no LLM)",
        products=["Sample Product A", "Sample Product B"],
        segments=["Hobbyist", "Enthusiast", "Pro"],
        geographies=["NA", "EMEA", "APAC"],
        kpis=[
            KpiSpec(name="Revenue", type="currency", favorable_direction="up", time_dim="OrderDate"),
            KpiSpec(name="Orders", type="number", favorable_direction="up", time_dim="OrderDate"),
            KpiSpec(name="AOV", type="currency", favorable_direction="up", time_dim="OrderDate"),
            KpiSpec(name="Return Rate", type="percent", favorable_direction="down", time_dim="OrderDate"),
        ],
        growth_trend_pct=12.0,
    )
