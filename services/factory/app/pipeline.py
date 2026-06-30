"""Pipeline orchestrator.

Runs the 11 stages sequentially, emitting one `StageEvent` per transition.
Each stage is wrapped so its exception surfaces as `StageStatus.error` while
the orchestrator continues to emit a final pipeline-level error.

Phase 9 adds a "confirm" pause: after the profile stage emits `profile.ok`
with the structured payload, the pipeline yields `confirm.running` and waits
for `FactoryJob.confirm()` to be called (typically from the
`/factory/{job_id}/confirm` endpoint). The caller may supply an edited
`CompanyProfile`; if it does, the rest of the pipeline uses that profile.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import date, timedelta

from .brand import extract_brand, generate_tenant_design_md
from .config import Settings, get_settings
from .generators.banking import BankingParameters, generate_banking
from .generators.healthcare import HealthcareParameters, generate_healthcare
from .generators.logistics import LogisticsParameters, generate_logistics
from .generators.manufacturing import ManufacturingParameters, generate_manufacturing
from .generators.mediamart import MediaMartParameters, generate_mediamart
from .generators.retail import RetailParameters, generate_retail
from .generators.vincommerce import VinCommerceParameters, generate_vincommerce
from .hyper import is_available as hyper_available
from .hyper import write_hyper
from .models import (
    BrandTheme,
    CompanyProfile,
    DirectStartRequest,
    GeneratorParams,
    Industry,
    Stage,
    StageEvent,
    StageStatus,
)
from .profile import profile_company
from .publish import is_configured as tableau_configured
from .publish import publish_hyper
from .pulse import create_definitions
from .scrape import scrape_basic
from .workbook import TemplateContractError, run_workbook_stage

# Max time the pipeline waits for the user to submit the review form. Beyond
# this the job aborts and the user can restart.
CONFIRM_TIMEOUT_SECONDS = 600



def now_ms() -> int:
    return int(asyncio.get_event_loop().time() * 1000)


class FactoryJob:
    def __init__(
        self,
        job_id: str,
        url: str,
        tenant_slug: str,
        settings: Settings | None = None,
        site_id: str | None = None,
        admin_email: str | None = None,
        portal_url: str | None = None,
        # Direct mode — skip scrape/profile/confirm and use these directly.
        direct_profile: CompanyProfile | None = None,
        direct_brand: BrandTheme | None = None,
        direct_generator_params: GeneratorParams | None = None,
    ):
        self.job_id = job_id
        self.url = url
        self.tenant_slug = tenant_slug
        self.settings = settings or get_settings()
        self.site_id = site_id
        self.admin_email = admin_email
        self.portal_url = portal_url
        self._direct_profile = direct_profile
        self._direct_brand = direct_brand
        self._direct_generator_params = direct_generator_params or GeneratorParams()
        # Confirm-before-build coordination (Phase 9).
        self._confirm_event = asyncio.Event()
        self._profile: CompanyProfile | None = None
        self._profile_override: CompanyProfile | None = None
        self.require_confirm: bool = direct_profile is None  # skip confirm in direct mode

    @classmethod
    def from_direct(cls, job_id: str, req: DirectStartRequest, settings: Settings | None = None) -> "FactoryJob":
        """Create a FactoryJob from a DirectStartRequest, bypassing scrape/profile."""
        import re as _re

        def _slugify(s: str) -> str:
            out: list[str] = []
            for ch in s.lower():
                if ch.isalnum():
                    out.append(ch)
                elif out and out[-1] != "-":
                    out.append("-")
            return "".join(out).strip("-")[:48]

        slug = (req.tenant_slug or _slugify(req.company_name))[:48] or "demo"
        profile = CompanyProfile(
            company_name=req.company_name,
            company_url=req.company_url,
            industry=req.industry,
            tagline=req.tagline,
            logo_url=req.logo_url,
        )
        return cls(
            job_id=job_id,
            url=req.company_url,
            tenant_slug=slug,
            settings=settings,
            site_id=req.site_id,
            admin_email=req.admin_email,
            portal_url=req.portal_url,
            direct_profile=profile,
            direct_brand=req.brand,
            direct_generator_params=req.generator_params,
        )

    # ------------------------------------------------------------------
    # Public API used by the FastAPI layer.
    # ------------------------------------------------------------------

    def current_profile(self) -> CompanyProfile | None:
        """The most recent profile (override > LLM output > None)."""
        return self._profile_override or self._profile

    def confirm(self, profile_override: CompanyProfile | None) -> bool:
        """Resume the pipeline. Returns True if the pipeline was actually
        waiting; False if it has already moved past confirm.
        """
        if self._confirm_event.is_set():
            return False
        self._profile_override = profile_override
        self._confirm_event.set()
        return True

    async def run(self) -> AsyncIterator[StageEvent]:
        s = self.settings
        events: list[StageEvent] = []

        async def emit(stage: Stage, status: StageStatus, **kw: object) -> StageEvent:
            ev = StageEvent(
                job_id=self.job_id,
                stage=stage,
                status=status,
                ts_ms=now_ms(),
                **kw,  # type: ignore[arg-type]
            )
            events.append(ev)
            return ev

        # Local reference; the active profile is the override (if any) by
        # the time we reach the generator branch.
        profile: CompanyProfile
        scrape = None

        # Direct mode: skip scrape / profile / confirm — use supplied values.
        if self._direct_profile is not None:
            yield await emit(Stage.scrape, StageStatus.skipped, detail="direct mode — no scrape")
            yield await emit(Stage.profile, StageStatus.skipped, detail="direct mode — profile supplied by caller")
            yield await emit(Stage.schema, StageStatus.skipped, detail="direct mode")
            yield await emit(Stage.confirm, StageStatus.skipped, detail="direct mode — no confirmation required")
            profile = self._direct_profile
        else:
            # 1. scrape
            yield await emit(Stage.scrape, StageStatus.running)
            try:
                scrape = await scrape_basic(self.url)
                yield await emit(Stage.scrape, StageStatus.ok, detail=f"title={scrape.title!r}")
            except Exception as e:
                yield await emit(Stage.scrape, StageStatus.error, error=str(e))
                return

            # 2. profile
            yield await emit(Stage.profile, StageStatus.running)
            try:
                profile = await profile_company(scrape, s)
                self._profile = profile
                yield await emit(
                    Stage.profile,
                    StageStatus.ok,
                    detail=f"industry={profile.industry.value} kpis={len(profile.kpis)}",
                    payload=profile.model_dump(mode="json"),
                )
            except Exception as e:
                yield await emit(Stage.profile, StageStatus.error, error=str(e))
                return

            # 3. schema (static per industry; Claude-driven customization later.)
            yield await emit(Stage.schema, StageStatus.running)
            yield await emit(Stage.schema, StageStatus.ok, detail=f"using static schema for {profile.industry.value}")

        # 4. confirm — wait for the user to review/edit the profile, then
        # resume with the (possibly edited) profile.
        if self.require_confirm:
            yield await emit(
                Stage.confirm,
                StageStatus.running,
                detail="awaiting user confirmation",
            )
            try:
                await asyncio.wait_for(
                    self._confirm_event.wait(), timeout=CONFIRM_TIMEOUT_SECONDS
                )
            except TimeoutError:
                yield await emit(
                    Stage.confirm,
                    StageStatus.error,
                    error=f"timed out after {CONFIRM_TIMEOUT_SECONDS}s without confirmation",
                )
                return
            if self._profile_override is not None:
                profile = self._profile_override
                yield await emit(
                    Stage.confirm,
                    StageStatus.ok,
                    detail=f"resumed with user override: industry={profile.industry.value} kpis={len(profile.kpis)}",
                    payload=profile.model_dump(mode="json"),
                )
            else:
                yield await emit(
                    Stage.confirm,
                    StageStatus.ok,
                    detail="resumed without overrides",
                )
        else:
            yield await emit(
                Stage.confirm, StageStatus.skipped, detail="confirm not required"
            )

        # 5. generate
        yield await emit(Stage.generate, StageStatus.running)
        try:
            tables, row_count = self._generate_for(profile)
            yield await emit(
                Stage.generate,
                StageStatus.ok,
                detail=f"rows={row_count} tables={','.join(tables.keys())}",
            )
        except Exception as e:
            yield await emit(Stage.generate, StageStatus.error, error=str(e))
            return

        # 6. hyper — write all tables. Tableau Cloud needs the multi-table
        # extract wrapped in a .tdsx (with relationships) at publish time;
        # bare-.hyper uploads only accept a single fact table.
        yield await emit(Stage.hyper, StageStatus.running)
        hyper_path = s.factory_data_dir / f"{self.tenant_slug}.hyper"
        hyper_ok = False
        if not hyper_available():
            yield await emit(
                Stage.hyper,
                StageStatus.skipped,
                detail="tableauhyperapi unavailable; data generated only in memory.",
            )
        else:
            try:
                # Hyper API is sync + CPU-heavy.
                await asyncio.to_thread(write_hyper, tables, hyper_path)
                yield await emit(Stage.hyper, StageStatus.ok, detail=f"wrote {hyper_path}")
                hyper_ok = True
            except Exception as e:
                # Recoverable: downstream stages that need the extract skip;
                # the rest of the pipeline (pulse, brand, provision) still runs.
                yield await emit(
                    Stage.hyper,
                    StageStatus.error,
                    error=str(e),
                    detail="downstream publish/workbook will be skipped",
                )

        # 7. publish — project folder = "Demo/{company_name}" so all demos
        # live under a shared parent and tenants can be filtered by folder.
        yield await emit(Stage.publish, StageStatus.running)
        published_id = ""
        published_name = ""
        published_project = ""
        publish_ok = False
        tableau_project_name = f"Demo/{profile.company_name}"
        if not tableau_configured(s):
            yield await emit(
                Stage.publish,
                StageStatus.skipped,
                detail="Tableau credentials not configured; skipping publish.",
            )
        elif not hyper_ok:
            yield await emit(
                Stage.publish,
                StageStatus.skipped,
                detail="no .hyper extract available; skipping publish.",
            )
        else:
            try:
                result = await asyncio.to_thread(
                    publish_hyper,
                    hyper_path,
                    tenant_slug=self.tenant_slug,
                    industry=profile.industry,
                    settings=s,
                    project_name=tableau_project_name,
                )
                published_id = result.datasource_id
                published_name = result.datasource_name
                published_project = result.project_name
                publish_ok = not result.skipped
                yield await emit(
                    Stage.publish,
                    StageStatus.ok if publish_ok else StageStatus.skipped,
                    detail=f"datasource_id={result.datasource_id} project={result.project_name}",
                )
            except Exception as e:
                yield await emit(Stage.publish, StageStatus.error, error=str(e))

        # 8. workbook — rewrite per-industry .twb against the published
        # datasource and republish to the tenant project. Skipped gracefully
        # when (a) the industry has no template authored yet, or (b) the
        # publish stage above didn't actually publish a datasource.
        yield await emit(Stage.workbook, StageStatus.running)
        if not publish_ok:
            yield await emit(
                Stage.workbook,
                StageStatus.skipped,
                detail="no published datasource to bind workbook to.",
            )
        else:
            try:
                wb_result = await asyncio.to_thread(
                    run_workbook_stage,
                    industry=profile.industry.value,
                    tenant_slug=self.tenant_slug,
                    datasource_name=published_name,
                    settings=s,
                )
                yield await emit(
                    Stage.workbook,
                    StageStatus.skipped if wb_result.skipped else StageStatus.ok,
                    detail=(
                        wb_result.reason
                        if wb_result.skipped
                        else f"workbook_id={wb_result.workbook_id} project={wb_result.project_name}"
                    ),
                )
            except TemplateContractError as e:
                # Contract violation is a hard error — never publish a
                # template that bypasses RLS or references missing fields.
                yield await emit(
                    Stage.workbook,
                    StageStatus.error,
                    error=f"template contract violation: {e}",
                )
            except Exception as e:
                yield await emit(Stage.workbook, StageStatus.error, error=str(e))

        # 9. pulse
        yield await emit(Stage.pulse, StageStatus.running)
        try:
            pulse_result = await create_definitions(
                tenant_slug=self.tenant_slug,
                industry=profile.industry.value,
                datasource_id=published_id,
                kpis=profile.kpis,
                settings=s,
            )
            yield await emit(
                Stage.pulse,
                StageStatus.skipped if pulse_result.skipped else StageStatus.ok,
                detail=pulse_result.reason or f"created={len(pulse_result.created)}",
            )
        except Exception as e:
            yield await emit(Stage.pulse, StageStatus.error, error=str(e))

        # 10. brand — use caller-supplied theme in direct mode, else extract.
        theme = None
        yield await emit(Stage.brand, StageStatus.running)
        if self._direct_brand is not None:
            theme = self._direct_brand
            yield await emit(
                Stage.brand,
                StageStatus.ok,
                detail=f"direct mode — primary={theme.primary_color} font={theme.font_family} tone={theme.tone}",
                payload=theme.model_dump(mode="json"),
            )
        elif scrape is not None:
            try:
                theme = await extract_brand(scrape, s)
                yield await emit(
                    Stage.brand,
                    StageStatus.ok,
                    detail=f"primary={theme.primary_color} font={theme.font_family} tone={theme.tone}",
                    payload=theme.model_dump(mode="json"),
                )
            except Exception as e:
                yield await emit(Stage.brand, StageStatus.error, error=str(e))
        else:
            yield await emit(Stage.brand, StageStatus.skipped, detail="no scrape result and no direct brand supplied")

        # 11. provision — create tenant record, apply brand, wire first user.
        yield await emit(Stage.provision, StageStatus.running)
        try:
            provision_result = await self._provision(profile, theme, published_project)
            yield await emit(
                Stage.provision,
                StageStatus.skipped if provision_result.get("skipped") else StageStatus.ok,
                detail=provision_result.get("detail", ""),
                payload=provision_result,
            )
        except Exception as e:
            yield await emit(Stage.provision, StageStatus.error, error=str(e))

    async def _provision(
        self,
        profile: CompanyProfile,
        theme: object | None,
        published_project: str = "",
    ) -> dict[str, object]:
        """Call back to the portal to create the tenant record + apply brand + create admin user."""
        import logging
        import urllib.parse

        import httpx

        if not self.portal_url:
            return {
                "skipped": True,
                "detail": "portal_url not set — tenant record not provisioned automatically",
            }

        base = self.portal_url.rstrip("/")
        slug = self.tenant_slug
        headers = {"Content-Type": "application/json", "X-Factory-Secret": self._factory_secret()}

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as session:
            # 1. Upsert tenant record
            tenant_payload: dict[str, object] = {
                "slug": slug,
                "name": profile.company_name,
                "industry": profile.industry.value,
                "sourceUrl": profile.company_url,
            }
            if self.site_id:
                tenant_payload["siteId"] = self.site_id

            r = await session.post(
                f"{base}/api/admin/provision/tenant", json=tenant_payload, headers=headers
            )
            if r.status_code not in (200, 201):
                raise RuntimeError(f"tenant upsert failed ({r.status_code}): {r.text[:200]}")

            # 1b. Wire allowedProjects so this tenant only sees its own folder
            if published_project:
                patch_payload = {"allowedProjects": [published_project]}
                r = await session.patch(
                    f"{base}/api/admin/tenants/{urllib.parse.quote(slug)}",
                    json=patch_payload,
                    headers=headers,
                )
                if r.status_code not in (200, 201):
                    logging.getLogger(__name__).warning(
                        "allowedProjects patch failed (%d): %s", r.status_code, r.text[:200]
                    )

            # 2. Apply brand theme if extracted
            if theme is not None:
                from .models import BrandTheme
                t: BrandTheme = theme  # type: ignore[assignment]
                theme_payload = {
                    "tenantId": slug,
                    "companyName": profile.company_name,
                    "primaryColor": t.primary_color,
                    "secondaryColor": t.secondary_color,
                    "neutralColor": t.neutral_color,
                    "fontFamily": t.font_family,
                    "tone": t.tone,
                    **({"logoUrl": t.logo_url} if t.logo_url else {}),
                }
                r = await session.put(
                    f"{base}/api/admin/provision/theme", json=theme_payload, headers=headers
                )
                if r.status_code not in (200, 201):
                    raise RuntimeError(f"theme apply failed ({r.status_code}): {r.text[:200]}")

            # 3. Create admin user if requested
            if self.admin_email:
                import secrets as _secrets
                temp_password = _secrets.token_urlsafe(16)
                user_payload = {
                    "email": self.admin_email,
                    "password": temp_password,
                    "tenantId": slug,
                    "tenantName": profile.company_name,
                    "groups": ["admin"],
                }
                r = await session.put(
                    f"{base}/api/admin/provision/user", json=user_payload, headers=headers
                )
                if r.status_code not in (200, 201):
                    raise RuntimeError(f"user create failed ({r.status_code}): {r.text[:200]}")
            else:
                temp_password = None

            # 4. Store per-tenant DESIGN.md for AI chat context
            if theme is not None:
                from .models import BrandTheme
                t2: BrandTheme = theme  # type: ignore[assignment]
                design_content = generate_tenant_design_md(
                    company_name=profile.company_name,
                    source_url=profile.company_url,
                    industry=profile.industry.value,
                    theme=t2,
                )
                r = await session.post(
                    f"{base}/api/admin/provision/design",
                    json={"tenantId": slug, "content": design_content},
                    headers=headers,
                )
                if r.status_code not in (200, 201):
                    # Non-fatal — log but don't abort the provision stage.
                    logging.getLogger(__name__).warning(
                        "design.md storage failed (%d): %s", r.status_code, r.text[:200]
                    )

        portal_tenant_url = f"{base}/t/{urllib.parse.quote(slug)}"
        result: dict[str, object] = {
            "skipped": False,
            "detail": f"tenant={slug} portal={portal_tenant_url}",
            "tenant_slug": slug,
            "portal_url": portal_tenant_url,
            "company_name": profile.company_name,
            "industry": profile.industry.value,
        }
        if self.admin_email:
            result["admin_email"] = self.admin_email
            result["temp_password"] = temp_password
        return result

    def _factory_secret(self) -> str:
        import os
        return os.environ.get("FACTORY_PROVISION_SECRET", "")

    def _generate_for(self, profile: CompanyProfile) -> tuple[dict[str, object], int]:
        end = date.today()
        start = end - timedelta(days=730)
        p = self._direct_generator_params  # may be empty GeneratorParams()

        def _ov(field: str, default: object) -> object:
            """Return override value if set, else default."""
            v = getattr(p, field, None)
            return v if v is not None else default

        if profile.industry is Industry.retail:
            tables = generate_retail(
                RetailParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    base_daily_orders=int(_ov("base_daily_orders", 70)),
                    seed=int(_ov("seed", 42)),
                    yoy_growth_pct=float(_ov("yoy_growth_pct", 12.0)),
                )
            ).all_tables()
        elif profile.industry is Industry.mediamart:
            tables = generate_mediamart(
                MediaMartParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    n_customers=int(_ov("n_customers_mediamart", 4_500)),
                    n_stores=int(_ov("n_stores_mediamart", 28)),
                    n_products=int(_ov("n_products_mediamart", 320)),
                    base_daily_orders=int(_ov("base_daily_orders", 90)),
                    yoy_growth_pct=float(_ov("yoy_growth_pct", 16.0)),
                    oos_rate=float(_ov("oos_rate_pct", 25.0)) / 100.0,
                    seed=int(_ov("seed", 42)),
                )
            ).all_tables()
        elif profile.industry is Industry.mall:
            tables = generate_vincommerce(
                VinCommerceParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    n_winmart=int(_ov("n_winmart", 12)),
                    n_winmart_plus=int(_ov("n_winmart_plus", 85)),
                    n_malls=int(_ov("n_malls", 6)),
                    n_products=int(_ov("n_products", 3_000)),
                    n_lessees=int(_ov("n_lessees", 280)),
                    base_daily_sales_winmart=int(_ov("base_daily_sales_winmart", 1_800)),
                    base_daily_sales_winmart_plus=int(_ov("base_daily_sales_winmart_plus", 320)),
                    target_occupancy_rate=float(_ov("target_occupancy_rate", 0.87)),
                    yoy_growth_pct=float(_ov("yoy_growth_pct", 8.0)),
                    seed=int(_ov("seed", 42)),
                )
            ).all_tables()
        elif profile.industry is Industry.banking:
            geo_raw = _ov("geographies", None)
            geo: tuple[str, ...] = tuple(geo_raw) if geo_raw is not None else ("NA", "EMEA", "APAC")  # type: ignore[arg-type]
            tables = generate_banking(
                BankingParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    base_daily_transactions=int(_ov("base_daily_transactions", 320)),
                    seed=int(_ov("seed", 42)),
                    geographies=geo,
                )
            ).all_tables()
        elif profile.industry is Industry.manufacturing:
            tables = generate_manufacturing(
                ManufacturingParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    n_plants=int(_ov("n_plants", 8)),
                    lines_per_plant=int(_ov("lines_per_plant", 6)),
                    n_products=int(_ov("n_products", 60)),
                    n_suppliers=int(_ov("n_suppliers", 24)),
                    seed=int(_ov("seed", 42)),
                )
            ).all_tables()
        elif profile.industry is Industry.healthcare:
            tables = generate_healthcare(
                HealthcareParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    n_patients=int(_ov("n_patients", 4_200)),
                    n_providers=int(_ov("n_providers", 180)),
                    n_beds=int(_ov("n_beds", 320)),
                    seed=int(_ov("seed", 42)),
                )
            ).all_tables()
        elif profile.industry is Industry.logistics:
            tables = generate_logistics(
                LogisticsParameters(
                    tenant_id=self.tenant_slug,
                    start_date=start,
                    end_date=end,
                    n_carriers=int(_ov("n_carriers", 18)),
                    n_hubs=int(_ov("n_hubs", 14)),
                    n_lanes=int(_ov("n_lanes", 70)),
                    n_vehicles=int(_ov("n_vehicles", 240)),
                    n_customers=int(_ov("n_customers", 380)),
                    seed=int(_ov("seed", 42)),
                )
            ).all_tables()
        else:
            raise NotImplementedError(f"No generator for {profile.industry.value}")

        row_count = sum(len(t) for t in tables.values())
        return tables, row_count
