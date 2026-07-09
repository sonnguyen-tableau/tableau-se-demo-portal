"""MediaMart workbook builder library — self-contained .twbx extract-workbook.

Adapted from scripts/shb/shb_lib.py (the proven VACS/SHB pattern). One
`<datasource>` PER TABLE, each a single-relation federated hyper connection to
the SAME packaged mediamart.hyper. Every worksheet is single-table, so each
sheet points at its table's datasource — no cross-table join is ever needed at
render time (the star schema was already pre-joined in pandas into 3
self-sufficient tables: SalesFact, CustomerSummary, InventorySnapshot). Field
names are BARE (no `[Field (Table)]` qualification) because each datasource is
isolated.

Publishes with skip_connection_check=True — renders on Cloud with NO sqlproxy
seed block.

Design system (MediaMart brand): red #E50914, gold #F2B705, ink #0F172A.
100% Vietnamese labels. Clean title block (no colored header band).
"""
from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

CONN_PREFIX = "hyperconn"
HYPER = Path("/tmp/mediamart/mediamart.hyper")
HYPER_ARCNAME = "Data/Datasources/mediamart.hyper"
OUT_DIR = Path("/tmp/mediamart")

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


def esc_attr(s: str) -> str:
    """esc() plus single-quote → &apos; — needed for values placed inside a
    single-quoted XML attribute (e.g. a calc `formula='...'` that itself
    contains string literals like [Status]='Completed')."""
    return esc(s).replace("'", "&apos;")


def base_field(ref: str) -> str:
    """Derive the BASE column name from a field ref/instance, for a worksheet
    `<encoding attr='color' field=...>` (which keys off the base field, NOT the
    aggregated instance — the POS-cockpit / meygroup pattern).
      [ds].[usr:Calculation_x:qk] -> [Calculation_x]
      [ds].[sum:LineTotal:qk]     -> [LineTotal]
      [ds].[none:Category:nk]     -> [Category]
    """
    inst = ref.split(".")[-1].strip("[]")   # e.g. usr:Calculation_x:qk
    parts = inst.split(":")
    core = parts[1] if len(parts) >= 3 else parts[0]
    return f"[{core}]"


# ─── Design tokens (MediaMart brand: red #E50914, gold #F2B705) ─────────────
BG_PAGE = "#EEF1F5"
BG_CARD = "#FFFFFF"
BORDER  = "#E2E8F0"
INK     = "#0F172A"   # ink — titles, deep sequential end
BRAND   = "#E50914"   # MediaMart red — KPI accents, primary highlight
GOLD    = "#F2B705"   # target ticks / accent
BODY    = "#5A6B7B"
MUTED   = "#64748B"
GOOD    = "#16A34A"
WARN    = "#E8A317"
BAD     = "#DC2626"
GREY    = "#CBD5E1"

# Sequential ramp for measure-emphasis (max = darkest). Use Tableau's BUILT-IN
# `red_10_0` — a custom named `ordered-sequential` palette does NOT bind via a
# `type='interpolated'` encoding on this Cloud (falls back to default blue); the
# built-in red ramp is server-reliable AND on-brand (MediaMart red).
SEQ_PALETTE = "red_10_0"


# ─── Schema: table → [(col, datatype, role)] ────────────────────────────────
# datatype ∈ {string, integer, real, datetime}; role ∈ {dimension, measure}
_SCHEMA: dict[str, list[tuple[str, str, str]]] = {
    "SalesFact": [
        ("OrderLineId", "integer", "dimension"), ("OrderId", "integer", "dimension"),
        ("ProductId", "integer", "dimension"), ("Quantity", "integer", "measure"),
        ("UnitPrice", "real", "measure"), ("Discount", "real", "measure"),
        ("LineTotal", "real", "measure"), ("LineCost", "real", "measure"),
        ("LoyaltyPointsUsed", "integer", "measure"), ("OrderDate", "datetime", "dimension"),
        ("CustomerId", "integer", "dimension"), ("StoreId", "integer", "dimension"),
        ("ChannelId", "integer", "dimension"), ("Status", "string", "dimension"),
        ("PaymentMethod", "string", "dimension"), ("ProductName", "string", "dimension"),
        ("Category", "string", "dimension"), ("SubCategory", "string", "dimension"),
        ("Brand", "string", "dimension"), ("CustomerName", "string", "dimension"),
        ("Tier", "string", "dimension"), ("Segment", "string", "dimension"),
        ("ChurnRiskScore", "integer", "measure"), ("StoreName", "string", "dimension"),
        ("City", "string", "dimension"), ("Province", "string", "dimension"),
        ("Region", "string", "dimension"), ("Type", "string", "dimension"),
        ("Latitude", "real", "measure"), ("Longitude", "real", "measure"),
        ("Channel", "string", "dimension"), ("GrossProfit", "real", "measure"),
    ],
    "CustomerSummary": [
        ("CustomerId", "integer", "dimension"), ("CustomerName", "string", "dimension"),
        ("Tier", "string", "dimension"), ("Segment", "string", "dimension"),
        ("Region", "string", "dimension"), ("City", "string", "dimension"),
        ("Province", "string", "dimension"), ("AcquisitionDate", "datetime", "dimension"),
        ("ChurnRiskScore", "integer", "measure"), ("LifetimeValue", "integer", "measure"),
        ("NextBestOffer", "string", "dimension"), ("LoyaltyPointsBalance", "integer", "measure"),
        ("TenantId", "string", "dimension"), ("RevenueToDate", "real", "measure"),
        ("LoyaltyPointsUsed", "integer", "measure"), ("OrderCount", "integer", "measure"),
        ("ChurnBand", "string", "dimension"),
    ],
    "InventorySnapshot": [
        ("InventoryId", "integer", "dimension"), ("StoreId", "integer", "dimension"),
        ("Category", "string", "dimension"), ("Brand", "string", "dimension"),
        ("StockQuantity", "integer", "measure"), ("CampaignTargetQuantity", "integer", "measure"),
        ("ReorderPoint", "integer", "measure"), ("SnapshotDate", "datetime", "dimension"),
        ("TenantId", "string", "dimension"), ("StoreName", "string", "dimension"),
        ("City", "string", "dimension"), ("Province", "string", "dimension"),
        ("Region", "string", "dimension"), ("Type", "string", "dimension"),
        ("Latitude", "real", "measure"), ("Longitude", "real", "measure"),
        ("OosGap", "integer", "measure"), ("IsOos", "integer", "measure"),
        ("StockStatus", "string", "dimension"),
    ],
}

_DT_ATTR = {
    "string": ("string", "nominal", "nominal"),
    "integer": ("integer", "ordinal", "ordinal"),
    "integer_m": ("integer", "quantitative", "quantitative"),
    "real": ("real", "quantitative", "quantitative"),
    "datetime": ("datetime", "ordinal", "ordinal"),
}


def ds_name(table: str) -> str:
    return f"federated.{table.lower()}"


def _col_def(col: str, dt: str, role: str) -> str:
    if role == "measure":
        key = "real" if dt == "real" else "integer_m"
        agg = "Sum"
    else:
        key = dt
        agg = "Year" if dt == "datetime" else "Count"
    datatype, deftype, typ = _DT_ATTR[key]
    return (f"    <column aggregation='{agg}' caption='{esc(col)}' datatype='{datatype}' "
            f"default-type='{deftype}' name='[{esc(col)}]' pivot='key' role='{role}' "
            f"type='{typ}' user-datatype='{datatype}' visual-totals='Default' />")


# ─── Table accessor ─────────────────────────────────────────────────────────
class Table:
    """Bare-field-name accessor scoped to one table's isolated datasource."""
    def __init__(self, name: str):
        self.name = name
        self.ds = ds_name(name)
        self._roles = {c: (dt, role) for c, dt, role in _SCHEMA[name]}

    def dep(self, col: str, agg=None, caption=None) -> str:
        dt, role = self._roles[col]
        if role == "measure":
            a = agg or "Sum"
            datatype = "real" if dt == "real" else "integer"
            return (f"            <column aggregation='{a}' datatype='{datatype}' default-type='quantitative' "
                    f"layered='true' name='[{esc(col)}]' pivot='key' role='measure' type='quantitative' "
                    f"user-datatype='{datatype}' visual-totals='Default' />")
        if dt == "datetime":
            return (f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' "
                    f"layered='true' name='[{esc(col)}]' pivot='key' role='dimension' type='ordinal' "
                    f"user-datatype='datetime' visual-totals='Default' />")
        datatype = "integer" if dt == "integer" else "string"
        deftype = "ordinal" if dt == "integer" else "nominal"
        typ = "ordinal" if dt == "integer" else "nominal"
        cap = f" caption='{esc(caption)}'" if caption else ""
        return (f"            <column aggregation='Count'{cap} datatype='{datatype}' default-type='{deftype}' "
                f"layered='true' name='[{esc(col)}]' pivot='key' role='dimension' type='{typ}' "
                f"user-datatype='{datatype}' visual-totals='Default' />")

    def dim_inst(self, col: str) -> str:
        return f"            <column-instance column='[{esc(col)}]' derivation='None' name='[none:{esc(col)}:nk]' pivot='key' type='nominal' />"

    def month_inst(self, col: str) -> str:
        return f"            <column-instance column='[{esc(col)}]' derivation='Month' name='[mn:{esc(col)}:ok]' pivot='key' type='ordinal' />"

    def agg_inst(self, col: str, agg="Sum") -> str:
        return f"            <column-instance column='[{esc(col)}]' derivation='{agg}' name='[{agg.lower()[:3]}:{esc(col)}:qk]' pivot='key' type='quantitative' />"

    def dim(self, col: str) -> str:
        return f"[{self.ds}].[none:{esc(col)}:nk]"

    def month(self, col: str) -> str:
        return f"[{self.ds}].[mn:{esc(col)}:ok]"

    def measure(self, col: str, agg="sum") -> str:
        return f"[{self.ds}].[{agg[:3]}:{esc(col)}:qk]"


# ─── Calc field (bound to a table's datasource) ─────────────────────────────
class Calc:
    def __init__(self, table: str, cid, caption, dt, role, ct, formula, fmt=None):
        self.table = table
        self.ds = ds_name(table)
        self.cid = f"Calculation_{cid}"
        self.caption = caption
        self.dt = dt
        self.role = role
        self.ct = ct
        self.formula = formula
        self.fmt = fmt

    def full_col(self) -> str:
        fs = f" default-format='{esc_attr(self.fmt)}'" if self.fmt else ""
        return (f"    <column caption='{esc(self.caption)}' datatype='{self.dt}'{fs} "
                f"name='[{self.cid}]' role='{self.role}' type='{self.ct}'>\n"
                f"      <calculation class='tableau' formula='{esc_attr(self.formula)}' />\n"
                f"    </column>")

    def dep_col(self) -> str:
        fs = f" default-format='{esc_attr(self.fmt)}'" if self.fmt else ""
        return (f"            <column caption='{esc(self.caption)}' datatype='{self.dt}'{fs} "
                f"name='[{self.cid}]' role='{self.role}' type='{self.ct}' />")

    def inst(self, kind=None) -> str:
        k = kind or ("qk" if self.ct == "quantitative" else "nk")
        typ = "quantitative" if k == "qk" else "nominal"
        return (f"            <column-instance column='[{self.cid}]' derivation='User' "
                f"name='[usr:{self.cid}:{k}]' pivot='key' type='{typ}' />")

    def ref(self, kind=None) -> str:
        k = kind or ("qk" if self.ct == "quantitative" else "nk")
        return f"[{self.ds}].[usr:{self.cid}:{k}]"


# ─── Datasource block (single table, single relation) ───────────────────────
def datasource_block(table: str, calcs: list[Calc]) -> str:
    conn = f"{CONN_PREFIX}_{table.lower()}"
    cols_map = "\n".join(
        f"        <map key='[{esc(c)}]' value='[{table}].[{esc(c)}]' />"
        for c, _dt, _role in _SCHEMA[table])
    col_defs = "\n".join(_col_def(c, dt, role) for c, dt, role in _SCHEMA[table])
    calc_defs = ("\n" + "\n".join(c.full_col() for c in calcs)) if calcs else ""
    return f"""  <datasource caption='{table}' inline='true' name='{ds_name(table)}' version='18.1'>
    <connection class='federated'>
      <named-connections>
        <named-connection caption='{table}' name='{conn}'>
          <connection class='hyper' authentication='auth-none' dbname='{HYPER_ARCNAME}' schema='Extract' server='' default-settings='yes' />
        </named-connection>
      </named-connections>
      <relation connection='{conn}' name='{table}' table='[Extract].[{table}]' type='table' />
      <cols>
{cols_map}
      </cols>
    </connection>
    <aliases enabled='yes' />
{col_defs}{calc_defs}
  </datasource>"""


# ─── KPI card (BAN) — measure-on-rows + Text mark (extract path) ────────────
def _kpi_body(calc: Calc, label_run: str, value_run: str) -> str:
    field = calc.ref()
    return f"""      <table>
        <view>
          <datasources>
            <datasource caption='{calc.table}' name='{calc.ds}' />
          </datasources>
          <datasource-dependencies datasource='{calc.ds}'>
{calc.dep_col()}
{calc.inst()}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='axis'>
            <format attr='display' class='0' field='{field}' scope='rows' value='false' />
          </style-rule>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='false' />
          </style-rule>
          <style-rule element='gridline'>
            <format attr='line-visibility' scope='rows' value='off' />
            <format attr='line-visibility' scope='cols' value='off' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Text' />
            <encodings><text column='{field}' /></encodings>
            <customized-label>
              <formatted-text>
{value_run}
              </formatted-text>
            </customized-label>
            <style>
              <style-rule element='mark'>
                <format attr='mark-labels-show' value='true' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{field}</rows><cols />
      </table>"""


def kpi_card(sheet_name: str, calc: Calc, title_vn: str, value_color=INK, size=22) -> str:
    field = calc.ref()
    label = esc(title_vn.upper())
    value_run = (f"                <run bold='true' fontalignment='1' fontcolor='{value_color}' "
                 f"fontsize='{size}'><![CDATA[<{field}>]]></run>")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontsize='9' bold='true' fontcolor='#64748B'>{label}</run></formatted-text></title>
      </layout-options>
{_kpi_body(calc, label, value_run)}
      <simple-id uuid='{U()}' />
    </worksheet>"""


def kpi_card_delta(sheet_name: str, calc: Calc, title_vn: str,
                   delta_text: str, delta_color: str, sub_text: str, size=22,
                   value_color=INK) -> str:
    field = calc.ref()
    label = esc(title_vn.upper())
    value_run = (
        f"                <run bold='true' fontalignment='1' fontcolor='{value_color}' fontsize='{size}'><![CDATA[<{field}>]]></run>\n"
        f"                <run fontalignment='1'>&#10;</run>\n"
        f"                <run fontalignment='1' fontsize='10' bold='true' fontcolor='{delta_color}'>{esc(delta_text)}</run>\n"
        f"                <run fontalignment='1' fontsize='10' fontcolor='#8A97A6'>  {esc(sub_text)}</run>")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontsize='9' bold='true' fontcolor='#64748B'>{label}</run></formatted-text></title>
      </layout-options>
{_kpi_body(calc, label, value_run)}
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Sparkline worksheet (6-month mini-trend Line) ──────────────────────────
def sparkline(sheet_name: str, table: str, month_col: str, trend_calc: Calc,
              color: str = BRAND) -> str:
    ds = ds_name(table)
    mref = f"[{ds}].[tmn:{esc(month_col)}:qk]"
    vref = trend_calc.ref()
    month_dep = (f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' "
                 f"layered='true' name='[{esc(month_col)}]' pivot='key' role='dimension' type='ordinal' "
                 f"user-datatype='datetime' visual-totals='Default' />")
    month_inst = (f"            <column-instance column='[{esc(month_col)}]' derivation='Month-Trunc' "
                  f"name='[tmn:{esc(month_col)}:qk]' pivot='key' type='quantitative' />")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <table>
        <view>
          <datasources>
            <datasource caption='{table}' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
{month_dep}
{trend_calc.dep_col()}
{month_inst}
{trend_calc.inst()}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='axis'>
            <format attr='display' value='false' />
            <format attr='tick-color' value='#00000000' />
            <format attr='rule-color' value='#00000000' />
          </style-rule>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='false' />
          </style-rule>
          <style-rule element='gridline'>
            <format attr='line-visibility' scope='cols' value='off' />
            <format attr='line-visibility' scope='rows' value='off' />
          </style-rule>
          <style-rule element='zeroline'>
            <format attr='line-visibility' value='off' />
          </style-rule>
          <style-rule element='worksheet'>
            <format attr='display-field-labels' scope='cols' value='false' />
            <format attr='display-field-labels' scope='rows' value='false' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Line' />
            <style>
              <style-rule element='mark'>
                <format attr='mark-color' value='{color}' />
                <format attr='size' value='1.4' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{vref}</rows>
        <cols>{mref}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Generic chart ──────────────────────────────────────────────────────────
def chart(sheet_name, title_vn, table: str, deps, insts, rows, cols, mark="Bar",
          encodings=None, filters=None, color_palette=None, single_color=None,
          data_label=None, computed_sort=None, bar_size=0.72) -> str:
    ds = ds_name(table)
    enc_list = list(encodings) if encodings else []
    if data_label:
        enc_list.append(("text", data_label))
    enc = ""
    if enc_list:
        enc = "            <encodings>\n" + "".join(
            f"              <{k} column='{c}' />\n" for k, c in enc_list) + "            </encodings>\n"
    db = "\n".join(deps)
    ib = "\n".join(insts)
    filt_xml = ("\n" + "\n".join(filters)) if filters else ""
    csort = (f"          <computed-sort column='{computed_sort[0]}' direction='{computed_sort[2]}' using='{computed_sort[1]}' />\n"
             if computed_sort else "")

    # Worksheet-level color-interpolation encoding. CRITICAL (learned on the
    # extract path): a `palette='...' type='palette'` attr on the PANE <color
    # column> does NOT bind a continuous measure to a sequential ramp on Cloud —
    # it falls back to the default blue gradient. The binding that renders is a
    # worksheet-level `<style-rule element='mark'><encoding attr='color'
    # field='<raw col name>' palette='...' type='interpolated'>` (the pattern real
    # premium workbooks use). We reference the field by its RAW column name (the
    # bit inside the last [...] of the ref) so the encoding matches the pill.
    color_enc = ""
    if color_palette and encodings:
        for k, c in encodings:
            if k == "color":
                color_enc = (
                    f"          <style-rule element='mark'>\n"
                    f"            <encoding attr='color' field='{base_field(c)}' palette='{color_palette}' type='interpolated' />\n"
                    f"          </style-rule>\n")
    ws_style = (
        "        <style>\n"
        + color_enc +
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
    pane_rules = []
    if mark == "Bar":
        pane_rules.append(f"                <format attr='mark-bar-size' value='{bar_size}' />")
    if single_color:
        pane_rules.append(f"                <format attr='mark-color' value='{single_color}' />")
    if data_label:
        pane_rules.append("                <format attr='mark-labels-show' value='true' />")
        pane_rules.append("                <format attr='mark-labels-cull' value='true' />")
    pane_style = (("            <style>\n              <style-rule element='mark'>\n"
                   + "\n".join(pane_rules) + "\n              </style-rule>\n            </style>\n")
                  if pane_rules else "")

    enc_block = enc

    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{INK}'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='{table}' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
{db}
{ib}
          </datasource-dependencies>{filt_xml}
{csort}          <aggregation value='true' />
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


def categorical_filter(table: str, col: str, keep_members: list[str]) -> str:
    ds = ds_name(table)
    members = "\n".join(
        f"              <groupfilter function='member' level='[none:{esc(col)}:nk]' "
        f"member='&quot;{esc(m)}&quot;' />" for m in keep_members)
    return (f"          <filter class='categorical' column='[{ds}].[none:{esc(col)}:nk]'>\n"
            f"            <groupfilter function='union' user:ui-enumeration='inclusive' "
            f"user:ui-marker='enumerate'>\n{members}\n"
            f"            </groupfilter>\n          </filter>")


# ─── Emphasis monthly chart: max column darkest + value labels ──────────────
def emphasis_month_chart(sheet_name, title_vn, table: str, month_col: str,
                         value_calc: Calc, label_calc: Calc = None,
                         bar_color=BRAND,
                         hide_axis=True) -> str:
    """Monthly bar chart with value labels. Bars are a FLAT brand color.
    (A `type='interpolated'` sequential ramp — max-month-darkest — does NOT bind
    on this federated-extract Cloud path; it falls back to default blue. Flat
    brand red is server-reliable; the max month reads from bar length + label.)"""
    ds = ds_name(table)
    vref = value_calc.ref()
    lref = (label_calc.ref() if label_calc is not None else vref)
    mref = f"[{ds}].[mn:{esc(month_col)}:ok]"
    month_dep = (f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' "
                 f"layered='true' name='[{esc(month_col)}]' pivot='key' role='dimension' type='ordinal' "
                 f"user-datatype='datetime' visual-totals='Default' />")
    month_inst = f"            <column-instance column='[{esc(month_col)}]' derivation='Month' name='[mn:{esc(month_col)}:ok]' pivot='key' type='ordinal' />"
    deps = [month_dep, value_calc.dep_col()]
    insts = [month_inst, value_calc.inst()]
    if label_calc is not None:
        deps.append(label_calc.dep_col()); insts.append(label_calc.inst())
    deps_x = "\n".join(deps)
    insts_x = "\n".join(insts)
    axis_hide = (f"            <format attr='display' class='0' field='{vref}' scope='rows' value='false' />\n"
                 if hide_axis else "")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{INK}'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='{table}' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
{deps_x}
{insts_x}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='false' />
          </style-rule>
          <style-rule element='axis'>
{axis_hide}            <format attr='rule-color' value='#C3CDD8' />
            <format attr='tick-color' value='#E3E9EF' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Bar' />
            <encodings>
              <text column='{lref}' />
            </encodings>
            <customized-label><formatted-text>
              <run bold='true' fontalignment='1' fontcolor='{INK}' fontsize='10'>&lt;{lref}&gt;</run>
            </formatted-text></customized-label>
            <style>
              <style-rule element='mark'>
                <format attr='mark-color' value='{bar_color}' />
                <format attr='mark-bar-size' value='0.66' />
                <format attr='mark-labels-show' value='true' />
                <format attr='mark-labels-cull' value='true' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{vref}</rows>
        <cols>{mref}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Ranking bar: horizontal bars colored by measure (sequential emphasis) ──
def ranking_bar(sheet_name, title_vn, table: str, dim_col: str, value_calc: Calc,
                bar_color=BRAND, label_calc: Calc = None,
                dim_caption=None, keep_members: list[str] = None) -> str:
    """Horizontal bars (y=dimension, x=measure) in a FLAT brand color, value
    labels at bar ends, sorted DESC by the measure.

    (Sequential color-by-measure does NOT bind on this extract path — see
    emphasis_month_chart; bar length + DESC sort carry the ranking emphasis.)

    NO top-N: the hand-authored top-N categorical <filter> is rejected by Cloud
    strict-mode ("Error parsing filter"). To limit categories, pass explicit
    `keep_members` (an inclusive enumerate filter, which DOES parse) or bake the
    limit into the calc. DESC computed-sort puts the biggest on top regardless."""
    ds = ds_name(table)
    vref = value_calc.ref()
    lref = (label_calc.ref() if label_calc is not None else vref)
    dref = f"[{ds}].[none:{esc(dim_col)}:nk]"
    t = Table(table)
    deps = [t.dep(dim_col, caption=dim_caption), value_calc.dep_col()]
    insts = [t.dim_inst(dim_col), value_calc.inst()]
    if label_calc is not None:
        deps.append(label_calc.dep_col()); insts.append(label_calc.inst())
    filters = [categorical_filter(table, dim_col, keep_members)] if keep_members else None
    return chart(
        sheet_name, title_vn, table, deps, insts,
        rows=dref, cols=vref, mark="Bar",
        single_color=bar_color,
        data_label=lref, filters=filters,
        computed_sort=(dref, vref, "DESC"), bar_size=0.78,
    )


# ─── Dashboard layout-flow ──────────────────────────────────────────────────
ROUNDED = "<_.fcp.DashboardRoundedCorners.true...format attr='corner-radius' value='14' />"

def leaf(name, minw=80, w=100000, kpi=False):
    # kpi=True → type-h='cell' so the BAN number sizes to its natural cell and is
    # never scaled away. A plain KPI cell takes a large natural height though, so
    # it ignores the row weight and the card reads airy/tall. For plain (no-spark)
    # KPI rows we instead use a scalable leaf with a modest minheight so the row's
    # `h` weight controls the card height (the number still renders — verified).
    if kpi:
        cache = (f"                <layout-cache cell-count-h='1' minheight='60' non-cell-size-h='30' "
                 f"type-h='scalable' type-w='scalable' />\n")
    else:
        cache = f"                <layout-cache minwidth='{minw}' type-h='scalable' type-w='scalable' />\n"
    return (f"              <zone h='100000' id='{_zid()}' name='{esc(name)}' w='{w}' x='0' y='0'>\n"
            + cache
            + f"                <zone-style>"
            f"<format attr='border-color' value='{BORDER}' />"
            f"<format attr='border-style' value='solid' />"
            f"<format attr='border-width' value='1' />"
            f"{ROUNDED}"
            f"<format attr='margin' value='9' />"
            f"<format attr='padding' value='10' />"
            f"<format attr='background-color' value='{BG_CARD}' />"
            f"</zone-style>\n"
            f"              </zone>")


def title_block(title_vn: str, subtitle_vn: str, h: int = 3400) -> str:
    """Clean title on the page bg — red title accent + thin red bottom rule.
    No colored band (per SHB user preference, carried to MediaMart)."""
    tid = _zid()
    return (f"          <zone h='{h}' id='{tid}' type-v2='text' w='100000' x='0' y='0'>\n"
            f"            <formatted-text>\n"
            f"              <run fontname='Tableau Bold' fontsize='18' bold='true' fontcolor='{BRAND}'>MediaMart</run>\n"
            f"              <run fontname='Tableau Bold' fontsize='16' bold='true' fontcolor='{INK}'>   {esc(title_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='11' fontcolor='#8A93A8'>    {esc(subtitle_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='10' fontcolor='{BRAND}'>    ·   Dữ liệu mô phỏng (demo)</run>\n"
            f"            </formatted-text>\n"
            f"            <zone-style>"
            f"<format attr='border-color' value='{BRAND}' /><format attr='border-style' value='none' />"
            f"<format attr='border-width' value='0' /><format attr='border-bottom-width' value='3' />"
            f"<format attr='border-bottom-color' value='{BRAND}' />"
            f"<format attr='margin' value='4' /><format attr='padding' value='10' />"
            f"<format attr='background-color' value='{BG_PAGE}' /></zone-style>\n"
            f"          </zone>")


def hrow(names, h, minw=80, kpi=False):
    body = "\n".join(leaf(n, minw, kpi=kpi) for n in names)
    return (f"          <zone h='{h}' id='{_zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n{body}\n          </zone>")


def _spark_kpi_card(number_sheet: str, spark_sheet: str, w=100000):
    """Composite card = OUTER rounded vert zone [number leaf (fixed cell height)
    over spark leaf (scalable fill)]."""
    number_leaf = (
        f"                <zone h='42000' id='{_zid()}' name='{esc(number_sheet)}' w='100000' x='0' y='0'>\n"
        f"                  <layout-cache cell-count-h='1' non-cell-size-h='30' type-h='cell' type-w='cell' />\n"
        f"                  <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
        f"<format attr='margin' value='0' /><format attr='padding' value='2' /></zone-style>\n"
        f"                </zone>")
    spark_leaf = (
        f"                <zone h='58000' id='{_zid()}' name='{esc(spark_sheet)}' show-title='false' w='100000' x='0' y='0'>\n"
        f"                  <layout-cache minheight='40' minwidth='40' type-h='scalable' type-w='scalable' />\n"
        f"                  <zone-style><format attr='border-style' value='none' /><format attr='border-width' value='0' />"
        f"<format attr='margin' value='0' /><format attr='padding' value='2' /></zone-style>\n"
        f"                </zone>")
    return (
        f"              <zone h='100000' id='{_zid()}' param='vert' type-v2='layout-flow' w='{w}' x='0' y='0'>\n"
        f"{number_leaf}\n{spark_leaf}\n"
        f"                <zone-style>"
        f"<format attr='border-color' value='{BORDER}' /><format attr='border-style' value='solid' />"
        f"<format attr='border-width' value='1' />{ROUNDED}"
        f"<format attr='margin' value='9' /><format attr='padding' value='8' />"
        f"<format attr='background-color' value='{BG_CARD}' /></zone-style>\n"
        f"              </zone>")


def spark_hrow(pairs, h):
    body = "\n".join(_spark_kpi_card(n, s) for n, s in pairs)
    return (f"          <zone h='{h}' id='{_zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n{body}\n          </zone>")


def dashboard(name, rows_xml, width=1560, height=1180):
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


# ─── Palettes (MediaMart red sequential + categorical + risk) ───────────────
_PALETTES = """  <preferences>
    <color-palette name='MediaMart Sequential' type='ordered-sequential'>
      <color>#FCA5A5</color>
      <color>#F87171</color>
      <color>#EF4444</color>
      <color>#DC2626</color>
      <color>#B00610</color>
      <color>#7F1D1D</color>
    </color-palette>
    <color-palette name='MediaMart Categorical' type='regular'>
      <color>#E50914</color>
      <color>#0F172A</color>
      <color>#F2B705</color>
      <color>#2563EB</color>
      <color>#16A34A</color>
      <color>#64748B</color>
    </color-palette>
    <color-palette name='MediaMart Risk' type='regular'>
      <color>#16A34A</color>
      <color>#E8A317</color>
      <color>#DC2626</color>
    </color-palette>
  </preferences>"""


def workbook(tables_used: list[str], calcs: list[Calc], sheets_xml, sheet_names,
             dashboard_xml, dash_name):
    calcs_by_table: dict[str, list[Calc]] = {}
    for c in calcs:
        calcs_by_table.setdefault(c.table, []).append(c)
    ds_blocks = "\n".join(datasource_block(t, calcs_by_table.get(t, [])) for t in tables_used)

    ws = "  <worksheets>\n" + "\n".join(sheets_xml) + "\n  </worksheets>\n"
    dash = "  <dashboards>\n" + dashboard_xml + "\n  </dashboards>\n"
    hidden = "".join(f"    <window class='worksheet' hidden='true' name='{esc(n)}'></window>\n" for n in sheet_names)
    vps = "\n".join(f"        <viewpoint name='{esc(n)}'><zoom type='entire-view' /></viewpoint>" for n in sheet_names)
    dash_win = f"    <window class='dashboard' maximized='true' name='{esc(dash_name)}'>\n      <viewpoints>\n{vps}\n      </viewpoints>\n    </window>\n"
    windows = "  <windows>\n" + hidden + dash_win + "  </windows>\n"
    return f"""<?xml version='1.0' encoding='utf-8' ?>
<workbook original-version='18.1' source-build='2026.1.1 (20261.26.0410.0924)' version='18.1' xmlns:user='http://www.tableausoftware.com/xml/user'>
{_PALETTES}
  <datasources>
{ds_blocks}
  </datasources>
{ws}{dash}{windows}</workbook>
"""


def validate(xml: str) -> str:
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml)
        return "OK"
    except ET.ParseError as e:
        return f"PARSE ERR: {e}"


def package_twbx(twb_xml: str, wb_name: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{wb_name}.twbx"
    (OUT_DIR / f"{wb_name}.twb").write_text(twb_xml, encoding="utf-8")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{wb_name}.twb", twb_xml)
        z.write(HYPER, arcname=HYPER_ARCNAME)
    return out


MEDIAMART_PROJECT = "Demo/MediaMart"

def _env() -> dict:
    env = {}
    for line in (Path(__file__).resolve().parents[2] / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def _project_id(server) -> str:
    import tableauserverclient as tsc
    all_projects, _ = server.projects.get()
    parent_id = None
    for part in ("Demo", "MediaMart"):
        found = next((p for p in all_projects
                      if p.name == part and getattr(p, "parent_id", None) == parent_id), None)
        if not found:
            raise RuntimeError(f"project part '{part}' not found under parent {parent_id}")
        parent_id = found.id
    return parent_id


def publish(twbx_path: Path, wb_name: str) -> str:
    import tableauserverclient as tsc
    env = _env()
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"],
                                       site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        pid = _project_id(server)
        item = tsc.WorkbookItem(project_id=pid, name=wb_name, show_tabs=False)
        pub = server.workbooks.publish(item, str(twbx_path), mode=tsc.Server.PublishMode.Overwrite,
                                       skip_connection_check=True)
        print(f"PUBLISHED: {pub.name}  id={pub.id}")
        return pub.id


def render(wb_id: str, wb_name: str) -> None:
    import tableauserverclient as tsc
    env = _env()
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"],
                                       site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        wb = server.workbooks.get_by_id(wb_id)
        server.workbooks.populate_views(wb)
        for v in wb.views:
            server.views.populate_image(v, tsc.ImageRequestOptions(maxage=1))
            out = OUT_DIR / f"render_{wb_name}_{v.name}.png"
            out.write_bytes(v.image)
            print(f"  rendered {v.name} -> {out} ({len(v.image):,} bytes)")
