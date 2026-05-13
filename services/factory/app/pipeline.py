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

from .brand import extract_brand
from .config import Settings, get_settings
from .generators.banking import BankingParameters, generate_banking
from .generators.healthcare import HealthcareParameters, generate_healthcare
from .generators.logistics import LogisticsParameters, generate_logistics
from .generators.manufacturing import ManufacturingParameters, generate_manufacturing
from .generators.retail import RetailParameters, generate_retail
from .hyper import is_available as hyper_available
from .hyper import write_hyper
from .models import (
    CompanyProfile,
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

# Max time the pipeline waits for the user to submit the review form. Beyond
# this the job aborts and the user can restart.
CONFIRM_TIMEOUT_SECONDS = 600


def now_ms() -> int:
    return int(asyncio.get_event_loop().time() * 1000)


class FactoryJob:
    def __init__(self, job_id: str, url: str, tenant_slug: str, settings: Settings | None = None):
        self.job_id = job_id
        self.url = url
        self.tenant_slug = tenant_slug
        self.settings = settings or get_settings()
        # Confirm-before-build coordination (Phase 9).
        self._confirm_event = asyncio.Event()
        self._profile: CompanyProfile | None = None
        self._profile_override: CompanyProfile | None = None
        self.require_confirm: bool = True

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

        # 6. hyper
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

        # 7. publish
        yield await emit(Stage.publish, StageStatus.running)
        published_id = ""
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
                    settings=s,
                )
                published_id = result.datasource_id
                yield await emit(
                    Stage.publish,
                    StageStatus.ok if not result.skipped else StageStatus.skipped,
                    detail=f"datasource_id={result.datasource_id} project={result.project_name}",
                )
            except Exception as e:
                yield await emit(Stage.publish, StageStatus.error, error=str(e))

        # 8. workbook — Phase 8 wires per-industry .twb templates.
        yield await emit(
            Stage.workbook,
            StageStatus.skipped,
            detail="workbook templating arrives in Phase 8 (this is Phase 7 MVP)",
        )

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

        # 10. brand
        yield await emit(Stage.brand, StageStatus.running)
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

        # 11. provision — Phase 11 wires the tenant record.
        yield await emit(
            Stage.provision,
            StageStatus.skipped,
            detail="tenant record provisioning arrives in Phase 11",
        )

    def _generate_for(self, profile: CompanyProfile) -> tuple[dict[str, object], int]:
        end = date.today()
        start = end - timedelta(days=730)

        if profile.industry is Industry.retail:
            tables = generate_retail(
                RetailParameters(tenant_id=self.tenant_slug, start_date=start, end_date=end)
            ).all_tables()
        elif profile.industry is Industry.banking:
            tables = generate_banking(
                BankingParameters(tenant_id=self.tenant_slug, start_date=start, end_date=end)
            ).all_tables()
        elif profile.industry is Industry.manufacturing:
            tables = generate_manufacturing(
                ManufacturingParameters(tenant_id=self.tenant_slug, start_date=start, end_date=end)
            ).all_tables()
        elif profile.industry is Industry.healthcare:
            tables = generate_healthcare(
                HealthcareParameters(tenant_id=self.tenant_slug, start_date=start, end_date=end)
            ).all_tables()
        elif profile.industry is Industry.logistics:
            tables = generate_logistics(
                LogisticsParameters(tenant_id=self.tenant_slug, start_date=start, end_date=end)
            ).all_tables()
        else:
            raise NotImplementedError(f"No generator for {profile.industry.value}")

        row_count = sum(len(t) for t in tables.values())
        return tables, row_count
