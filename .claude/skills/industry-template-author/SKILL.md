---
name: Industry Workbook Template Authoring
description: Use when creating, editing, or auditing a Tableau .twb industry template (Retail, Retail Banking, Manufacturing, Healthcare, Logistics) for the Demo Factory. Documents the field-name contract every template must satisfy, the data policy requirement, the connection-rewrite pattern that the factory applies at publish time, and the contract-test suite.
---

# Industry Workbook Template Authoring

The Demo Factory does not generate `.twb` files from scratch — Tableau's Document API doesn't support that. Instead it loads a curated industry template, rewrites the connection + field references against the freshly published data source, and republishes. This skill governs how to author and maintain those templates.

## When to use

- Adding a new industry template.
- Modifying an existing template (changing a view, adding a calculated field, renaming a sheet).
- Investigating a "view broke after factory ran" report.
- Reviewing a PR that touches `services/factory/templates/`.

## The five launch templates

| Template | File | Generator | KPI count |
| --- | --- | --- | --- |
| Retail / E-commerce | `retail-ecommerce.twb` | `retail.py` | 7 |
| Retail Banking | `retail-banking.twb` | `banking.py` | 8 |
| Manufacturing / Operations | `manufacturing.twb` | `manufacturing.py` | 8 |
| Healthcare (synthetic) | `healthcare.twb` | `healthcare.py` | 8 |
| Logistics / Supply Chain | `logistics.twb` | `logistics.py` | 8 |

## The field-name contract (NON-NEGOTIABLE)

Every template publishes against a data source with **exactly** the entities and field names listed in `packages/factory-schema/<industry>.schema.json`. Templates must reference only fields in that contract.

Example (Retail):

```
Tables:
  Orders(OrderId PK, OrderDate, CustomerId FK, StoreId FK, ChannelId FK, OrderTotal, Status)
  OrderLines(OrderLineId PK, OrderId FK, ProductId FK, Quantity, UnitPrice, Discount, LineTotal)
  Products(ProductId PK, Sku, ProductName, Category, SubCategory, ListPrice, Cost)
  Customers(CustomerId PK, CustomerName, Segment, Region, AcquisitionDate, TenantId)
  Stores(StoreId PK, StoreName, Region, Country, Type, OpenDate)
  Channels(ChannelId PK, ChannelName)  // Online, Retail, Wholesale
```

Calculated fields the template may reference (case-sensitive, exact spelling):

```
[Revenue]                = SUM([LineTotal])
[GrossMargin]            = SUM([LineTotal]) - SUM([Quantity]*[Cost])
[GrossMarginPercent]     = [GrossMargin] / [Revenue]
[AOV]                    = [Revenue] / COUNTD([OrderId])
[OrderCount]             = COUNTD([OrderId])
[RepeatCustomerRate]     = COUNTD(IF [PriorOrderCount] >= 1 THEN [CustomerId] END) / COUNTD([CustomerId])
[ReturnRate]             = ...
```

If a workbook needs a field outside the contract, **update the schema and generator first**, then the workbook. Never invent a field in the workbook alone.

## Required: data policy on every template

Every published data source authored from a template must have a data policy:

```
[TenantId] = USERATTRIBUTE("TenantId") OR USERATTRIBUTE("TenantId") = "internal"
```

If a template lacks this, RLS is broken. The contract test catches this — see below.

## Connection-rewrite pattern (what the factory does)

At publish time, the factory uses `tableaudocumentapi.Workbook` to:

1. Open the template `.twb`.
2. For each datasource, set `connection.dbname = "<new data source name>"` and `connection.server = "<tenant project>"`.
3. Validate every field referenced in the workbook exists in the new datasource.
4. Save as a new `.twbx` packaged with the published data source.
5. Publish via TSC.

```python
# services/factory/app/workbook.py (excerpt)
from tableaudocumentapi import Workbook

def rewrite_for_tenant(template_path: str, tenant: str, ds_name: str) -> str:
    wb = Workbook(template_path)
    for ds in wb.datasources:
        for conn in ds.connections:
            conn.dbname = ds_name
            conn.username = ""  # cleared, TSC uses the publish identity
    out = f"/tmp/{tenant}-{ds_name}.twbx"
    wb.save_as(out)
    return out
```

## Workbook conventions (style + behavior)

- **Sheet names** must be stable and human-readable; they appear in the agent's context bridge. Avoid renames once shipped without a coordinated update to `packages/factory-schema/`.
- **Parameters** must be in a `Parameters` folder with `param_` prefix. The factory binds tenant-specific values (`param_ReportingCurrency`, `param_FiscalYearStart`).
- **Tooltips** should describe the metric semantically — the agent reads them. Avoid copy like "click for detail".
- **Color encodings** use the default palette; brand colors are applied at the portal layer (CSS variables), NOT inside the workbook.
- **No external image URLs** — workbooks must not reference customer logos directly. Branding is portal-level.
- **One workbook per industry** (5 dashboards within). Keeps the factory deterministic.

## QA checklist before merging a template change

1. `uv run pytest services/factory/tests/test_template_<industry>.py` — contract test runs the factory against a canonical fixture dataset; all views must render without errors.
2. Open the published workbook as `alice@acme.com` (TenantId=tenant-acme) — verify every view returns rows.
3. Open the same workbook as `admin@portal.com` (TenantId=internal) — verify row counts are higher (all tenants visible).
4. Open as `eve@nobody.com` (TenantId omitted) — verify row counts are zero.
5. Verify the data policy is present on every published data source (`tableau metadata-api` query).
6. Run `pnpm test apps/web/tests/factory-publish.test.ts` to confirm the JSON schema unchanged.

## Adding a new industry

1. Define the entity + field contract in `packages/factory-schema/<industry>.schema.json`.
2. Implement `services/factory/app/generators/<industry>.py` to emit data matching the contract.
3. Author the `.twb` template in Tableau Desktop against a canonical fixture dataset.
4. Add it to `INDUSTRY_TEMPLATES` in `services/factory/app/workbook.py`.
5. Add a contract test mirroring the Retail test.
6. Update the Claude `tableau-mcp-tools` skill if new fields are agent-discoverable.

## Common pitfalls

- **Renaming a field in the workbook without updating the schema.** Publish succeeds, contract test fails. Fix at the schema first.
- **Reusing a worksheet across dashboards** without checking it works for all five industries. We deliberately keep templates independent.
- **Adding a live database connection** instead of an extract. Templates always connect to a published `.hyper` data source so the factory can swap them.
- **Hardcoding a tenant name or date** in a title. Use parameters or calculated fields driven by `TODAY()`/`USERATTRIBUTE`.

## Cloud strict-mode pitfalls (learned the hard way during MediaMart bring-up, 2026-07-01)

Do NOT hand-author `.twb` XML from scratch or from the retail-banking pattern. Tableau Cloud strict-mode validation rejects almost every hand-written variant with cryptic errors that took ~10 iterations to diagnose. Instead:

1. **Ask user to publish a minimal reference workbook manually.** 1 datasource, 1 sheet, 1 calc field if needed. This gives you the exact XML shape Cloud expects for the target site.
2. **Download the reference via TSC**, diff `<datasources>` block, use the `sqlproxy.<hash>` connection name verbatim, mirror the calc-field `<column>` shape.
3. **Publish with `skip_connection_check=True`** or Cloud rejects with 403132 "Forbidden — failed to establish a connection".
4. **Workbook and its datasource must be in the same project.** If ds is at `Demo/Foo`, workbook goes to `Demo/Foo` — never `tenant-{slug}`.
5. **Never embed `<connection class='hyper' server='localhost'/>`** in a factory workbook. Use `<connection class='sqlproxy'>` + `<repository-location>` to reference the published datasource.
6. **Multi-table `<relationship>` in .tds cannot be hand-authored.** Six variants of banking.tds pattern all failed Cloud validation. Ship a flat .tdsx, let user draw relationships in Tableau Desktop, then re-publish.
7. **Every worksheet needs `<simple-id uuid='{...}'>`** and a matching window `<viewpoint />`, or dashboards fail with "0x2805CF18 Dashboard references sheet X which has no visual representation".
8. **Calc field pill format is `[usr:CalculationId:qk]` with `derivation='User'`**, not `[sum:FieldName:qk]`. Raw aggregates use the latter.
9. **Verify with `views.populate_image(v)`** after publish — real content is >500 bytes, empty placeholder is exactly 178 bytes (Tableau's 1x1 fallback). Missing field references silently produce placeholders with no error.

See `[[tableau-workbook-authoring-pitfalls]]` memory for the full 8-rule catalog with symptom + fix per rule.

## Related skills

- `factory-pipeline-debug` — what to inspect when a template fails to publish.
- `multitenant-rls` — the data-policy contract.
- `pulse-metric-builder` — KPI metric definitions paired with each template.
- `tableau-desktop-author` — reusable XML builders (kit/) + validator (Layer-0 XSD + Layer-1 empirical rules).
