---
name: Tableau Pulse Metric Definition Builder
description: Use when creating, updating, or batch-publishing Tableau Pulse metric definitions via the REST API for a freshly generated tenant. Documents payload shape, allowed measure types, favorable-direction rules, filter_specification, batching with exponential backoff to avoid rate limits, and how Pulse personalization plugs into the AI agent.
---

# Tableau Pulse Metric Definition Builder

The Demo Factory creates Pulse metric definitions per generated tenant so the AI agent has industry-relevant KPIs to summarize, anomaly-detect, and brief on. This skill covers the payload, batching, and verification.

## When to use

- Adding a new KPI to an industry template.
- Implementing/maintaining `services/factory/app/pulse.py` (stage 9 of the pipeline).
- Investigating "no Pulse insights appear on tenant landing page".
- Surfacing Pulse insights inside the chat agent.

## Endpoint

```
POST {site_url}/api/-/pulse/definitions
Headers:
  X-Tableau-Auth: <session-token>     # service-account session
Content-Type: application/json
```

Use `tableauserverclient` (`tsc.PulseMetricDefinitions.create`) — it handles auth and pagination.

## Payload shape

```jsonc
{
  "metadata": {
    "name": "Revenue",
    "description": "Total revenue across orders. Drill down by Region, Channel, Segment.",
    "ext_assigned_id": "retail-revenue-v1"     // our idempotency key
  },
  "specification": {
    "datasource": { "id": "<datasource-luid>" },
    "basic_specification": {
      "measure":   { "field": "LineTotal", "aggregation": "SUM" },
      "time_dimension": { "field": "OrderDate" },
      "filters": []
    },
    "viz_state_specification": { "viz_state_string": "" },
    "is_running_total": false
  },
  "extension_options": {
    "allowed_dimensions": ["Region", "Channel", "Segment", "Category"],
    "allowed_granularities": ["DAY", "WEEK", "MONTH", "QUARTER"],
    "offset_from_today": 0
  },
  "representation_options": {
    "type": "NUMBER_FORMAT_TYPE_CURRENCY",
    "number_units": { "singular_noun": "USD", "plural_noun": "USD" },
    "sentiment_type": "SENTIMENT_TYPE_UP_IS_GOOD",         // favorable direction
    "row_level_id_field": { "identifier_col": "OrderId", "identifier_label": "Order" },
    "row_level_entity_names": { "entity_name_singular": "Order", "entity_name_plural": "Orders" }
  },
  "insights_options": {
    "show_insights": true,
    "settings": []
  }
}
```

## Per-industry favorable direction reference

| Metric type | `sentiment_type` |
| --- | --- |
| Revenue, Orders, AOV, Deposit Growth, Output Volume, OEE, Patient Volume, On-Time Delivery % | `SENTIMENT_TYPE_UP_IS_GOOD` |
| Churn, NPL Ratio, Defect Rate, Readmission Rate, Damage/Loss Rate, Cost per Shipment | `SENTIMENT_TYPE_DOWN_IS_GOOD` |
| Pricing parity, Capacity Utilization (target range) | `SENTIMENT_TYPE_NEUTRAL` |

## Number formats

- `NUMBER_FORMAT_TYPE_CURRENCY` — Revenue, AOV, Cost per Mile, Deposit Balance.
- `NUMBER_FORMAT_TYPE_PERCENT` — Conversion Rate, NPL, OEE, OnTimeDelivery%.
- `NUMBER_FORMAT_TYPE_NUMBER` — Orders, Patient Volume, Shipments.

## Batching with exponential backoff

Pulse REST API rate-limits at roughly 5 req/sec. Creating ~8 metric definitions per tenant in parallel will throttle. Use this helper:

```python
# services/factory/app/pulse.py
import asyncio
from random import random

async def create_with_backoff(server, payload, *, max_attempts=5):
    for attempt in range(max_attempts):
        try:
            return await server.pulse_definitions.create(payload)
        except tsc.ServerResponseError as e:
            if e.code != 429 or attempt == max_attempts - 1:
                raise
            await asyncio.sleep((2 ** attempt) + random())

async def create_batch(server, payloads):
    sem = asyncio.Semaphore(3)        # max 3 concurrent

    async def one(p):
        async with sem:
            return await create_with_backoff(server, p)

    return await asyncio.gather(*[one(p) for p in payloads])
```

## Idempotency

The `metadata.ext_assigned_id` field is our idempotency key. Use the format `<industry>-<metric-snake>-v<n>`. The factory checks for an existing definition with that ID before creating; updates use `PATCH`.

This prevents duplicate KPIs when a factory job is resumed.

## Row-level filter for RLS

Multi-tenant tenants must include a RLS filter in the basic_specification:

```jsonc
"filters": [
  {
    "field": "TenantId",
    "type": "FILTER_TYPE_USER_ATTRIBUTE",
    "user_attribute": "TenantId"
  }
]
```

This is the Pulse equivalent of the data-policy filter on the underlying data source. Without it, the metric value would aggregate across all tenants.

## Verification after creation

```python
defs = await server.pulse_definitions.get(filter=f"ext_assigned_id:eq:{ext_id}")
assert len(defs) == 1
metric = await server.pulse_metrics.get_or_create_default_metric(defs[0].id)
bundle = await server.pulse_insights.generate_bundle(metric.id)
assert bundle.value is not None
```

The bundle being non-null confirms (a) the metric materialized, (b) the data source has enough history (Pulse needs ≥7 days of data; our 2-year datasets satisfy this trivially).

## Surfacing in the AI agent

Once definitions exist, the agent can call:

- `list-pulse-metric-definitions-from-definition-ids` — fetch metric metadata for the system prompt.
- `generate-pulse-insight-brief` — produce a natural-language brief for "what's interesting today?".

System prompt template (Phase 5):

```
Current tenant: ${tenant.name}
Industry: ${tenant.industry}
Active KPIs (Pulse):
  - Revenue (Up is good)
  - AOV (Up is good)
  - Return Rate (Down is good)
  - ...
```

## Common pitfalls

- **Forgetting the RLS filter** — metric leaks data across tenants.
- **Wrong `time_dimension`** — Pulse can't compute "today vs yesterday" without one. Always set it.
- **Sentiment inverted** — "down is good" KPIs labeled "up is good" produce wrong-direction insights. Test with known data.
- **Hitting 429 on first run** — always use the batching helper, even for tests.
- **Mismatched datasource id** — the publish step (stage 7) returns a LUID; pass it through, don't re-query by name.

## Related skills

- `tableau-mcp-tools` — Pulse tools the agent uses.
- `factory-pipeline-debug` — stage 9 failure modes.
- `industry-template-author` — KPI list per industry.
