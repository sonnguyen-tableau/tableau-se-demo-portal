# Factory Service

Python FastAPI sidecar that owns the Demo Factory pipeline:

```
scrape → profile → schema → confirm → generate → hyper → publish → workbook → pulse → brand → provision
```

See:
- `.claude/skills/factory-pipeline-debug/SKILL.md` for stage-by-stage diagnostics.
- `.claude/skills/industry-template-author/SKILL.md` for the workbook template contract.
- `.claude/skills/pulse-metric-builder/SKILL.md` for Pulse metric payloads.

## Setup

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Local test (no real Tableau / Anthropic credentials)

```bash
uv run pytest -q
```

Tests skip Tableau/Anthropic-bound code paths automatically.

## Environment

| Var | Purpose | Required? |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Profile / schema / brand calls | Optional (skipped if absent) |
| `TABLEAU_SITE_URL` | Tableau Cloud origin | Required for publish |
| `TABLEAU_SITE_NAME` | Site contentUrl | Required for publish |
| `TABLEAU_PAT_NAME` | Service-account PAT name | Required for publish |
| `TABLEAU_PAT_SECRET` | Service-account PAT secret | Required for publish |
| `FACTORY_DATA_DIR` | Where `.hyper` outputs land | Default `/tmp/factory` |
