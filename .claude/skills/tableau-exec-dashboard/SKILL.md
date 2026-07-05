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
- **KPI-with-comparison (2-line) card**: add runs after the number — `<run>&#10;
  </run>` newline + `<run fontsize='10' bold fontcolor='#1f8a70'>▲ 102% so KHNS
  </run>`. Renders only when the cell is tall enough (≥ ~200px). The user's D1
  uses `KPI ... (pct)` variants with this. Green ▲ for ≥100%, gold/amber for <100%.

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

## Division of labour (what to do in code vs ask the user)

Do in CODE (all proven now): fixed size, KPI/BAN cards + %HT line, donut rings
(clone), grouped bullets, unified colors, ranking bars + labels, rounded cards,
captions, floating ring zones, funnel/aging sort. **Only ask the user for**: (1)
datasource relationships (Desktop-only, Cloud rejects XML joins — the ONE thing
never do in code); (2) a brand-new viz type you have no working sample to clone
— have them author one reference sheet, then clone it.

## Replicating D1 → a new dashboard (D2…D5 checklist)

1. Point `mey_lib.SEED_BLOCK` at the latest good datasources block (has all
   calcs + the color map + ring_gauge palette + CDATA-balanced).
2. Build KPI cards (`kpi=True` row), the chart set (bullets + rankings), funnel/
   share with `manual-sort`, rounded `leaf`, fixed `dashboard(width,height)`.
3. Clone a `Ring <Metric>` worksheet for any KPI that has a target; inject a
   floating ring zone over its card + a `<viewpoint>`.
4. Ensure the datasource color map covers the new measures (rewrite hexes).
5. Publish Overwrite → render → verify no blank sheets → iterate.
6. Hand to the user for final Desktop micro-alignment only if needed.
