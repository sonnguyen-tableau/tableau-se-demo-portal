"""Smoke test: drive the pipeline end-to-end without any external network.

We monkey-patch `scrape_basic` to return a fake page, leave Anthropic
unconfigured (the profile stage falls back), and trust the generator + the
skip behavior of Hyper/Publish/Pulse stages when credentials are absent.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.models import Stage, StageStatus
from app.pipeline import FactoryJob
from app.scrape import ScrapeResult


class _FakeSettings(Settings):
    pass


@pytest.fixture
def fake_settings(tmp_path):
    s = Settings(
        portal_env="dev",
        factory_data_dir=tmp_path,
        anthropic_api_key=None,
        tableau_site_url=None,
        tableau_site_name=None,
        tableau_pat_name=None,
        tableau_pat_secret=None,
        target_row_count=200_000,
    )
    return s


async def test_pipeline_runs_all_stages(monkeypatch, fake_settings):
    async def fake_scrape(_url, **_kw):
        return ScrapeResult(
            html="<html><title>Acme Bikes</title><body>We sell bicycles.</body></html>",
            title="Acme Bikes",
            final_url="https://example.com/",
        )

    monkeypatch.setattr("app.pipeline.scrape_basic", fake_scrape)

    job = FactoryJob(
        job_id="test-1", url="https://example.com/", tenant_slug="test", settings=fake_settings
    )

    # Phase 9: the pipeline now pauses at confirm. Auto-confirm from the test.
    import asyncio as _asyncio

    async def _auto_confirm() -> None:
        # Wait until the profile is available, then resume.
        for _ in range(100):
            if job.current_profile() is not None:
                job.confirm(None)
                return
            await _asyncio.sleep(0.01)

    auto = _asyncio.create_task(_auto_confirm())

    events = []
    async for ev in job.run():
        events.append(ev)
    await auto

    stages_seen = {(e.stage, e.status) for e in events}
    # Required transitions
    assert (Stage.scrape, StageStatus.running) in stages_seen
    assert (Stage.scrape, StageStatus.ok) in stages_seen
    assert (Stage.profile, StageStatus.ok) in stages_seen
    assert (Stage.generate, StageStatus.ok) in stages_seen

    # Phase 9: confirm should reach `ok` because the test auto-resumes.
    final_stages = {e.stage: e.status for e in events if e.status != StageStatus.running}
    assert final_stages[Stage.confirm] == StageStatus.ok
    # Hyper / publish / pulse / brand / workbook / provision are all skipped
    # when credentials aren't configured (or when the stage is Phase >7).
    assert final_stages[Stage.publish] == StageStatus.skipped
    assert final_stages[Stage.pulse] == StageStatus.skipped
    # Brand uses the deterministic fallback when Anthropic is absent → ok.
    assert final_stages[Stage.brand] == StageStatus.ok
    assert final_stages[Stage.workbook] == StageStatus.skipped
    assert final_stages[Stage.provision] == StageStatus.skipped

    # No stage may report an error in this stub environment.
    assert not [e for e in events if e.status == StageStatus.error]
