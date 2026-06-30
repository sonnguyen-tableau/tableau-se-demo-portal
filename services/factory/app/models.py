"""Shared pydantic v2 models — IO contracts for the pipeline."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Industry(StrEnum):
    retail = "retail-ecommerce"
    banking = "retail-banking"
    mall = "retail-mall"
    mediamart = "retail-mediamart"
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
    # Optional provision metadata — when supplied the pipeline auto-wires
    # the tenant record, theme, and first user after brand extraction.
    site_id: str | None = Field(default=None, max_length=48)
    admin_email: str | None = Field(default=None, max_length=320)
    # Portal base URL for the provision callback (e.g. https://portal.example.com)
    portal_url: str | None = Field(default=None, max_length=512)


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


class GeneratorParams(BaseModel):
    """Industry-specific numeric overrides. All fields optional — defaults
    come from each generator's @dataclass. Only the params relevant to the
    chosen industry are used; extras are silently ignored."""

    model_config = ConfigDict(extra="allow")

    # Common
    seed: int | None = None
    yoy_growth_pct: float | None = None

    # Retail e-commerce
    base_daily_orders: int | None = None

    # Retail banking
    base_daily_transactions: int | None = None
    geographies: list[str] | None = None

    # Retail mall (VinCommerce)
    n_winmart: int | None = None
    n_winmart_plus: int | None = None
    n_malls: int | None = None
    n_products: int | None = None
    n_lessees: int | None = None
    base_daily_sales_winmart: int | None = None
    base_daily_sales_winmart_plus: int | None = None
    target_occupancy_rate: float | None = None

    # Manufacturing
    n_plants: int | None = None
    lines_per_plant: int | None = None
    n_suppliers: int | None = None

    # Healthcare
    n_patients: int | None = None
    n_providers: int | None = None
    n_beds: int | None = None

    # Logistics
    n_carriers: int | None = None
    n_hubs: int | None = None
    n_lanes: int | None = None
    n_vehicles: int | None = None
    n_customers: int | None = None

    # Retail MediaMart — consumer-electronics in Vietnam (Tier + Churn + Loyalty + OOS)
    n_customers_mediamart: int | None = None
    n_stores_mediamart: int | None = None
    n_products_mediamart: int | None = None
    oos_rate_pct: float | None = None


class DirectStartRequest(BaseModel):
    """Direct-mode start: caller supplies all parameters explicitly.

    Stages scrape / profile / confirm are skipped. The pipeline jumps
    straight to generate → hyper → publish → workbook → pulse → brand → provision.
    """

    model_config = ConfigDict(extra="forbid")

    # Identity
    company_name: str = Field(min_length=1, max_length=120)
    company_url: str = Field(max_length=2048)
    industry: Industry
    tagline: str | None = Field(default=None, max_length=280)
    logo_url: str | None = Field(default=None, max_length=2048)

    # Generator tuning
    generator_params: GeneratorParams = Field(default_factory=GeneratorParams)

    # Brand override (skips Claude vision extraction)
    brand: BrandTheme | None = None

    # Provision metadata
    tenant_slug: str | None = Field(default=None, max_length=48)
    site_id: str | None = Field(default=None, max_length=48)
    admin_email: str | None = Field(default=None, max_length=320)
    portal_url: str | None = Field(default=None, max_length=512)
