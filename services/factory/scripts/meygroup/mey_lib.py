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
    field = calc.ref()
    fmt = esc(calc.fmt or "n#,##0")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Book' fontsize='10' fontcolor='#6B7280'>{esc(title_vn)}</run></formatted-text></title>
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
        <style>
          <style-rule element='cell'><format attr='text-format' field='{field}' value='{fmt}' /></style-rule>
          <style-rule element='label'><format attr='text-format' field='{field}' value='{fmt}' /></style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings><text column='{field}' /></encodings>
            <customized-label>
              <formatted-text>
                <run fontname='Tableau Book' fontalignment='1' fontsize='20' bold='true' fontcolor='#0F2A47'><![CDATA[<{field}>]]></run>
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
          filters=None):
    enc = ""
    if encodings:
        enc = "            <encodings>\n" + "".join(f"              <{k} column='{c}' />\n" for k, c in encodings) + "            </encodings>\n"
    db = "\n".join(deps)
    ib = "\n".join(insts)
    filt_xml = ("\n" + "\n".join(filters)) if filters else ""
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Book' fontsize='12' bold='true' fontcolor='#0F2A47'>{esc(title_vn)}</run></formatted-text></title>
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
        <style />
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='{mark}' />
{enc}          </pane>
        </panes>
        <rows>{rows}</rows>
        <cols>{cols}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Dashboard layout-flow ──────────────────────────────────────────────────
def leaf(name, minw=80, w=100000):
    return (f"              <zone h='100000' id='{_zid()}' name='{esc(name)}' w='{w}' x='0' y='0'>\n"
            f"                <layout-cache minwidth='{minw}' type-h='scalable' type-w='scalable' />\n"
            f"                <zone-style><format attr='border-color' value='#e5e7eb' /><format attr='border-style' value='solid' /><format attr='border-width' value='1' /><format attr='margin' value='3' /><format attr='background-color' value='#FFFFFF' /></zone-style>\n"
            f"              </zone>")

def hrow(names, h, minw=80, weights=None):
    """Horizontal row. `weights` = list of relative widths (same length as
    names); Tableau distributes leaf zones proportional to their `w`. Default
    equal split."""
    if weights:
        total = sum(weights)
        ws = [int(100000 * wt / total) for wt in weights]
        body = "\n".join(leaf(n, minw, w=ws[i]) for i, n in enumerate(names))
    else:
        body = "\n".join(leaf(n, minw) for n in names)
    return (f"          <zone h='{h}' id='{_zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n{body}\n          </zone>")

def dashboard(name, rows_xml):
    reset_zids()
    body = "\n".join(rows_xml)
    outer = _zid()
    return f"""    <dashboard enable-sort-zone-taborder='true' name='{esc(name)}'>
      <style />
      <size sizing-mode='automatic' />
      <zones>
        <zone h='100000' id='{outer}' type-v2='layout-basic' w='100000' x='0' y='0'>
          <zone h='100000' id='{_zid()}' param='vert' type-v2='layout-flow' w='100000' x='0' y='0'>
{body}
          </zone>
          <zone-style><format attr='border-color' value='#000000' /><format attr='border-style' value='none' /><format attr='border-width' value='0' /><format attr='margin' value='8' /><format attr='background-color' value='#F7F7F7' /></zone-style>
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
    <ObjectModelEncapsulateLegacy />
    <ObjectModelSharedDimensions />
    <ObjectModelTableType />
    <SchemaViewerObjectModel />
  </document-format-change-manifest>
  <preferences />
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
