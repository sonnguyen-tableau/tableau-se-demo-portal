---
name: Tableau Executive Dashboard (Cloud, code-authored)
description: >
  Playbook for building premium, executive-grade Tableau Cloud dashboards by
  authoring .twb XML in code (KPI/BAN cards, %HT progress rings/donut gauges,
  3-layer Thực hiện/KHNS/KPI grouped-bar "bullets", ranking bars with data
  labels, rounded cards, unified palette). Distilled from the Mey Group build
  (D1 Tài Chính → D5) where Claude + the user co-developed every technique on
  Tableau Cloud strict-mode. Use when building or polishing multi-chart exec
  dashboards for a tenant, replicating the Mey Group D1 standard to new
  dashboards, or debugging why a KPI number / ring / colored bullet won't render
  on Cloud. Pairs with the `new-tenant-portal` skill (data → datasource → seed)
  and the `tableau-workbook-authoring-pitfalls` memory.
---

# Tableau Executive Dashboard — code-authored, Cloud-safe

The hard-won recipe for turning a bare seed workbook into a premium exec
dashboard **entirely in code** (no per-chart Desktop work), plus the exact
traps that cost many iterations the first time. Assumes you already have a
published Cloud datasource + a Desktop-authored `_seed_desktop` workbook whose
`<datasources>` block you template (see `new-tenant-portal` Phase 3).

Reference build: `services/factory/scripts/meygroup/` — `mey_lib.py` (the
builder library), `build_mey_d2.py` (a full dashboard build), `recolor_bullets.py`,
`D1_FORMAT_TEMPLATE.md`, `RING_BULLET_TECHNIQUE.md`. Live examples:
`Mey Group - Tai Chinh` (D1), `Mey Group - Kinh Doanh Pheu` (D2).

## The golden rule learned this build

**When an advanced viz (donut ring, dual-axis bullet, KPI number) won't render
in code, do NOT keep hand-authoring the shelf plumbing.** Ask the user to author
ONE reference sheet on Desktop (or copy one from a Superstore sample workbook),
publish it into the seed, download, and **clone its exact `<view>`/`<panes>`/
`rows`/`cols` verbatim** — swap only datasource + field names. This cracked the
KPI card, the donut ring, and the bullet after code-only attempts failed 5–6×
each. Everything below is the *result* of that cloning — reuse it directly.

## 1 — Fixed dashboard size (or KPI numbers vanish)

Emit `<size maxheight='H' maxwidth='W' minheight='H' minwidth='W' />` (e.g.
1560×1100), NEVER `sizing-mode='automatic'`. With automatic sizing the row `h=`
weights map to an unpredictable pixel canvas, so a BAN number fits at one canvas
height and clips/vanishes at another. Fixed size pins `h/100000` to stable px.

## 2 — KPI / BAN cards

- Worksheet: `<layout-options><title>` = the uppercase muted label (9pt #5a6b7b);
  a single-run `<customized-label>` big number (18pt bold #0f2a47); `mark class
  ='Automatic'`, `<text column='[..].[usr:CalcId:qk]'>`, `mark-labels-show=true`,
  `mark-labels-cull=true`. Number format on the calc's `default-format`
  (`n#,##0,,,"tỷ"` for tỷ VND; `n#,##0` for counts).
- **The dashboard leaf zone MUST use `type-h='cell'`, not `type-h='scalable'`** —
  scalable culls the number (only the label shows). This was THE root cause of
  KPI numbers disappearing. `mey_lib.leaf(kpi=True)` / `hrow(kpi=True)`.
- **KPI-with-comparison (2-line) card**: `<customized-label>` with 3 runs —
  `<run bold fontsize='18' fontcolor='#0f2a47'>` big number, then a line-break
  run `<run fontalignment='1'>Æ&#10;</run>`, then `<run bold fontsize='10'
  fontcolor='#1f8a70'>▲ 102% so KHNS</run>`. Green ▲ for ≥100%, gold/amber `#c29b54`
  for <100%. (The literal `Æ` before `&#10;` is how Tableau Desktop encodes a
  hard line-break inside a customized label — harmless, keep it; that's why the
  round-tripped XML shows `Æ`.)
- **The 2-line card needs a TALLER cell or the % line clips** — this is the fix
  the user applied on D2: give the KPI strip a fixed pixel height instead of a
  flow weight. On the dashboard the KPI row zone becomes `<zone is-fixed='true'
  fixed-size='136' ...>` (was a flow `h='20000'`), and each KPI leaf's
  `<layout-cache>` gets `cell-count-w='1'` + `non-cell-size-h='33'`. Enough
  height = both the 18pt number AND the 10pt %-line render; too short = only the
  number shows. Pair with `type-h='cell'` (never `scalable`).

## 3 — Donut % gauge / ring (dual-pie hole-punch)

A single Pie renders as a solid dot — the hole needs a SECOND white pie. Cloned
from Superstore's `pies`/`Segment` sheet + the user's `Ring Tiền thu 1`:
- calcs: `Pct HT = SUM(actual)/SUM(target)`, `Đạt = MIN(PctHT,1)`,
  `Còn lại = 1 - Đạt`, plus a shared `min0 = MIN(0)` (USER-derived, not Sum) and
  `Gauge dummy = "dummy"` (string dim).
- `cols = (min0 + min0)` → two zero-width axes at same x so panes overlay.
  `rows = [none:GaugeDummy:nk]` (one row). Filter `[:Measure Names]` to {Đạt,
  Còn lại}; slice on Measure Names.
- 3 panes: pane 0 empty; `pane id='1' x-axis-name='min0' x-index='1'` = smaller
  WHITE pie (mark-color #ffffff, size ~0.6) → punches the hole; `pane id='2'
  x-axis-name='min0'` = colored donut (color=Measure Names via a 2-color
  `ring_gauge` palette #1f8a70 đạt / #e7edf3 còn lại, size=Multiple Values,
  size ~1.0). Hide gridlines/zeroline/table-div + `tick-color='#00000000'`.
- **Measure the gauge vs the KPI stretch target, not the KHNS budget** — actual
  often ≥ budget (102%) which makes a full circle indistinguishable from 100%.
  vs KPI, values land <100% so the arc is always meaningful. (Mey: 90/89/87%.)
- Place on the KPI card as a **floating dashboard zone**: `<zone is-fixed='true'
  fixed-size='..' h='..' w='..' x='..' y='..' show-title='false'>` inserted before
  the dashboard's closing `</zones>`, positioned over the KPI card's right side.
  **The floating worksheet MUST also get a `<viewpoint name='..'>` in the
  dashboard `<window>`** or Cloud rejects publish with 400011 "sheet has no
  visual representation". See `mey_lib.ring_card()`.


### Floating ring gauge — ONLY on absolutely-positioned (tiled) KPI cards
A floating `is-fixed` ring zone anchors to absolute px, so it aligns correctly
ONLY when the KPI cards are themselves tiled (real x/y/w/h — as in a user-
Desktop-formatted dashboard). When KPI cards are code-authored via layout-flow
(x=0 y=0 w=100000 h=100000 = relative), there is NO absolute frame and any ring
x straddles the card boundary (spent 4 nudges on Mey D2 before accepting this).
→ For a code-authored flow KPI strip, DON'T float a ring. Use the 2-line pct
card instead (number + '▲102% so KHNS' run) — it renders inline, no coords,
never straddles. Reserve floating rings for dashboards the user has tiled on
Desktop (D1).

## 4 — 3-layer bullet (Thực hiện / KHNS / KPI) = GROUPED bars, not overlaid

An overlaid dual-axis via hand-authored `<join-axes>` is REJECTED by Cloud
(500000). The working form is dodged/grouped bars (the user's `Bullet Seed`):
`rows = [Multiple Values]`, `cols = ([mn:Month:ok] / [:Measure Names])`,
`color = [:Measure Names]`, filter Measure Names to the 3 measures, `manual-sort`
dictionary to order actual→plan→kpi. `mey_lib.bullet_chart()`. Use qualified
field names where a measure exists in >1 table (e.g. `[UnitsSold
(MonthlyFinancial)]`, not `[UnitsSold]` which resolves to Projects' static one).

## 4b — Funnel chart (user technique, learned on D2 Phễu)

The premium funnel is NOT a horizontal bar chart. The user's live D2 form
(clone this):
- **Mark `class='Automatic'`** (Tableau picks the funnel-ish mark), NOT `Bar`.
- **`rows = [usr:CalcId:qk]` (the measure), `cols` empty** — measure on rows +
  size encoding is what gives the funnel its tapered silhouette (a bar chart puts
  the measure on cols).
- Encodings: `<color column='[none:Status:nk]'>` (color BY STAGE, a dimension —
  not a gradient-by-measure), `<size column='[usr:CalcId:qk]'>` (width = volume),
  and TWO text encodings (stage name + measure).
- **Color the stages** with a datasource-level `<encoding attr='color'
  field='[none:Status:nk]'>` map, sequential blue dark→light by funnel depth
  (Deal `#3d6a98` → Lead `#b9ddf1`). Same ds-level mechanism as §5.
- **2-line custom mark label** via `<customized-label>`: run 1 = stage name
  (bold 11pt), line-break run (`Æ&#10;`), run 2 = the count (9pt). Then
  `mark-labels-show=true` + `mark-labels-cull=true`.
- **Sort = `<computed-sort direction='DESC' using='[usr:CalcId:qk]'>`** on the
  Status dimension — orders stages by descending volume so the funnel always
  tapers correctly. (Supersedes the old "manual-sort Lead→…→Lost" advice below —
  computed-sort is what the user actually shipped; it self-orders and needs no
  hand-maintained bucket dictionary.)
- **Drop terminal/off-path stages** from the funnel with a `<filter
  class='categorical'>` `groupfilter function='union'` including only the
  progression members (Lead/NET/Visit/Booking/Deal) — the user excluded `Lost`
  so the shape reads as one clean pipeline. Also **hide the measure axis**
  (`<style-rule element='axis'><format attr='display' ... value='false'>`).

## 4c — Dashboard filter actions = cross-filtering (user upgrade on D2)

The user makes every chart a cross-filter source so clicking a bar/segment/month
filters the whole dashboard. Emit a top-level `<actions>` block (sibling of
`<worksheets>`), one `<action>` per source sheet:
`<action caption='Filter N (generated)'><activation type='on-select'
auto-clear='true'/><source dashboard='<DashName>' type='sheet' worksheet='<Sheet>'/>
<command command='tsc:tsl-filter'><param name='special-fields' value='all'/><param
name='target' value='<DashName>'/></command></action>`.
Each TARGET sheet then carries `<filter class='categorical' column='[..].[Action
(<Field>)]'>` + a `<groupfilter ... user:ui-action-filter='[ActionN_<hex>]'>` and
lists those Action columns in its `<slices>`. On D2 there are 6 actions (one per
chart incl. DealThang). These are fiddly to hand-author reliably — if building
fresh, prefer authoring the actions once on Desktop then cloning the block.

## 5 — Unified color palette (one set, no rainbow)

Colors for `[:Measure Names]` live in ONE **datasource-level**
`<encoding attr='color' field='[:Measure Names]' type='palette'>` block with a
`<map to='#hex'><bucket>&quot;[ds].[sum:Measure:qk]&quot;</bucket></map>` per
measure. To unify: rewrite the `to='#hex'` for each measure's bucket. A color
encoding placed inside a worksheet `<style>` is IGNORED by Cloud — the
datasource-level map wins. Standard palette:
- Thực hiện `#1b75bc` · Kế hoạch (KHNS) `#9fb3c8` · KPI `#c29b54`
- ranking bars + share = a sequential blue palette; ring = `#1f8a70`/`#e7edf3`.
See `recolor_bullets.py`.

**Ranking-bar palette is stored differently from the [:Measure Names] map** and
is FRAGILE across a Desktop round-trip. A single-measure ranking bar keeps its
palette as a worksheet-level attribute: `<color column='[..].[usr:CalcId:qk]'
palette='Mey Sequential Blue' type='palette' />`, and the palette itself is
DEFINED in the workbook `<preferences>` block (`<color-palette name='Mey
Sequential Blue' type='ordered-sequential'><color>…`). When the user re-saves on
Desktop, Tableau can **drop `palette=`/`type=` from the color line AND empty out
`<preferences>`** — the bars then render as a default gradient. Fix (surgical, no
rebuild): (1) restore the 4 `<color-palette>` defs into `<preferences>`; (2)
re-add `palette='Mey Sequential Blue' type='palette'` to each bare ranking
`<color>` line. Republish Overwrite. (Happened on D2 — 4 ranking bars; the
bullet's ds-level Measure-Names map survived, only the ranking palettes broke.)

## 6 — Ranking bars + data labels (user upgrade, apply everywhere)

Horizontal bars sorted desc, sequential-blue palette bound to the measure.
**Show the value as a mark label at the bar end** (the user added this to every
ranking on D1 — big readability win): `mark-labels-show='true'` on the bar mark
with the measure on Label. Add `manual-sort` for natural-order dims (funnel:
Lead→NET→Visit→Booking→Deal→Lost; aging buckets).

## 7 — Rounded cards + clean captions

- Card zone-style: border #e3e9ef 1px + `<_.fcp.DashboardRoundedCorners.true...
  format attr='corner-radius' value='14' />` + margin 9 + padding 10 + white bg.
  Requires `<_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners />` in
  the workbook `<document-format-change-manifest>`.
- Legends/axis titles = the measure **caption**. Rename captions so legends read
  `Thực hiện / Kế hoạch (KHNS) / KPI` and axes read Vietnamese
  (`Doanh số (tỷ)`, `Công nợ (tỷ)`). Bullet legends look best as a `type-v2
  ='color'` zone stacked at the BOTTOM of each bullet card.
- **Legend welded to its chart into ONE seamless card** (user's exact D2
  technique — learn this): put the chart zone and its color-legend zone in a
  shared vertical container, then round only the OUTER corners so the pair reads
  as a single rounded card:
  - Chart zone (top): keep `corner-radius='14'` but ADD `corner-radius-bottom-left
    ='0'` + `corner-radius-bottom-right='0'`, and `margin-bottom='0'` +
    `padding-bottom='0'` (square bottom edge, no gap toward the legend).
  - Legend zone (bottom): `<zone type-v2='color' leg-item-layout='horz'
    show-title='false' param='[..].[:Measure Names]'>` with `corner-radius-bottom
    -left='14'` + `corner-radius-bottom-right='14'` (round bottom only), a lighter
    `border-color='#f5f5f5'`, `margin-top='0'` + `padding-top` trimmed so it hugs
    the chart. Result: top corners rounded by the chart, bottom corners by the
    legend, flat seam between → one continuous card. The user hand-tuned every
    corner-radius / margin / padding value; these are the shipped numbers.

## 8 — seed-block extraction (CDATA safety)

The seed's inline `<datasource>` embeds a COPY of itself inside a
`<repository-location ... <![CDATA[ ...</datasource>... ]]>`. So: (a) verify
`count('<![CDATA[') == count(']]>')` before using an extracted block — a naive
"up to first `</datasource>`" slice cuts inside CDATA → unbalanced → publish
parse error; (b) inject calc columns with `rfind('</datasource>')` (the LAST,
structural close), because the FIRST `</datasource>` is inside the CDATA.

## 9 — Publish / render loop

- Publish `mode=Overwrite, skip_connection_check=True, as_job=False`. Overwrite
  an existing workbook name is the RELIABLE path; `CreateNew` sometimes returns
  a transient `500000: Forbidden` — retry or Overwrite a throwaway slot.
- If a specific workbook 500s on publish while others succeed, the bug is in
  THAT twb's XML (bisect worksheet-by-worksheet), not a Cloud outage.
- Render via `views.populate_image(v, ImageRequestOptions(maxage=1))`. Overwrite
  reuses the view id so the render cache can serve a stale tile — a changed byte
  size confirms a fresh render; identical bytes across an XML change = cached
  (render under a fresh workbook name to bust it).
- Hidden worksheets (`hidden='true'`) do NOT appear as views via the API and
  won't render standalone — put them on a (throwaway) dashboard to validate, or
  publish them non-hidden if the user needs them as Desktop tabs.

## 10 — Sparkline KPI card (Style B) ★ BEST PRACTICE (D1/D2 V1, 2026-07)

The signature "wow" move from the premium reference workbooks (Superstore
Dashboard, Financial #RWFD, Company Finance Health #VOTD — all on Tableau Public;
pull their rendered images via the tableau-public MCP by the `derived-from` repo
URL in the .twb). Each KPI card = big number on TOP + a 6-month trend sparkline
BELOW, inside one rounded card.

**Sparkline worksheet** (minimalist Line, everything hidden):
```
cols = [ds].[tmn:<DateField>:qk]      # continuous MONTH — derivation='Month-Trunc'
rows = [ds].[usr:<KpiCalc>:qk]         # the SAME calc the BAN card shows (recomputes /month)
mark = Line, <format attr='mark-color' value='#1b75bc'/>, size 1.4
```
Hide axes/gridlines/zeroline/field-labels: `<style-rule element='axis'><format
attr='display' value='false'/><format attr='tick-color' value='#00000000'/>` +
`gridline line-visibility off` + `zeroline off` + `worksheet display-field-labels
false` (cols & rows). Declare the date COLUMN + its `[tmn:…:qk]` instance + the
calc + its `[usr:…:qk]` instance. Pick the date grain per KPI (leads →
CreatedDate, deals → ClosedDate).

**Card layout** — restructure each KPI cell into a vertical flow `[number, spark]`:
```
<zone param='vert' ...>              # OUTER = rounded card (border+corner-radius 14+bg #fff)
  <zone fixed-size='100' name='KPI X' ...>          # number leaf, type-h/w='cell', pad 2
     <layout-cache cell-count-h='1' non-cell-size-h='33' type-h='cell' type-w='cell'/>
  <zone name='KPI X Spark' show-title='false' ...>  # spark leaf, type-h/w='scalable', pad 2
     <layout-cache minheight='100' minwidth='100' type-h='scalable' type-w='scalable'/>
```
`show-title='false'` on the spark leaf hides the worksheet name (else it overlaps
the number). Grow the KPI strip row: it's `is-fixed='true' fixed-size='136'` (a
PIXEL height, not a weight) → bump to ~210. Register each spark worksheet in
`<windows>` (hidden) + a dashboard `<viewpoint>`. A 2-line BAN (number + '▲102%
so KHNS') needs a taller number leaf than a 1-line one.

Reference builders: `build_mey_d2_V1.py` (`sparkline_worksheet`,
`restructure_kpi_zone`). Live: `Mey Group - Kinh Doanh Pheu V1`.

## 11 — "Nhấn cột cao nhất" — max-column emphasis + gold KPI tick ★ BEST PRACTICE

The Superstore emphasis move for a monthly bar chart: the max month is the
DARKEST bar, others grade lighter, and a gold horizontal tick marks each month's
KPI target. Replaces a busy 3-layer TH/KHNS/KPI bullet with one clean series.

- **Color = the measure itself**, graded dark→light. Two ways, both Cloud-safe:
  (a) flat brand via the `[:Measure Names]` ds-map (D1 V1 final, survives Desktop
  round-trips), or (b) `palette='Mey Sequential Blue' type='palette'` on a
  `<color column='[ds].[sum:<measure>:qk]'>` pill (needs the palette in
  `<preferences>`). **Do NOT color by a highlight DIMENSION** — a boolean/string
  color pill NEVER binds in hand-authored .twb on this Cloud (falls to Tableau's
  default orange). See [[tableau-cloud-color-binding-and-emphasis]].
- **tỷ label**: raw measure on `rows` (drives bar length + color), HIDE its axis
  (`<format attr='display' class='0' field='[…sum:measure:qk]' scope='rows'
  value='false'/>`), and put a `SUM(measure)/1e9` display CALC (calc columns DO
  honor `default-format='n#,##0'`) as the `<text>` label → shows `1.113` not
  `1.113.000.000.000`.
- **Gold KPI tick = per-cell `<reference-line>` + MANDATORY `<lod>` pill.** The
  line renders ONLY if its `value-column` measure is ALSO on a shelf via `<lod
  column='[ds].[sum:<KpiMeasure>:qk]'/>` in the pane encodings. Missing the lod
  pill → the reference-line is in the XML but silently NOT drawn (cost a full
  debug cycle on D2 V1 DealThang). Full form:
  ```
  <reference-line axis-column='[ds].[sum:<measure>:qk]' value-column='[ds].[sum:<kpi>:qk]'
    formula='sum' scope='per-cell' id='kpiline' label-type='none' z-order='1' />
  ```
  + `<style-rule element='refline'>` with stroke-color `#c29b54`, stroke-size 3,
  line-visibility on, line-pattern-only solid, fill-above/below `#00000000`.

Reference: D1 V1 `DoanhSoThang`/`SanLuongThang`/`DongTienThang`, D2 V1 `DealThang`.
Live: `Mey Group - Tai Chinh V1`. Builder: `build_mey_d1_V1.py`.

## 12 — Surgical-patch workflow ★ (never rebuild a user-touched workbook)

Once a workbook is LIVE and the user may have polished it on Desktop, iterate by
PATCHING the current live download, NEVER by rebuilding from the seed +
Overwrite (that wipes their layout — happened on D2 V1, cost the user's KPI-card
alignment). The `build_mey_d{1,2}_V1.py` scripts encode this:
1. `populate_revisions` + download the LATEST rev (it carries all Desktop polish
   the generator lacks — rings, welded legends, cross-filter actions, card sizing).
2. Swap ONLY the target worksheet(s) in-place with `re.sub`, keeping the SAME
   NAME so dashboard zones / viewpoints / actions stay wired.
3. Inject new calcs before the STRUCTURAL `</datasource>` (`rfind`, NOT the first
   one — it's inside a CDATA copy). Verify `count('<![CDATA[')==count(']]>')`.
4. Publish as a NEW `... V1` name (never Overwrite the user's original).
5. Bust the render cache with `opt.vf("<AnyDimension>","<value>")`; sample bar
   pixels with pillow to verify colors actually bound (don't trust the thumbnail).

## Division of labour (what to do in code vs ask the user)

Do in CODE (all proven now): fixed size, KPI/BAN cards + %HT line, donut rings
(clone), grouped bullets, unified colors, ranking bars + labels, rounded cards,
captions, floating ring zones, funnel/aging sort. **Only ask the user for**: (1)
datasource relationships (Desktop-only, Cloud rejects XML joins — the ONE thing
never do in code); (2) a brand-new viz type you have no working sample to clone
— have them author one reference sheet, then clone it.

## Replicating D1 → a new dashboard (D2…D5 checklist)

For a FRESH dashboard from the seed:
1. Point `mey_lib.SEED_BLOCK` at the latest good datasources block (has all
   calcs + the color map + ring_gauge palette + CDATA-balanced).
2. Build KPI cards (`kpi=True` row), the chart set (bullets + rankings), funnel/
   share with `manual-sort`, rounded `leaf`, fixed `dashboard(width,height)`.
3. Clone a `Ring <Metric>` worksheet for any KPI that has a target; inject a
   floating ring zone over its card + a `<viewpoint>`.
4. Ensure the datasource color map covers the new measures (rewrite hexes).
5. Publish Overwrite → render → verify no blank sheets → iterate.
6. Hand to the user for final Desktop micro-alignment only if needed.

## The D1/D2 V1 STANDARD (apply to every dashboard) ★

The approved best-practice bundle, distilled from the final live `... V1`
workbooks. Every Mey dashboard should have:
- **§10 Sparkline KPI cards** — 6-month trend Line under each BAN number, one
  rounded card. The default KPI treatment now (superset of the plain BAN).
- **§11 Emphasis monthly chart** — max month darkest (Sequential Blue / brand),
  gold per-cell KPI tick (+lod pill), tỷ display-calc label. Use instead of a
  3-layer bullet when the story is "how are we tracking vs target each month".
- Keep: rounded cards, ranking bars + data labels, funnel/aging sorts, %HT rings
  where a single headline target exists, 100% Vietnamese captions, VND as tỷ.
- **Always via §12 surgical patch** when the target workbook is already live.
- Cross-filter actions + final pixel alignment = the user's Desktop pass (they
  don't survive a code rebuild — flag them, don't try to author them).
