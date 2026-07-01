---
name: Demo Factory Pipeline Debug
description: Use when a Demo Factory job is failing, stalling, or producing wrong output. Provides per-stage diagnostics for scrape, profile, schema, generate, hyper, publish, workbook-rewrite, pulse, brand, and provisioning, plus the env vars and log paths needed to triage.
---

# Demo Factory Pipeline Debug

The factory is a 10-stage pipeline running in `services/factory/`. Each stage has known failure modes; this skill gives you the fast path to root cause.

## Pipeline stages (numbered)

```
1. scrape          (Playwright)
2. profile         (Claude → structured JSON)
3. schema          (Claude → data model spec)
4. confirm         (UX pause for user review, Phase 9)
5. generate        (Python Faker + NumPy → CSV)
6. hyper           (Hyper API → .hyper file)
7. publish         (TSC → Tableau Cloud data source)
8. workbook        (Document API → rewrite template, publish .twbx)
9. pulse           (Pulse REST API → metric definitions)
10. brand          (Claude vision → palette + logo)
11. provision      (Tableau group + portal tenant record)
```

Each stage emits an SSE event to the portal and a JSON log line to `services/factory/logs/factory-<jobId>.jsonl`.

## Fast triage

```bash
# Find the job log
cat services/factory/logs/factory-<jobId>.jsonl | jq -c '{stage, status, error}'

# Identify the failing stage and skip ahead to the matching section below.
```

## Stage 1 — scrape

**Symptom:** job aborts immediately. Logs show `playwright` errors.
**Common causes:**
- Customer site blocks headless browsers (HTTP 403 / Cloudflare challenge).
- Customer site requires JS to render content; we wait for `domcontentloaded` but content needs `networkidle`.
- TLS handshake failures (corporate cert, etc.).

**Fix:**
```python
# services/factory/app/scrape.py
page.goto(url, wait_until="networkidle", timeout=30_000)
```
If Cloudflare blocks: fall back to `httpx` fetch of HTML + Playwright screenshot only. Some sites need a real user-agent string — already set.

## Stage 2 — profile

**Symptom:** Claude returns JSON that doesn't parse or doesn't match the schema.
**Fix:**
- Verify `ANTHROPIC_API_KEY` is set and the model is `claude-opus-4-5` (or current default).
- Pass `response_format` / `tool_use` for structured output instead of free-text — see `app/profile.py`.
- If Claude returns "I can't access that site", the scrape stage produced empty content — go back to stage 1.

## Stage 3 — schema

**Symptom:** generated data has nonsensical distributions.
**Fix:**
- Check the `dataModelHints` block — Claude may have produced contradictory values (e.g., `growthTrend: "negative"` + `expectedSeasonality: "always-up"`). The schema-validation step should reject these.
- Re-run the profile call with a temperature of 0.

## Stage 5 — generate

**Symptom:** OOM, slow generation, NaN values.
**Fix:**
- Row count out of bounds. Cap at 300K total per project policy.
- Use NumPy vectorized generation — never `for i in range(150_000)` with `Faker()` calls inline. See `app/generators/retail.py` for the canonical pattern.
- NaN typically comes from divide-by-zero in margin calcs. Floor denominators.

## Stage 6 — hyper

**Symptom:** `HyperException`, missing schema, type mismatch.
**Fix:**
- Verify all CSV columns map to a Hyper `SqlType`. Common gotcha: `Decimal` vs `Double` — use `SqlType.numeric(18, 2)` for currency.
- Multi-table Hyper requires foreign keys on the table inserter — without them, Tableau Server 2021.4+ won't auto-build the data model.
- Local Hyper API process binds a port; kill stale procs: `pkill -f hyperd`.

## Stage 7 — publish

**Symptom:** `403 Forbidden` from Tableau REST.
**Fix:**
- Service-account PAT expired or rotated. Update `TABLEAU_PAT_NAME` / `TABLEAU_PAT_SECRET`.
- Target project doesn't exist. Factory creates one per tenant: project name `tenant-<slug>`. If creation failed earlier, the publish will fail too.
- File > 64 MB. Use chunked upload (TSC handles this by default — make sure `Publisher` is not overridden).

## Stage 8 — workbook

**Symptom:** workbook published but views show "Field not found".
**Fix:**
- Template field-name contract drift — see `industry-template-author` skill.
- Connection rewrite didn't apply to all data sources. The template might have a secondary live connection that was missed:
  ```python
  for ds in wb.datasources:
      assert ds.connections, f"No connections on datasource {ds.name}"
  ```
- Run the contract test: `uv run pytest services/factory/tests/test_template_<industry>.py -k canonical`.

## Stage 9 — pulse

**Symptom:** `429 Too Many Requests`.
**Fix:** Pulse metric creation hits rate limits when >5 created concurrently. Use the batching helper in `pulse-metric-builder` skill (exponential backoff, max 3/sec).

**Symptom:** metric definition created but no metrics appear.
**Fix:** the definition needs at least one default `filter_specification` value to materialize a metric. See payload shape in `pulse-metric-builder`.

## Stage 10 — brand

**Symptom:** logo URL points to a tracking pixel or favicon.
**Fix:**
- The vision call should prefer the largest image in the hero region. If it returns a small/wrong asset, refine the prompt with size constraints.
- Fall back to extracting CSS variables / favicon if the vision call errors out.

## Stage 11 — provision

**Symptom:** tenant record created but portal can't see the dashboards.
**Fix:**
- The Tableau group must contain the new tenant users for permissions to flow. Verify with REST API `Get Users in Group`.
- Portal middleware may be caching tenant→site mapping; bust the cache or wait for TTL.

## Recovering a partial job

The pipeline checkpoints after every stage. To resume:

```bash
uv run python -m app.cli resume --job-id <jobId> --from-stage <n>
```

Use this when only stages 9 or 10 failed and you don't want to regenerate the data.

## Common cross-cutting issues

- **Concurrency** — more than 2-3 factory jobs in parallel saturate the Hyper writer. Use the queue (Phase 11).
- **Disk full** — `.hyper` files in `/tmp` aren't auto-cleaned. Cron `rm /tmp/*.hyper` older than 1 day.
- **Anthropic 429** — bump retry/backoff or reduce parallelism.

## Bugs flushed during MediaMart bring-up (2026-06-30 / 2026-07-01)

The retail-mediamart industry rollout uncovered 6 latent bugs in the pipeline. All fixed on `main`:

1. **`aiohttp` ImportError in provision** (`pipeline.py:_provision`) → replaced with `httpx.AsyncClient` (already a top-level dep).
2. **Workbook published into `tenant-{slug}` instead of `Demo/{company}`** → Cloud 403132. `run_workbook_stage(project_name=published_project)` now co-locates.
3. **Direct mode profile has empty `kpis`** → Pulse `created=0`. Added `_DEFAULT_KPIS: dict[Industry, list[KpiSpec]]` in `pipeline.py`.
4. **Publish workbook fails "Cannot find attribute port"** — Tableau viewer rejects `<connection class='hyper' server='localhost'/>`. Fix: workbook must reference published-datasource via `<connection class='sqlproxy'>` + `<repository-location>`. See `[[tableau-workbook-authoring-pitfalls]]`.
5. **Hand-authored Object-Model .tds relationships** rejected by Cloud with "Relationship clause contains an invalid calculation". No hand-written variant works. Workaround: factory ships flat .tdsx, user opens Tableau Desktop → drags tables → publishes. Or admin builds relationships manually in a workbook.
6. **`skip_connection_check=True` mandatory** when publishing workbooks that reference published-datasources (not embedded extracts). Otherwise 403132 at publish time.

Symptom of #4/5 in the wild: dashed-red join lines with `!` on every table in Data Source canvas; "6 Alerts" panel with "Relationship clause contains an invalid calculation".

Diagnostic: `views.populate_image(view)` — real content > 500 bytes; empty placeholder exactly 178 bytes.

## Related skills

- `industry-template-author` — workbook side of stage 8, includes 9-rule Cloud strict-mode pitfall checklist.
- `pulse-metric-builder` — stage 9 payload.
- `tableau-mcp-tools` — verifying the result via `query-datasource`.
- `tableau-desktop-author` — Layer-0 XSD validator (`scripts/validate_workbook.py`) + kit/ builders.
