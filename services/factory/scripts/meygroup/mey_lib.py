"""Mey Group workbook builder library.

Templates the _seed_desktop datasources block (86 metadata records + collection
relations) and provides helpers to build KPI cards, charts, and layout-flow
dashboards. All Vietnamese labels, VND shown as tỷ (÷1e9).

Field name notes (from seed metadata):
- Sales is the fact table → its fields are UNQUALIFIED:
  ProjectName, SaleId, UnitType, CustomerSegment, ClosedDate, AgentId, DealValueVnd
- Other tables' shared fields are QUALIFIED:
  Leads: [ProjectName (Leads)], [CustomerSegment (Leads)], [AgentId (Leads)],
         Status, Source, SanGiaoDich, CreatedDate, LeadName, LeadId
  Collections: [ProjectName (Collections)], [SaleId (Collections)], MilestoneType,
         AgingBucket, DueDate, AmountDueVnd, AmountCollectedVnd
  MonthlyFinancial: [ProjectName (MonthlyFinancial)], [Region (MonthlyFinancial)],
         Month, UnitsSold, RevenueVnd, CashCollectedVnd, CostVnd, ProfitVnd
  PlanTargets: [Month (PlanTargets)], Metric, PlanValue, ActualValue
  Agencies: AgencyName, LeadsReferred, NetCount, VisitCount, BookingCount,
         DealCount, [RevenueVnd (Agencies)], SupportBudgetVnd, ConversionRate
  Packages: [ProjectName (Packages)], PackageName, [Status (Packages)],
         ProgressPct, DelayWeeks, BlockingDepartment
  HRMetrics: Department, [Month (HRMetrics)], Headcount, PayrollPlanVnd,
         PayrollActualVnd, AttritionRate, NewHires, KpiProgressPct, TrainingKpiPct
  Projects: [ProjectName (Projects)], City, Province, District, Region, Stage,
         Country, TargetDeals, TargetRevenueVnd, Latitude, Longitude
"""
from __future__ import annotations
import re
import uuid
from pathlib import Path

DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
SEED_BLOCK = Path("/tmp/mey-seed-block.xml")

_ZID = [3000]
def _zid() -> int:
    _ZID[0] += 1
    return _ZID[0]

def reset_zids():
    _ZID[0] = 3000

def U() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"

def esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


# ─── Calc field registry ────────────────────────────────────────────────────
class Calc:
    def __init__(self, cid, caption, dt, role, ct, formula, fmt=None):
        self.cid = f"Calculation_{cid}"
        self.caption = caption
        self.dt = dt
        self.role = role
        self.ct = ct
        self.formula = formula
        self.fmt = fmt

    def full_col(self) -> str:
        fs = f" default-format='{esc(self.fmt)}'" if self.fmt else ""
        return (f"      <column caption='{esc(self.caption)}' datatype='{self.dt}'{fs} "
                f"name='[{self.cid}]' role='{self.role}' type='{self.ct}'>\n"
                f"        <calculation class='tableau' formula='{esc(self.formula)}' />\n"
                f"      </column>")

    def dep_col(self) -> str:
        fs = f" default-format='{esc(self.fmt)}'" if self.fmt else ""
        return (f"            <column caption='{esc(self.caption)}' datatype='{self.dt}'{fs} "
                f"name='[{self.cid}]' role='{self.role}' type='{self.ct}' />")

    def inst(self, kind=None) -> str:
        k = kind or ("qk" if self.ct == "quantitative" else "nk")
        typ = "quantitative" if k == "qk" else "nominal"
        return (f"            <column-instance column='[{self.cid}]' derivation='User' "
                f"name='[usr:{self.cid}:{k}]' pivot='key' type='{typ}' />")

    def ref(self, kind=None) -> str:
        k = kind or ("qk" if self.ct == "quantitative" else "nk")
        return f"[{DS}].[usr:{self.cid}:{k}]"


def load_ds_block(calcs: list[Calc]) -> str:
    """Inject calc-field <column> defs before the sqlproxy datasource's real
    structural close. NOTE: the seed block embeds a copy of the datasource XML
    inside a <![CDATA[ ... </datasource> ... ]]> (a repository-location), so the
    FIRST </datasource> is inside CDATA — injecting there corrupts the XML.
    rfind() correctly targets the LAST </datasource> (the real structural close
    of the sqlproxy datasource), which is what we want."""
    block = SEED_BLOCK.read_text(encoding="utf-8")
    calc_xml = "\n".join(c.full_col() for c in calcs)
    idx = block.rfind("</datasource>")
    return block[:idx] + calc_xml + "\n    " + block[idx:]


# ─── Raw column ref helpers ─────────────────────────────────────────────────
def raw_dep(name, agg, dt, role="measure", def_type="quantitative", type_attr=None,
            caption=None, sem=None) -> str:
    ta = type_attr or def_type
    cap = f" caption='{esc(caption)}'" if caption else ""
    sr = f" semantic-role='{sem}'" if sem else ""
    return (f"            <column aggregation='{agg}'{cap} datatype='{dt}' default-type='{def_type}' "
            f"layered='true' name='[{name}]' pivot='key' role='{role}'{sr} type='{ta}' "
            f"user-datatype='{dt}' visual-totals='Default' />")

def inst_dim(name) -> str:
    return f"            <column-instance column='[{name}]' derivation='None' name='[none:{name}:nk]' pivot='key' type='nominal' />"

def inst_agg(name, agg="Sum", suffix="qk") -> str:
    typ = "quantitative" if suffix == "qk" else "nominal"
    return f"            <column-instance column='[{name}]' derivation='{agg}' name='[{agg.lower()[:3]}:{name}:{suffix}]' pivot='key' type='{typ}' />"

def inst_month(name) -> str:
    return f"            <column-instance column='[{name}]' derivation='Month' name='[mn:{name}:ok]' pivot='key' type='ordinal' />"

def ref_dim(name): return f"[{DS}].[none:{name}:nk]"
def ref_agg(name, agg="sum"): return f"[{DS}].[{agg[:3]}:{name}:qk]"
def ref_month(name): return f"[{DS}].[mn:{name}:ok]"
def ref_cntd(name): return f"[{DS}].[ctd:{name}:qk]"
def inst_cntd(name): return f"            <column-instance column='[{name}]' derivation='Cntd' name='[ctd:{name}:qk]' pivot='key' type='quantitative' />"


# ─── KPI card ───────────────────────────────────────────────────────────────
def kpi_card(sheet_name: str, calc: Calc, title_vn: str) -> str:
    """KPI card cloned EXACTLY from the user's Desktop-authored `KPI Seed`
    worksheet (services/factory/scripts/meygroup/_seed_desktop). The proven
    geometry: single-run customized-label at 28px navy bold, mark-labels-cull
    ='true' (culprit of the earlier vertical clipping was cull='false', which
    force-renders the glyph even when the mark cell is shorter than it), empty
    <style/>, and the number format carried by the calc's own default-format.
    We only ADD a layout-options title for the Vietnamese uppercase label —
    proven safe by the seed's `Revenue KPI` card, which also carries a title."""
    field = calc.ref()
    label = esc(title_vn.upper())
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontsize='9' bold='true' fontcolor='#5A6B7B'>{label}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='meygroup' name='{DS}' />
          </datasources>
          <datasource-dependencies datasource='{DS}'>
{calc.dep_col()}
{calc.inst()}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style />
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings><text column='{field}' /></encodings>
            <customized-label>
              <formatted-text>
                <run bold='true' fontalignment='1' fontcolor='#0f2a47' fontsize='18'><![CDATA[<{field}>]]></run>
              </formatted-text>
            </customized-label>
            <style>
              <style-rule element='mark'>
                <format attr='mark-labels-show' value='true' />
                <format attr='mark-labels-cull' value='true' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows /><cols />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Generic chart ──────────────────────────────────────────────────────────
def exclude_ciel_filter(field: str) -> tuple[str, str]:
    """Return (dep_instance, filter_xml) that excludes Mey Pearl Ciel rows via
    a categorical filter on the given qualified project-name field.
    `field` e.g. 'ProjectName (Leads)' or 'ProjectName'."""
    inst = f"            <column-instance column='[{field}]' derivation='None' name='[none:{field}:nk]' pivot='key' type='nominal' />"
    filt = (f"          <filter class='categorical' column='[{DS}].[none:{field}:nk]'>\n"
            f"            <groupfilter function='except' user:ui-domain='database' user:ui-enumeration='exclusive' user:ui-marker='enumerate'>\n"
            f"              <groupfilter function='member' level='[none:{field}:nk]' member='&quot;Mey Pearl Ciel Phú Quốc&quot;' />\n"
            f"            </groupfilter>\n"
            f"          </filter>")
    return inst, filt


def chart(sheet_name, title_vn, deps, insts, rows, cols, mark="Bar", encodings=None,
          filters=None, color_palette=None, single_color=None, hide_axis_titles=True):
    """Premium chart. Options:
    - color_palette: name of a registered palette (e.g. 'Mey Sequential Blue')
      applied to the color encoding so bars grade as one brand family.
    - single_color: hex for a flat single-color bar (no legend), e.g. '#1B75BC'.
    - hide_axis_titles: drop the noisy '[Field] Vnd' axis captions.
    """
    enc = ""
    if encodings:
        enc = "            <encodings>\n" + "".join(f"              <{k} column='{c}' />\n" for k, c in encodings) + "            </encodings>\n"
    db = "\n".join(deps)
    ib = "\n".join(insts)
    filt_xml = ("\n" + "\n".join(filters)) if filters else ""

    # Worksheet-level style: remove chart junk (gridlines, zero line, axis rulers).
    ws_style = (
        "        <style>\n"
        "          <style-rule element='pane'>\n"
        "            <format attr='grid-line-show' value='false' />\n"
        "            <format attr='zero-line-show' value='false' />\n"
        "          </style-rule>\n"
        "          <style-rule element='axis'>\n"
        "            <format attr='rule-color' value='#C3CDD8' />\n"
        "            <format attr='tick-color' value='#E3E9EF' />\n"
        "          </style-rule>\n"
        "        </style>"
    )

    # Pane-level style: slim bars + brand color. NO mark labels on charts —
    # they clutter ranking bars with long raw numbers; the axis carries scale.
    pane_style_rules = []
    if mark == "Bar":
        pane_style_rules.append("                <format attr='mark-bar-size' value='0.72' />")
    if mark == "Pie":
        # A pie with no Size field renders at a tiny default radius; force a
        # large fixed mark size so the donut fills its card.
        pane_style_rules.append("                <format attr='mark-size' value='1.0' />")
    if single_color:
        pane_style_rules.append(f"                <format attr='mark-color' value='{single_color}' />")
    pane_style = (("            <style>\n              <style-rule element='mark'>\n"
                   + "\n".join(pane_style_rules)
                   + "\n              </style-rule>\n            </style>\n")
                  if pane_style_rules else "")

    # Colour-palette binding on the color encoding (if any encoding is 'color').
    enc_block = enc
    if color_palette and encodings:
        # Replace the plain <color column=...> with a palette-bound encoding.
        for k, c in encodings:
            if k == "color":
                plain = f"              <color column='{c}' />\n"
                bound = (f"              <color column='{c}' palette='{color_palette}' "
                         f"type='palette' />\n")
                enc_block = enc_block.replace(plain, bound)

    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='#0F2A47'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='meygroup' name='{DS}' />
          </datasources>
          <datasource-dependencies datasource='{DS}'>
{db}
{ib}
          </datasource-dependencies>{filt_xml}
          <aggregation value='true' />
        </view>
{ws_style}
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='{mark}' />
{enc_block}{pane_style}          </pane>
        </panes>
        <rows>{rows}</rows>
        <cols>{cols}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Ring / donut % gauge (dual-pie donut, cloned from Superstore2 `Segment`) ─
def ring_card(sheet_name, pct_calc: Calc, dat_calc: Calc, remain_calc: Calc,
              zero_calc: Calc, dummy_calc: Calc, center_pct_text: str,
              ring_color="#1F8A70"):
    """% hoàn thành donut gauge using the two-stacked-pie technique from the
    user's Superstore reference: a placeholder measure (zero) is placed on rows
    TWICE `(zero+zero)` → dual axis → two Pie panes stacked at the same spot.
    Pane 0 = big pie (green Đạt arc + grey Còn lại arc, wedge-size=Multiple
    Values). Pane 1 = smaller WHITE pie on top → punches the donut hole. The
    hole shows center_pct_text via the title. A single-pie has no hole (renders
    as a solid dot — the earlier bug)."""
    dat = f"[{DS}].[usr:{dat_calc.cid}:qk]"
    rem = f"[{DS}].[usr:{remain_calc.cid}:qk]"
    # min0 measure: User-derived (matches Superstore Donut Seed usr:...737307)
    zero = f"[{DS}].[usr:{zero_calc.cid}:qk]"
    dummy = f"[{DS}].[none:{dummy_calc.cid}:nk]"
    mn = f"[{DS}].[:Measure Names]"
    mv = f"[{DS}].[Multiple Values]"
    zero_dep = (zero_calc.dep_col() + "\n" + zero_calc.inst())
    dummy_dep = (dummy_calc.dep_col() + "\n"
                 f"            <column-instance column='[{dummy_calc.cid}]' derivation='None' "
                 f"name='[none:{dummy_calc.cid}:nk]' pivot='key' type='nominal' />")
    deps = "\n".join([pct_calc.dep_col(), dat_calc.dep_col(), remain_calc.dep_col(),
                      pct_calc.inst(), dat_calc.inst(), remain_calc.inst(),
                      zero_dep, dummy_dep])
    # Cloned VERBATIM from the user's `Donut Seed` (pasted Superstore `pies`):
    # cols = (min0 + min0) → two zero-width axes at same x → panes overlay.
    # rows = gauge dummy dim (single row). Pane id='1' (x-index='1') = the WHITE
    # hole pie ON TOP (smaller). Pane id='2' = the colored donut BEHIND (bigger,
    # color=Measure Names Đạt/Còn-lại, size=Multiple Values). The white pie
    # punches the hole → donut. % shown big in the hole via the title.
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontsize='21' bold='true' fontcolor='{ring_color}'>{esc(center_pct_text)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='meygroup' name='{DS}' />
          </datasources>
          <datasource-dependencies datasource='{DS}'>
{deps}
          </datasource-dependencies>
          <filter class='categorical' column='{mn}'>
            <groupfilter function='union' user:op='manual'>
              <groupfilter function='member' level='[:Measure Names]' member='&quot;{dat}&quot;' />
              <groupfilter function='member' level='[:Measure Names]' member='&quot;{rem}&quot;' />
            </groupfilter>
          </filter>
          <manual-sort column='{mn}' direction='ASC'>
            <dictionary>
              <bucket>&quot;{dat}&quot;</bucket>
              <bucket>&quot;{rem}&quot;</bucket>
            </dictionary>
          </manual-sort>
          <slices><column>{mn}</column></slices>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='axis'>
            <format attr='display' class='1' field='{zero}' scope='cols' value='false' />
            <encoding attr='space' class='1' field='{zero}' field-type='quantitative' fold='true' scope='cols' type='space' />
            <format attr='display' class='0' field='{zero}' scope='cols' value='false' />
            <format attr='tick-color' value='#00000000' />
          </style-rule>
          <style-rule element='header'>
            <format attr='border-width' data-class='total' value='0' />
            <format attr='border-style' data-class='total' value='none' />
          </style-rule>
          <style-rule element='label'><format attr='display' field='{dummy}' value='false' /></style-rule>
          <style-rule element='pane'>
            <format attr='border-width' data-class='total' value='0' />
            <format attr='border-style' data-class='total' value='none' />
          </style-rule>
          <style-rule element='table'><format attr='background-color' value='#00000000' /></style-rule>
          <style-rule element='worksheet'><format attr='display-field-labels' scope='rows' value='false' /></style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Pie' />
          </pane>
          <pane id='1' selection-relaxation-option='selection-relaxation-allow' x-axis-name='{zero}' x-index='1'>
            <view><breakdown value='auto' /></view>
            <mark class='Pie' />
            <mark-sizing mark-sizing-setting='marks-scaling-off' />
            <style><style-rule element='mark'>
              <format attr='size' value='0.72' />
              <format attr='mark-labels-show' value='false' />
              <format attr='mark-color' value='#FFFFFF' />
            </style-rule></style>
          </pane>
          <pane id='2' selection-relaxation-option='selection-relaxation-allow' x-axis-name='{zero}'>
            <view><breakdown value='auto' /></view>
            <mark class='Pie' />
            <mark-sizing mark-sizing-setting='marks-scaling-off' />
            <encodings>
              <color column='{mn}' palette='ring_gauge' type='palette' />
              <size column='{mv}' />
            </encodings>
            <style><style-rule element='mark'><format attr='size' value='1.10' /></style-rule></style>
          </pane>
        </panes>
        <rows>{dummy}</rows>
        <cols>({zero} + {zero})</cols>
        <tooltip-style tooltip-mode='none' />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Bullet chart: KHNS ghost bar (wide, behind) + actual bar (brand, front) ──
def bullet_chart(sheet_name, title_vn, month_field, actual_calc_name, plan_calc_name,
                 kpi_calc_name=None, fmt='n#,##0,,,"tỷ"'):
    """Monthly plan-vs-actual: a wide grey KHNS ghost bar with the brand-blue
    actual bar overlaid thinner in front (dual-axis, synchronized) — the exact
    structure of the user's Desktop `Bullet Seed`. `kpi_calc_name` is accepted
    for API symmetry but rendered as a thin gold KPI marker bar on a 3rd
    synchronized measure only when provided (avoids the unverified reference-line
    XML). month_field e.g. 'Month'; *_calc_name are RAW measure names."""
    def sref(n): return f"[{DS}].[sum:{n}:qk]"
    def rawcol(n): return (f"            <column aggregation='Sum' datatype='integer' default-type='quantitative' "
                           f"layered='true' name='[{n}]' pivot='key' role='measure' type='quantitative' "
                           f"user-datatype='integer' visual-totals='Default' />")
    def sinst(n): return f"            <column-instance column='[{n}]' derivation='Sum' name='[sum:{n}:qk]' pivot='key' type='quantitative' />"
    act, plan = sref(actual_calc_name), sref(plan_calc_name)
    month_inst = f"[{DS}].[mn:{month_field}:ok]"
    kpi = sref(kpi_calc_name) if kpi_calc_name else None
    measures = [actual_calc_name, plan_calc_name] + ([kpi_calc_name] if kpi_calc_name else [])
    dep_names = [
        f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' layered='true' name='[{month_field}]' pivot='key' role='dimension' type='ordinal' user-datatype='datetime' visual-totals='Default' />",
    ] + [rawcol(n) for n in measures] + [
        f"            <column-instance column='[{month_field}]' derivation='Month' name='[mn:{month_field}:ok]' pivot='key' type='ordinal' />",
    ] + [sinst(n) for n in measures]
    deps = "\n".join(dep_names)
    mn = f"[{DS}].[:Measure Names]"
    # Grouped/dodged bars — the exact idiom of the user's working Bullet Seed:
    # rows = measure-blend (sum:actual + sum:plan [+ sum:kpi]); cols = (Month /
    # :Measure Names) so the measures dodge side-by-side within each month;
    # color = Measure Names bound to the mey KHNS/KPI palette. Renders reliably
    # on Cloud (an overlaid dual-axis via <join-axes> is rejected — 500000).
    rows_blend = " + ".join([act, plan] + ([kpi] if kpi else []))
    # Measure Names filter keeps only our series, in order actual/plan/kpi.
    members = "\n".join(
        f"              <groupfilter function='member' level='[:Measure Names]' member='&quot;{sref(n)}&quot;' />"
        for n in measures)
    order = "\n".join(f"              <bucket>&quot;{sref(n)}&quot;</bucket>" for n in measures)
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='#0F2A47'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='meygroup' name='{DS}' />
          </datasources>
          <datasource-dependencies datasource='{DS}'>
{deps}
          </datasource-dependencies>
          <filter class='categorical' column='{mn}'>
            <groupfilter function='union' user:op='manual'>
{members}
            </groupfilter>
          </filter>
          <manual-sort column='{mn}' direction='ASC'>
            <dictionary>
{order}
            </dictionary>
          </manual-sort>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='false' />
          </style-rule>
          <style-rule element='axis'>
            <format attr='rule-color' value='#C3CDD8' /><format attr='tick-color' value='#E3E9EF' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Bar' />
            <encodings>
              <color column='{mn}' palette='mey_khns_kpi' type='palette' />
              <text column='[{DS}].[Multiple Values]' />
            </encodings>
            <style>
              <style-rule element='mark'><format attr='mark-bar-size' value='0.80' /></style-rule>
            </style>
          </pane>
        </panes>
        <rows>[{DS}].[Multiple Values]</rows>
        <cols>([{DS}].[mn:{month_field}:ok] / {mn})</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Design tokens (Meyland brand + Ciel resort palette, light-elegant) ─────
BG_PAGE   = "#F5F8FB"   # canvas — "tinh khiết" trắng xanh nhạt
BG_CARD   = "#FFFFFF"   # card fill
BORDER    = "#E3E9EF"   # card border / gridline
NAVY      = "#0F2A47"   # titles, header band, deep sequential end
BRAND     = "#1B75BC"   # Mey primary blue (single-color bars)
CYAN      = "#29ABE2"   # accent / divider
BODY      = "#5A6B7B"   # secondary text


# ─── Dashboard layout-flow ──────────────────────────────────────────────────
# Tableau's feature-flagged rounded-corner format (from the user's Desktop
# Dashboard 1). Requires the DashboardRoundedCorners FCP entry in the workbook
# manifest (see workbook()). value = corner radius in px.
ROUNDED = "<_.fcp.DashboardRoundedCorners.true...format attr='corner-radius' value='14' />"

def leaf(name, minw=80, w=100000):
    # Floating card: soft border + rounded corners + generous gutter (margin) +
    # inner padding so each viz breathes — the premium card treatment matching
    # the approved v3 mockup + the user's Superstore reference.
    return (f"              <zone h='100000' id='{_zid()}' name='{esc(name)}' w='{w}' x='0' y='0'>\n"
            f"                <layout-cache minwidth='{minw}' type-h='scalable' type-w='scalable' />\n"
            f"                <zone-style>"
            f"<format attr='border-color' value='{BORDER}' />"
            f"<format attr='border-style' value='solid' />"
            f"<format attr='border-width' value='1' />"
            f"{ROUNDED}"
            f"<format attr='margin' value='9' />"
            f"<format attr='padding' value='10' />"
            f"<format attr='background-color' value='{BG_CARD}' />"
            f"</zone-style>\n"
            f"              </zone>")

def header_band(title_vn: str, subtitle_vn: str) -> str:
    """Branded navy header band + a thin cyan divider stripe beneath. Placed
    first in a dashboard's rows_xml."""
    tid = _zid()
    band = (f"          <zone h='9000' id='{tid}' type-v2='text' w='100000' x='0' y='0'>\n"
            f"            <formatted-text>\n"
            f"              <run fontname='Tableau Bold' fontsize='19' bold='true' fontcolor='#FFFFFF'>Mey Group</run>\n"
            f"              <run fontname='Tableau Book' fontsize='13' fontcolor='#7FC4EC'>   |   {esc(title_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='11' fontcolor='#B9D9EE'>    ·   {esc(subtitle_vn)}</run>\n"
            f"            </formatted-text>\n"
            f"            <zone-style>"
            f"<format attr='border-style' value='none' /><format attr='border-width' value='0' />"
            f"<format attr='margin' value='0' /><format attr='padding' value='16' />"
            f"<format attr='background-color' value='{NAVY}' /></zone-style>\n"
            f"          </zone>")
    stripe = (f"          <zone h='500' id='{_zid()}' type-v2='empty' w='100000' x='0' y='0'>\n"
              f"            <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
              f"<format attr='margin' value='0' /><format attr='background-color' value='{CYAN}' /></zone-style>\n"
              f"          </zone>")
    return band + "\n" + stripe

def hrow(names, h, minw=80, weights=None):
    """Horizontal row. NOTE: Tableau layout-flow splits EQUALLY regardless of
    zone w= — `weights` only helps in nested layouts; for true different widths
    put a chart on its own row."""
    if weights:
        total = sum(weights)
        ws = [int(100000 * wt / total) for wt in weights]
        body = "\n".join(leaf(n, minw, w=ws[i]) for i, n in enumerate(names))
    else:
        body = "\n".join(leaf(n, minw) for n in names)
    return (f"          <zone h='{h}' id='{_zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n{body}\n          </zone>")

def dashboard(name, rows_xml, width=1400, height=1100):
    """Fixed-size dashboard. FIXED sizing (not 'automatic') is essential: with
    automatic sizing the row `h=` values are only relative weights that map to
    an unpredictable pixel height Cloud picks per-render, so a KPI hero number
    fits at one canvas size and clips at another (the root cause of every KPI
    layout failure). A fixed height pins each row's h/100000 weight to stable
    pixels. The user's Desktop dashboards use the same fixed-size pattern."""
    reset_zids()
    body = "\n".join(rows_xml)
    outer = _zid()
    return f"""    <dashboard enable-sort-zone-taborder='true' name='{esc(name)}'>
      <style />
      <size maxheight='{height}' maxwidth='{width}' minheight='{height}' minwidth='{width}' />
      <zones>
        <zone h='100000' id='{outer}' type-v2='layout-basic' w='100000' x='0' y='0'>
          <zone h='100000' id='{_zid()}' param='vert' type-v2='layout-flow' w='100000' x='0' y='0'>
{body}
          </zone>
          <zone-style><format attr='border-color' value='#000000' /><format attr='border-style' value='none' /><format attr='border-width' value='0' /><format attr='margin' value='8' /><format attr='background-color' value='{BG_PAGE}' /></zone-style>
        </zone>
      </zones>
      <simple-id uuid='{U()}' />
    </dashboard>"""


def workbook(calcs, sheets_xml, sheet_names, dashboard_xml, dash_name):
    ds_block = load_ds_block(calcs)
    ws = "  <worksheets>\n" + "\n".join(sheets_xml) + "\n  </worksheets>\n"
    dash = "  <dashboards>\n" + dashboard_xml + "\n  </dashboards>\n"
    hidden = "".join(f"    <window class='worksheet' hidden='true' name='{esc(n)}'></window>\n" for n in sheet_names)
    vps = "\n".join(f"        <viewpoint name='{esc(n)}'><zoom type='entire-view' /></viewpoint>" for n in sheet_names)
    dash_win = f"    <window class='dashboard' maximized='true' name='{esc(dash_name)}'>\n      <viewpoints>\n{vps}\n      </viewpoints>\n    </window>\n"
    windows = "  <windows>\n" + hidden + dash_win + "  </windows>\n"
    return f"""<?xml version='1.0' encoding='utf-8' ?>
<workbook original-version='18.1' source-build='2026.1.1 (20261.26.0410.0924)' version='18.1' xml:base='https://prod-apsoutheast-c.online.tableau.com' xmlns:user='http://www.tableausoftware.com/xml/user'>
  <document-format-change-manifest>
    <_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners />
    <ObjectModelEncapsulateLegacy />
    <ObjectModelSharedDimensions />
    <ObjectModelTableType />
    <SchemaViewerObjectModel />
  </document-format-change-manifest>
  <preferences>
    <color-palette name='Mey Sequential Blue' type='ordered-sequential'>
      <color>#D6ECF8</color>
      <color>#9FD3EF</color>
      <color>#5FB4E5</color>
      <color>#29ABE2</color>
      <color>#1B75BC</color>
      <color>#0F2A47</color>
    </color-palette>
    <color-palette name='Mey Categorical' type='regular'>
      <color>#1B75BC</color>
      <color>#29ABE2</color>
      <color>#0F2A47</color>
      <color>#2AA79B</color>
      <color>#C9A24B</color>
      <color>#8E7CC3</color>
    </color-palette>
    <color-palette name='ring_gauge' type='regular'>
      <color>#1F8A70</color>
      <color>#E7EDF3</color>
    </color-palette>
    <color-palette name='mey_khns_kpi' type='regular'>
      <color>#1B75BC</color>
      <color>#C7D2DE</color>
      <color>#C29B54</color>
    </color-palette>
  </preferences>
  {ds_block}
{ws}{dash}{windows}</workbook>
"""


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml)
        return "✓"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"
