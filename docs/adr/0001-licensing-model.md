# ADR 0001: Tableau Licensing Model — Usage-Based by default

- Status: Accepted
- Date: 2026-05-13
- Deciders: project leads

## Context

The portal serves both internal employees and external customers. Tableau Cloud offers two licensing models:

1. **Role-based** — pay per named Viewer/Explorer/Creator (~$15/Viewer/mo). Predictable; ceiling on cost per user is fixed. Hard to predict total when external customers are anonymous or pulse-occasional.
2. **Usage-Based Licensing (UBL)** — pay per **Analytical Impression** (dashboard load, export, scheduled email). Starts ~$5,000/yr for 10K impressions. Unlimited Viewers within the impression bucket.

## Decision

**Default to UBL.**

- External customers in scope → many unpredictable users, often anonymous-shaped (we know their tenant but not always individual users). UBL fits.
- Internal employees are a fraction of total — folding them into the bucket is cheaper than maintaining role-based seats alongside.
- UBL gives us a single billing dial we can monitor and cap per tenant.

## Consequences

### Pros

- Single cost model; no role-based seat management.
- Scales smoothly with adoption.
- Lets us host as many tenants as we want without seat math.

### Cons

- Impressions are consumed per dashboard load → caching becomes a real lever.
- Need server-side impression budget enforcement to prevent runaway cost. (Phase 6.)
- Per-tenant cost visibility becomes a product requirement — we must expose it in the admin UI. (Phase 11.)

### Required follow-ups

- `apps/web/lib/billing.ts` — `enforceImpressionBudget(tenantId)` called at JWT-mint time. Refuse or downgrade to static image if budget exceeded.
- `apps/web/app/admin/demos/[slug]/page.tsx` — per-tenant impressions counter. (Phase 11.)
- Site-level usage statement polled into our metrics DB every 6 hours.

## Alternatives considered

- **Role-based only** — rejected: doesn't fit the external/anonymous-shaped audience.
- **Hybrid** — rejected: doubles the billing surface; not enough win to justify.

## References

- <https://www.tableau.com/blog/usage-based-licensing-scale-embedded-analytics-more-flexibility>
- Tableau Account team's UBL quote (Phase 0 procurement).
