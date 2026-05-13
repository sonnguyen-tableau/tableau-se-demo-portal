"""Shared pydantic v2 models — IO contracts for the pipeline."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Industry(StrEnum):
    retail = "retail-ecommerce"
    banking = "retail-banking"
    manufacturing = "manufacturing"
    healthcare = "healthcare"
    logistics = "logistics"


class Stage(StrEnum):
    scrape = "scrape"
    profile = "profile"
    schema = "schema"
    confirm = "confirm"
    generate = "generate"
    hyper = "hyper"
    publish = "publish"
    workbook = "workbook"
    pulse = "pulse"
    brand = "brand"
    provision = "provision"


class StageStatus(StrEnum):
    pending = "pending"
    running = "running"
    ok = "ok"
    skipped = "skipped"
    error = "error"


class FactoryStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: HttpUrl
    tenant_slug: str | None = Field(default=None, max_length=48)


class FactoryStartResponse(BaseModel):
    job_id: str
    sse_url: str


class KpiSpec(BaseModel):
    name: str
    type: Literal["currency", "percent", "number"]
    favorable_direction: Literal["up", "down", "neutral"]
    time_dim: str | None = None


class CompanyProfile(BaseModel):
    """Output of stage 2 (Claude profile call)."""

    model_config = ConfigDict(extra="forbid")

    company_name: str
    company_url: str
    tagline: str | None = None
    logo_url: str | None = None
    industry: Industry
    sub_vertical: str | None = None
    products: list[str] = []
    segments: list[str] = []
    geographies: list[Literal["NA", "EMEA", "APAC", "LATAM"]] = []
    kpis: list[KpiSpec] = []
    market_events: list[dict[str, str | float]] = []
    growth_trend_pct: float = 0.0


class StageEvent(BaseModel):
    job_id: str
    stage: Stage
    status: StageStatus
    detail: str | None = None
    error: str | None = None
    ts_ms: int
    # Optional structured payload — currently used by the profile stage to
    # send the detected industry + KPI list to the review UI.
    payload: dict[str, object] | None = None


class ConfirmRequest(BaseModel):
    """Posted by the portal to /factory/{job_id}/confirm to resume after the
    review screen. `profile_override` is the user-edited profile.
    """

    model_config = ConfigDict(extra="forbid")

    profile_override: CompanyProfile | None = None


class BrandTheme(BaseModel):
    primary_color: str = "#1A56DB"
    secondary_color: str = "#F59E0B"
    neutral_color: str = "#0F172A"
    font_family: str = "Inter"
    logo_url: str | None = None
    tone: Literal["professional", "playful", "technical"] = "professional"
