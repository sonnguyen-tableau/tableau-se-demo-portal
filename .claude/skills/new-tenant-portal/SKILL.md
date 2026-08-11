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

> **SE onboarding**: if this is your first build, do the one-time setup in
> `docs/onboarding/se-quickstart.md` first (your Tableau Cloud site, Connected
> App, PAT, env). `docs/onboarding/new-demo-request.md` is the condensed
> per-customer checklist that wraps this skill.
>
> **Start with the scaffolder** — don't copy an existing `scripts/<tenant>/`
> folder by hand. Run:
> ```
> uv run python -m app.scaffold --company "Acme Air" --industry airline-catering \
>     --slug acme --tables "Flights,Meals,Complaints"
> ```
> This stamps `services/factory/scripts/acme/` (provision + lib + talk-track) and
> a registered generator stub at `app/generators/acme.py`. The industry may be
> ANY kebab-case slug — the pipeline no longer restricts it to a fixed enum.
>
> **Language**: the portal UI defaults to English (`NEXT_PUBLIC_DEFAULT_LOCALE`).
> Author your tenant's dashboard labels in your target language — the reference
> tenants use Vietnamese because that was their market; yours need not.
>
> **Your site**: publish to YOUR Tableau Cloud site. Either set
> `services/factory/.env` (default), or pass a per-run target on the factory
> request (`tableau: {site_url, site_name, pat_name, pat_secret}`) — see
> `app.config.resolve_tableau`. Nothing is pinned to a specific pod.

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

The provision script the scaffolder emits already does this via
`app.extract_publish` — generate tables → `.hyper` → self-contained `.tdsx` →
publish to `Demo/<Name>`:

```
uv run python scripts/<slug>/provision_<slug>.py            # build .tdsx only
uv run python scripts/<slug>/provision_<slug>.py --publish  # + publish to Cloud
```

`app.extract_publish.publish_extract_tenant()` builds the flat-relation `.tds`,
zips the `.tdsx`, ensures the nested `Demo/<Name>` project, and publishes
(Overwrite). It skips cleanly if no Tableau creds are configured (you still get
the `.tdsx` on disk).

## Phase 3 — Workbooks: prefer the self-contained extract (no Desktop, no hash)

**DEFAULT (recommended): self-contained extract-workbook.** Author each workbook
with ONE datasource per table (each a single-relation federated hyper connection
to the packaged `.hyper`), and publish with `skip_connection_check=True`. This
RENDERS on Cloud with **no sqlproxy seed block and no Desktop relationship
step** — the breakthrough proven by VACS/ACB/MediaMart. Every worksheet is
single-table so field names are bare (no `[Field (Table)]` qualification).
Reference: `services/factory/scripts/vacs/vacs_lib.py`.
> A single datasource listing many *unjoined* sibling `<relation>`s is INVALID
> federated XML and renders BLANK — that's why it's one-datasource-per-table.

**LEGACY (only if you specifically need a live federated `sqlproxy` datasource,
e.g. a relationship model for the MCP agent):** you cannot author a working
`sqlproxy` workbook from a bare connection block — sheets render blank. Cloud
needs the inline `<datasource>` block to carry ~90+ `<metadata-records>` + a
`<relation type='collection'>` list, which only Tableau Desktop generates.
Procedure: create a 1-sheet Desktop workbook against the published datasource,
publish it as `_seed_desktop`, then run the helper to extract the block + hash
automatically (no more hand-copying):
```
uv run python -m app.seed_probe --workbook _seed_desktop --project "Demo/<Name>" \
    --out /tmp/<slug>-seed-block.xml
# prints: DS_NAME = "sqlproxy.<hash>"   and writes the <datasources> block
```
> See `tableau-cloud-calc-fields-need-metadata` memory for the rationale.

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
- **KPI two-line card (number over delta) — ALWAYS APPLY**: never emit a
  standalone newline run `<run>&#10;</run>` to break the line — Tableau TRIMS a
  whitespace-only run, collapsing "312" and "▲ 23,8% vs cùng kỳ" onto one line.
  Instead attach the break to the START of the (non-empty) delta run:
  `<run …><![CDATA[\n{delta_text}]]></run>` (CDATA so the literal `\n` survives).
  Verified on VACS.
- **Header/title band — ALWAYS APPLY**: a `<zone type-v2='text'>` header with
  wordmark+title+subtitle runs must be pinned to a FIXED pixel height with
  `is-fixed='true' fixed-size='55'` — a relative `h='4600'` renders ~34px at
  narrow embed widths and clips the title. Verified on VACS + Vietnam Airlines.
- **Number-format decimals use `0`, NOT a digit**: in a format string `.1`/`.2`
  render as LITERAL text (".1"), NOT one/two decimals — every value shows a
  bogus ".1". Use `.0`=1dp, `.00`=2dp. Scaling commas go BEFORE the decimal:
  `,,,,`=÷10¹² (nghìn tỷ), `,,,`=÷10⁹ (tỷ), `,,`=÷10⁶ (triệu). E.g. VND→tỷ 1dp:
  `n#,##0,,,.0" tỷ ₫"`. Use the `n` prefix, NOT `c!vi_VN!` (locale-currency
  renderer underlines the ₫ glyph). Verified on Vietnam Airlines.
- **Maps**: use Country + City as geo DIMENSIONS with `semantic-role`
  (`[Country].[ISO3166_2]`, `[City].[Name]`) + rows `[Latitude (generated)]`,
  cols `[Longitude (generated)]` + `<mapsources><mapsource name='Tableau'/>`.
  Raw AVG(Latitude)×AVG(Longitude) collapses to one mis-projected dot.
- **Hide worksheet tabs** (standing user request): every
  `<window class='worksheet' ...>` gets `hidden='true'`; only dashboard windows
  stay visible.
- **Cross-filter (click-to-filter) — ALWAYS APPLY**: "click a mark in one chart
  and the rest of the dashboard filters" is a DASHBOARD FILTER ACTION, NOT a
  datasource relationship — do not try to fix it with joins. Emit a workbook-level
  `<actions>` block (sits BETWEEN `</datasources>` and `<worksheets>`, verified
  placement), one `<action>` per source worksheet:
  ```xml
  <action caption='Filter 1 (generated)' name='[Action1_<UUIDHEX>]'>
    <activation auto-clear='true' type='on-select' />
    <source dashboard='<Dash Name>' type='sheet' worksheet='<Sheet>' />
    <command command='tsc:tsl-filter'>
      <param name='special-fields' value='all' />
      <param name='target' value='<Dash Name>' />
    </command>
  </action>
  ```
  This is exactly what Tableau Desktop's "Use as Filter" produces (verified live
  against the meygroup + BSL workbooks). Make every non-KPI chart a source; skip
  the KPI/BAN cards (book-totals, no dimension to filter by), the month-trend, and
  the funnel (no shared key — see the grain caveat below). Escape `&` in the
  dashboard name (`&amp;`) inside both `dashboard=` and the `target` param.
  > **Gotcha (same-datasource requirement)**: `special-fields='all'` cross-filters
  > by FIELD NAME. Two sheets cross-filter fully only when they share a datasource
  > OR share an identically-named dimension. On the "one datasource per table"
  > extract path, charts on DIFFERENT tables only cross-filter on same-named dims
  > (e.g. `VendorGroup`, `Region`). To make a summary chart (Sales, Health)
  > cross-filter with the detail charts, RE-SOURCE it onto the detail table
  > grouped by the shared dimension — safe when that summary is a pure roll-up of
  > the detail table (identical figures, zero drift). Verify render before/after.
  > KPI book-totals, month-trend, and funnel have no detail key and stay
  > non-cross-filterable — a data-model limit, not a bug.
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
