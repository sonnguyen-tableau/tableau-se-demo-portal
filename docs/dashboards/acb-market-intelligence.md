# ACB Market Intelligence — Dashboard Spec (3 pages)

> Executive-grade Tableau Cloud dashboard for **ACB (Ngân hàng TMCP Á Châu)**
> Priority-Banking relationship managers / advisors. A Vietnam macro +
> capital-market monitor that tells one story:
> **Data → Dashboard → Insight → Advisor Brief → Report Automation.**
>
> Data contract: `packages/factory-schema/market-intelligence.schema.json`
> (6 tables). Generator: `services/factory/app/generators/acb.py`. Build path:
> self-contained extract-workbook (`.twbx`), the VNPT/VACS technique — every
> sheet single-table, no Desktop relationship drawing. See
> [`docs/runbooks/build-new-portal.md`](../runbooks/build-new-portal.md) §3A.

Design synthesis grounded in 6 verified Tableau-Public exemplars (Lending-KPIs
card anatomy · Executive-Yearly-Summary small-multiples · Wealth-&-Banking
advisor cockpit · Current-vs-Comparison change grammar · S&P sector-ranking
gradient · Financial-Risk diverging color).

---

## Brand & global design system

**ACB palette** (extracted from the live logo SVG):

| Token | Hex | Use |
|---|---|---|
| `acb-blue` (primary) | `#0038A8` | Wordmark, hero numbers, primary series, header band |
| `acb-cyan` (accent) | `#00AFFF` | Secondary series, highlights, MA overlay |
| `acb-navy` (neutral) | `#0A1F44` | Titles, axis text |
| favorable | `#0E9F6E` | Positive deltas, "Favorable" pills |
| unfavorable | `#D64545` | Negative deltas, "Unfavorable"/alert pills |
| comparison ghost | `#C9D2E3` | Prior-period ghost mark everywhere |
| canvas | `#F4F6FB` | Light-grey page background |

**Discipline (applies to all 3 pages):**

- **4 palettes only**: brand blue (neutral series), the green/red semantic pair
  (deltas + alerts *only*, never decoratively), grey (`comparison ghost` for the
  prior period *everywhere*), and one diverging ramp (red→grey→green) reserved
  for the theme heatmap + a sequential blue for sector/conviction ranking.
- **Comparison grammar**: every trend shows the **prior period as a grey ghost
  mark behind the colored current mark**; every KPI shows a signed delta pill
  with an arrow glyph (▲ favorable green / ▼ unfavorable red — direction judged
  by the metric's `FavorableDirection`, so a falling CPI is *green*).
- **Card rule**: one number + one trend visual + one comparison delta, then
  stop. Rounded white cards on the light-grey canvas, thin dividers.
- **Bilingual**: sheet titles carry the Vietnamese label with the metric's
  English name available via `MetricName`. Money in VND, formatted
  `n#,##0,,," tỷ"` (÷1e9) for turnover/flow, raw for index levels.
- **Number formats** (Cloud-proven ordering — scaling commas *before* the
  decimal): `n#,##0,,," tỷ ₫"` for VND-billions, `n#,##0.0"%"` for rates,
  `n#,##0.00"x"` for P/E-P/B, `n#,##0.0` for the index level.

**Data policy banner**: a thin footer band on every page —
"Dữ liệu minh họa (calibrated demo) · Nguồn: GSO · SBV · HOSE · S&P Global ·
VN-Index có thể ở chế độ dữ liệu thật (VNDIRECT)". Grounded by the `Source` /
`MockData` columns.

---

## Page 1 — Market Pulse

*Headline KPIs + the VN-Index hero. "Where is the market right now?"*

**Layout** (layout-flow, top→bottom):
Header band (ACB logo + "Market Pulse — Toàn cảnh thị trường", as-of date) →
5 hero KPI cards (one horizontal flow) → [ VN-Index hero line (≈⅔ width row) ] →
[ Sector-performance ranked bar + advancers/decliners split (next row) ] →
data-policy footer.

### 5 hero KPI cards — Lending-KPIs anatomy

Each card, top→bottom: (a) label (11px caps, muted navy) · (b) big BAN (28–32px
bold `acb-blue`) · (c) one comparison line with arrow+color · (d) a sparkline
(60–80px) with a favorable/unfavorable dot strip.

| # | Card | BAN source (`market_daily` latest row) | Comparison line | Spark |
|---|---|---|---|---|
| 1 | **VN-Index** | `VnIndex` (last) | `ChangePct` today ▲/▼ | 90-day `VnIndex` line + grey ghost prior-year line |
| 2 | **Hiệu suất YTD** | `ReturnYtdPct` | vs MTD `ReturnMtdPct` | YTD cumulative return area |
| 3 | **Thanh khoản/ngày** | `TurnoverVnd` (avg last 20d) `,, tỷ` | vs prior 20d avg | 60-day turnover column spark |
| 4 | **Dòng vốn ngoại** | `ForeignNetVnd` (sum MTD) `,, tỷ` | vs prior month | 60-day net-flow diverging column (green buy / red sell) |
| 5 | **Định giá P/E** | `MarketPe` (last) `x` | vs 12M avg | 120-day P/E line |

> KPI cards on the extract path need the measure on `<rows>` + a `mark
> class='Text'` (empty rows/cols render blank in a dashboard cell). Deltas via a
> secondary calc, colored by `SIGN()` on a **measure** pill (color-by-dimension
> does not bind in hand-authored `.twb`).

### VN-Index hero (center)

- Line of `VnIndex` over `Date` (full range), **grey ghost line** = same series
  shifted to the comparison window (prior year), plus a 50-day MA in `acb-cyan`.
- **Reference banding** shades the selected period; **event annotations** from
  `market_events` (dot + tooltip `TitleVi`) mark Yagi, the tariff sell-off, the
  FTSE-upgrade reversal, the 1,500 breakout — this is what the AI narrates.
- Tooltip: date · close · ChangePct · any same-day event title.

### Right/next row — breadth & flows

- **Sector/theme performance** ranked horizontal bar from `theme_summary`
  (`TrendPct` by `ThemeNameVi`), sorted desc, **sequential-blue gradient** on the
  measure (darkest = leader) — the S&P exemplar pattern.
- **Foreign flow** small area/column of daily `ForeignNetVnd` last 60 days,
  green above zero / red below.

---

## Page 2 — Macro & Market Drivers

*Small-multiples narrative rows. "What's driving it underneath?"*

The core is the **Executive-Yearly-Summary narrative-row table**: **one row per
macro indicator**, driven entirely by `market_metrics_monthly` (filter to the
macro/rates categories). Each row is a small-multiple so the eye compares
*shape*, not scale.

**Row anatomy** (repeat down the page, sorted by |`YoYChangePct`| so movers float):

| Indicator (`MetricNameVi`) | Latest value chip (`Value`+`Unit`) | Δ pill (`YoYChangePct`, colored by `FavorableDirection`) | Sparkline (30-month `Value` line + grey ghost prior-year + dashed avg reference; latest point labeled) | vs 3M / vs 12M mini-deltas |

**Indicators (in this order):**
CPI (lạm phát) · GDP (tăng trưởng quý) · Tăng trưởng tín dụng · PMI sản xuất ·
Bán lẻ HH&DV · FDI giải ngân · FDI đăng ký · Xuất khẩu · Nhập khẩu ·
Cán cân thương mại · Lãi suất tiền gửi 12T · Tỷ giá USD/VND.

**Two larger anchor charts at the bottom** (each with the grey-ghost prior
overlay):

- **USD/VND** line (`usdvnd` monthly `Value`) — the FX-pressure story.
- **Rates panel**: `deposit_rate_12m` vs `credit_growth_yoy` dual line — the
  liquidity story.

> Uniform, axis-free sparklines at identical size. The favorable-direction
> coloring is the subtle-but-critical touch: a *falling* CPI or USD/VND shows a
> **green** delta because `FavorableDirection = down`.

---

## Page 3 — Advisor Cockpit

*Theme heatmap + narrative briefs. "So what do I tell my client?"* — the payoff
page and the seed for report automation.

**Layout**: [ Theme-score heatmap (left ≈½) | Advisor-brief exception panels
(right ≈½) ] → conviction leaderboard (bottom strip).

### Left — investment-theme heatmap (`theme_summary`)

A **highlight table** (text table with color-encoded cells):

- **Rows** = 6 themes (`ThemeNameVi`), sorted by `OverallScore` desc.
- **Columns** = `MomentumScore`, `ValuationScore`, `EarningsScore`, `FlowScore`,
  `OverallScore`.
- **Cell color** = a **diverging ramp centered at 0** (red −100 → grey 0 →
  green +100) bound to the score **measure** (per the Cloud color-binding rule;
  a dimension pill won't bind). Cell label = the numeric score.
- Tooltip = `RationaleVi` so hovering a theme explains *why* it scores that way.

Themes & mid-2026 story (calibrated): Investment-led growth (Favorable) ·
Earnings delivery (Favorable) · Banking liquidity (Favorable) · Inflation
pressure–contained (Neutral) · Foreign-flow pressure (Neutral, improving) ·
FX stability (Neutral/negative — the one red row).

### Right — advisor briefs (`advisor_brief`), Wealth-&-Banking cockpit style

Stacked exception cards grouped by `Category` with colored headers —
**CƠ HỘI (Opportunity)** green · **RỦI RO (Risk)** red · **CHẤT XÚC TÁC
(Catalyst)** blue. Each brief renders as a compact row:

- A **colored signal pill** (`Signal`: Tăng tỷ trọng / Phòng vệ / Theo dõi / …).
- `TitleVi` (one-line headline) + `TargetSegment` chip (Ngân hàng Ưu tiên / SME /
  DN Lớn / Cá nhân).
- An **in-cell conviction bar** (`Conviction` 1–5) + `ConvictionLabel`.
- Tooltip / expand = `ThesisVi` + the ready-to-say **`TalkingPointVi`**.

This is exactly where the AI agent's generated advisor talking points land: the
`advisor_brief` rows are the *seed*; the agent expands them per client on demand.

### Bottom — conviction leaderboard

Ranked horizontal bar of `advisor_brief` by `Conviction` (sequential blue),
labeled with `TitleVi` — mirrors the heatmap's Overall column so the cockpit
offers both a matrix and a leaderboard view.

---

## The narrative arc (why this convinces)

1. **Data** — 6 source-attributed tables; VN-Index can run on *real* VNDIRECT
   data (`--live`), the rest calibrated to published figures.
2. **Dashboard** — Page 1 answers "where are we", Page 2 "why", Page 3 "so what".
3. **Insight** — the theme heatmap + event-annotated index turn numbers into a
   read of the market.
4. **Advisor Brief** — Page 3 briefs give an RM a client-ready talking point,
   tied to an ACB segment and product (deposits→equities rotation, FX hedging,
   ACBS funds, SME working-capital, ACB ONE Biz CASA).
5. **Report Automation** — the AI agent drafts the monthly market report from
   these same tables (see the agent persona in
   `apps/web/lib/system-prompt.ts`, `advisory: "market-intelligence"`).

## Build notes (extract-workbook path)

- Clone `services/factory/scripts/vacs/vacs_lib.py` → `acb_lib.py`; set `_SCHEMA`
  to the 6 tables, `HYPER`/`dbname` to `acb`, palette to the ACB tokens, and the
  `Demo/ACB` project id (printed by `provision_acb.py --publish`).
- **PROBE the risky viz first** (visible sheets → REST render → read PNG):
  the diverging-ramp highlight-table, the reference-banded index line with event
  annotations, and the favorable-direction delta coloring.
- Hide all worksheet tabs (`hidden='true'`); only the 3 dashboard windows show.
- Sequential zone-id counter for layout-flow (hash ids collide → overlapping
  zones).
