---
name: New Tenant Portal Build
description: >
  End-to-end playbook for building a new demo tenant portal in tableau-ai-portal
  (like MediaMart or Nam A Bank): research the company, generate synthetic data,
  publish a Cloud datasource, author multi-dashboard workbooks with Vietnamese
  labels + VOTD-grade KPI cards, and wire the tenant into the portal. Use when
  the user asks to build a portal / demo / dashboards for a company, add a new
  industry, or replicate the MediaMart/Nam A Bank pattern. Encodes the hard-won
  Tableau Cloud strict-mode gotchas so you don't rediscover them each time.
---

# New Tenant Portal Build

Repeatable playbook distilled from the MediaMart and Nam A Bank builds. Follow
the phases in order; each has a "gotcha" callout for the traps that cost hours
the first time. Related skills: `industry-template-author`, `tableau-desktop-author`,
`multitenant-rls`, `tableau-jwt-mint`, `portal-catalog`.

## Phase 0 — Research FIRST (do not skip)

1. **Company research**: profile, products, brand colors + logo URL, digital
   positioning. Fan out parallel web research.
2. **Design research**: query Tableau Public for VOTD / Ambassador workbooks in
   the target industry. Deep-read 3-5 exemplars for KPI card layout, chart
   types, color usage, layout hierarchy. THEN design.
   > **Gotcha**: skipping design research produces generic dashboards. The user
   > flagged this on Nam A Bank. The `tableau-public-mcp` server (22 tools) or
   > WebFetch to `https://public.tableau.com/api/search?query=X&count=N` (public,
   > no auth) does this. If the MCP was added mid-session its tools won't be in
   > ToolSearch until the next session — use WebFetch fallback.

## Phase 1 — Foundation

1. **Generator** `services/factory/app/generators/<name>.py`: dataclass
   `<Name>Parameters` + `<Name>Dataset` with `.all_tables()`. Register in
   `generators/__init__.py`. Calibrate synthetic metrics to the company's real
   published numbers ±5% jitter (banks: NPL/CASA/LDR/ROE). VN geography = weighted
   province tuples with lat/long jitter σ≈0.012°.
   > **Gotcha**: `faker.unique.name()` runs out past ~a few thousand rows. Use
   > plain `fake.name()` for large N.
2. **Schema** `packages/factory-schema/<industry>.schema.json` (mirror to
   `services/factory/app/schemas/`). One `required` table list + column enums.
3. **Tenant + theme**: add to `apps/web/data/tenants.json` +
   `tenant-themes.json` AND the seed route `apps/web/app/api/admin/seed/route.ts`
   (both — file is baseline, seed writes KV). Logo → `apps/web/public/tenants/`.
   Add demo account to sign-in page `app/(auth)/sign-in/page.tsx`.

## Phase 2 — Data → Cloud datasource

1. Generate tables → `.hyper` (`app.hyper.write_hyper`) → `.tdsx` (use
   `app.packager.build_tds_xml` flat-relation emitter; do NOT hand-author
   object-model joins).
2. Create Cloud project `Demo/<Name>` via `tableauserverclient`.
3. Publish the `.tdsx` datasource (mode Overwrite, `as_job=False`).
   > **Gotcha (BIGGEST)**: Cloud rejects hand-authored multi-table relationships
   > in `.tds`. The FIX is a human step: the user opens the `.tdsx` in Tableau
   > **Desktop**, drags relationships on the canvas, and republishes the
   > datasource. Only Desktop-authored relationships pass Cloud strict-mode.
   > You cannot do this in code. Plan for it.

## Phase 3 — The seed workbook (unlocks everything)

You CANNOT author working `sqlproxy` workbooks from a bare connection block —
sheets render blank. Cloud needs the workbook's inline `<datasource>` block to
carry ~90+ `<metadata-records>` + a `<relation type='collection'>` list, which
only Tableau Desktop generates.

**Procedure**: have the user create a 1-sheet Desktop workbook against the
published datasource, drag any field, add a couple calc fields, and publish it
as `_seed_desktop`. Download it, extract the `<datasources>...</datasources>`
block → this is your golden template for all real workbooks. It also contains
the real `sqlproxy.<hash>` name Cloud assigned.
> See `tableau-cloud-calc-fields-need-metadata` memory for the full rationale.

## Phase 4 — Author dashboards (in code)

Build each workbook by templating the seed's datasources block + injecting calc
fields + worksheets + one layout-flow dashboard.

- **Formula strings use DOUBLE quotes**: `[Status] = "Delinquent60"`, never
  single quotes (→ NULL). XML-escape `"`→`&quot;`, `&`→`&amp;`, `<`→`&lt;`,
  `>`→`&gt;`. Escape `&` in dashboard `name=` attrs too.
- **Qualified field names**: a field present in >1 table is referenced as
  `[Status (Loans)]`, `[CustomerId (Customers)]`. Check the seed metadata for
  the exact qualified names. Unqualified names resolve ambiguously / NULL.
- **Dashboard layout = nested `<zone type-v2='layout-flow' param='vert|horz'>`**,
  NOT absolute x/y positioning. Root layout-basic → vflow → hflow of leaf zones.
  Use a sequential unique zone-id counter (hash-based ids collide → overlap).
- **Sizing**: `<size sizing-mode='automatic' />` so it reflows in the portal.
- **KPI cards VOTD-grade**: value (26pt navy #31435C) + delta line with
  color-coded arrow (▲ #059669 / ▼ #b7302b) + Δ% + "vs LY". YoY via
  date-window aggregation, NOT `LOOKUP(-12)` (LOOKUP needs MONTH on the view;
  in a single-cell KPI it returns NULL). Pattern:
  `SUM(IF [date] >= DATEADD("month",-12,TODAY()) THEN [x] END)` vs the -24..-12
  window. Ratio KPIs (NPL%, CASA%) stay snapshot (no window).
- **Currency format**: `n#,##0,,,.1"T ₫"` — use the `n` prefix, NOT `c!vi_VN!`
  (the locale-currency renderer underlines the ₫ glyph). `,,,`=÷10⁹ (T/nghìn tỷ).
- **Maps**: use Country + City as geo DIMENSIONS with `semantic-role`
  (`[Country].[ISO3166_2]`, `[City].[Name]`) + rows `[Latitude (generated)]`,
  cols `[Longitude (generated)]` + `<mapsources><mapsource name='Tableau'/>`.
  Raw AVG(Latitude)×AVG(Longitude) collapses to one mis-projected dot.
- **Hide worksheet tabs** (standing user request): every
  `<window class='worksheet' ...>` gets `hidden='true'`; only dashboard windows
  stay visible.
- **Iterating**: to change KPIs on an already-good workbook, do an IN-PLACE
  surgical patch — inject calc columns + replace only the KPI `<worksheet>`
  bodies keeping exact names. Rebuilding a dashboard from scratch reintroduces
  zone-id/layout bugs.
- **Counts fan-out across relationships**: a raw `[cnt:Key]` / `[ctd:Key]`
  column-instance INFLATES when the sheet's dimension pulls in a joined child
  table (e.g. counting Sales grouped by project while Collections is related —
  each sale ×3 collection rows). Use a `COUNTD([Key])` CALC FIELD instead — the
  calc evaluates at the key's own grain and is immune. Verified on Mey Group.
- **Exclude a category**: don't hand-author `<filter class='categorical'>` —
  Cloud rejects malformed filter XML ("Error parsing filter, ignoring"). Use a
  count calc that filters inline: `COUNTD(IF [x] != "…" THEN [key] END)`.
- **All tables must relate**: Tableau errors "Unrelated Tables — all tables in
  a data source must be related." Standalone group-level tables (targets, HR,
  agencies) still need a join key to the model — join on a shared Month, or on a
  dimension like AgencyName=SanGiaoDich. Logical (noodle) relationships don't
  fan-out for correctly-authored calc measures, so this is safe.
- **layout-flow ignores zone `w=`**: a horizontal flow splits children EQUALLY
  regardless of their width attribute. To give a chart more/less width, put it on
  its own row or nest flows — you cannot weight siblings in one flow. (A donut
  squished into a third-of-row gets its title wrapped; give it half a row.)

## Phase 5 — Publish + verify

- Publish workbooks (Overwrite, `skip_connection_check=True`).
- Down-version the `<document-format-change-manifest>` + `source-build` if Cloud
  rejects with 400011 "newer version" (drop 2026.2 features → 2026.1.1).
- Render each dashboard via `views.populate_image` with
  `ImageRequestOptions(maxage=1)` to bypass Cloud's render cache; read the PNG.
- Seed the tenant: `POST /api/admin/seed?force=true` (signed in as internal) to
  warm KV + invalidate the catalog cache so `/t/<slug>` shows the dashboards.

## Phase 6 — Extensions (optional wow-moments)

Dashboard extensions live in `apps/web/public/extensions/<name>/`
(`.trex`+`.html`+`.css`+`.js`), served static from the portal. Same-origin with
`/api/chat` so the session cookie authenticates AI calls.
> **Gotcha**: middleware must allow `/extensions/` publicly (Tableau Cloud
> fetches the manifest without the session cookie). One-time: add the portal
> origin to the Tableau Cloud site Extensions safe list.

## Reference builds

- MediaMart: `mediamart-tenant` memory, `/tmp/build_4_workbooks.py` pattern
- Nam A Bank: `nam-a-bank-tenant` memory, `services/factory/scripts/nam-a-bank/`
  (nam_a_lib.py, nam_a_kpi_v2.py, patch_*_kpi_inplace.py, fix_map_correct.py,
  hide_worksheets.py, seed-datasources-block.xml)
