"""FastAPI entry point for the factory sidecar."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .config import get_settings
from .models import ConfirmRequest, DirectStartRequest, FactoryStartRequest, FactoryStartResponse
from .pipeline import FactoryJob

app = FastAPI(title="tableau-ai-portal factory", version="0.1.0")


# Holds active jobs in-process so the SSE endpoint can attach. Phase 11 swaps
# this for a durable queue (Redis Streams or Postgres LISTEN/NOTIFY).
_JOBS: dict[str, FactoryJob] = {}

# Maximum number of factory jobs that may run concurrently. Hyper writes and
# the LLM calls are CPU- and rate-bound, so a small cap prevents resource
# exhaustion. Override via FACTORY_MAX_CONCURRENT env var.
_MAX_CONCURRENT_JOBS = 3
_JOB_SLOTS = asyncio.Semaphore(_MAX_CONCURRENT_JOBS)


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "factory",
        "phase": "11",
        "active_jobs": len(_JOBS),
        "max_concurrent": _MAX_CONCURRENT_JOBS,
    }


@app.post("/factory/start", response_model=FactoryStartResponse)
async def start_factory(req: FactoryStartRequest) -> FactoryStartResponse:
    if len(_JOBS) >= _MAX_CONCURRENT_JOBS:
        raise HTTPException(
            status_code=503,
            detail=f"Factory is at capacity ({_MAX_CONCURRENT_JOBS} concurrent). Retry later.",
        )
    settings = get_settings()
    slug = (req.tenant_slug or _slugify(str(req.url)))[:48] or "demo"
    job_id = uuid.uuid4().hex[:12]
    _JOBS[job_id] = FactoryJob(
        job_id=job_id,
        url=str(req.url),
        tenant_slug=slug,
        settings=settings,
        site_id=req.site_id,
        admin_email=req.admin_email,
        portal_url=req.portal_url,
    )
    return FactoryStartResponse(job_id=job_id, sse_url=f"/factory/{job_id}/events")


@app.post("/factory/direct", response_model=FactoryStartResponse)
async def start_direct(req: DirectStartRequest) -> FactoryStartResponse:
    """Direct mode: skip scrape/profile/confirm, jump straight to generate."""
    if len(_JOBS) >= _MAX_CONCURRENT_JOBS:
        raise HTTPException(
            status_code=503,
            detail=f"Factory is at capacity ({_MAX_CONCURRENT_JOBS} concurrent). Retry later.",
        )
    settings = get_settings()
    job_id = uuid.uuid4().hex[:12]
    _JOBS[job_id] = FactoryJob.from_direct(job_id=job_id, req=req, settings=settings)
    return FactoryStartResponse(job_id=job_id, sse_url=f"/factory/{job_id}/events")


@app.get("/factory/{job_id}/profile")
async def factory_profile(job_id: str) -> dict[str, object]:
    """Return the most recent profile for a job. Used by the review UI."""
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    p = job.current_profile()
    if p is None:
        raise HTTPException(status_code=425, detail="profile not yet available")
    return p.model_dump(mode="json")


@app.post("/factory/{job_id}/confirm")
async def factory_confirm(job_id: str, req: ConfirmRequest) -> dict[str, object]:
    """Resume the pipeline with the (possibly edited) profile."""
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")
    accepted = job.confirm(req.profile_override)
    return {"accepted": accepted, "job_id": job_id}


@app.get("/factory/{job_id}/events")
async def factory_events(job_id: str) -> StreamingResponse:
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown job")

    async def stream() -> AsyncIterator[bytes]:
        # Reserve a concurrency slot. If the cap is reached the connection
        # waits — we don't reject here because the start endpoint enforces
        # quick rejection of pending jobs that would exceed capacity.
        async with _JOB_SLOTS:
            try:
                async for event in job.run():
                    yield f"data: {event.model_dump_json()}\n\n".encode()
                yield (
                    b'data: {"job_id":"' + job_id.encode()
                    + b'","stage":"done","status":"ok","ts_ms":0}\n\n'
                )
            except Exception as e:  # pragma: no cover — defensive
                payload = json.dumps(
                    {
                        "job_id": job_id,
                        "stage": "done",
                        "status": "error",
                        "error": str(e),
                        "ts_ms": 0,
                    }
                )
                yield f"data: {payload}\n\n".encode()
            finally:
                _JOBS.pop(job_id, None)

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)


def _slugify(s: str) -> str:
    out: list[str] = []
    for ch in s.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-")[:48]


__all__ = ["app"]


# Convenience: allow `python -m app.main` to run the dev server.
if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
    _ = asyncio  # silence unused import in module-not-run path
