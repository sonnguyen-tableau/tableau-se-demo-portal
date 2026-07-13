"""Singapore Airlines workbook builder — self-contained .twbx.

Adapted from acb_lib.py / vnpt_lib.py (proven self-contained extract-workbook
technique: federated → hyper named-connection, .hyper packaged inside the .twbx,
RENDERS on Cloud with skip_connection_check=True — no fragile sqlproxy seed).

ARCHITECTURE: one `<datasource>` PER TABLE (each a single-relation federated
hyper connection to the SAME packaged singaporeair.hyper). Every worksheet is
single-table (pre-aggregated facts), field names BARE.

Design system (SIA brand): navy #1D4886, gold #FCB130. English labels. SGD.
"""
from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

CONN_PREFIX = "hyperconn"
HYPER = Path("/tmp/singaporeair/singaporeair.hyper")
HYPER_DBNAME = "Data/Datasources/singaporeair.hyper"
SIA_PROJECT_ID = "d59f10b6-ccd8-4bcc-a34e-93f7bea939bf"  # Demo/Singapore Airlines

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


# ─── Design tokens (Singapore Airlines) ──────────────────────────────────────
BG_PAGE = "#F3F5FA"
BG_CARD = "#FFFFFF"
BORDER  = "#D8E0EC"
NAVY    = "#12203F"
BRAND   = "#1D4886"   # SIA blue (verified from logo SVG)
CYAN    = "#3E72B8"   # lighter blue for secondary series
GOLD    = "#FCB130"   # SIA gold (verified from logo SVG)
BODY    = "#5A6675"
GOOD    = "#0E9F6E"
BAD     = "#D64545"
GHOST   = "#C7D0E0"


# ─── Schema: table → [(col, datatype, role)] ────────────────────────────────
_SCHEMA: dict[str, list[tuple[str, str, str]]] = {
    "monthly_performance": [
        ("PerfId", "integer", "dimension"), ("Month", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("MonthNum", "integer", "dimension"),
        ("RevenueSgd", "real", "measure"), ("OperatingProfitSgd", "real", "measure"),
        ("PassengersCarried", "integer", "measure"), ("LoadFactorPct", "real", "measure"),
        ("YieldCentsPerRpk", "real", "measure"), ("AskMillion", "real", "measure"),
        ("RpkMillion", "real", "measure"), ("CargoLoadFactorPct", "real", "measure"),
        ("CargoRevenueSgd", "real", "measure"), ("OnTimePerformancePct", "real", "measure"),
        ("PriorYearRevenueSgd", "real", "measure"), ("PriorYearPassengers", "integer", "measure"),
        ("PriorYearLoadFactorPct", "real", "measure"), ("PriorYearYield", "real", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "region_performance": [
        ("RegionId", "integer", "dimension"), ("Region", "string", "dimension"),
        ("RevenueSgd", "real", "measure"), ("PassengersCarried", "integer", "measure"),
        ("LoadFactorPct", "real", "measure"), ("YieldIndex", "real", "measure"),
        ("CapacitySharePct", "real", "measure"), ("GrowthYoYPct", "real", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "destinations": [
        ("DestId", "integer", "dimension"), ("City", "string", "dimension"),
        ("Iata", "string", "dimension"), ("Region", "string", "dimension"),
        ("Lat", "real", "measure"), ("Lon", "real", "measure"),
        ("PassengersCarried", "integer", "measure"), ("RevenueSgd", "real", "measure"),
        ("LoadFactorPct", "real", "measure"), ("TenantId", "string", "dimension"),
    ],
    "cabin_class": [
        ("CabinId", "integer", "dimension"), ("CabinClass", "string", "dimension"),
        ("RevenueSgd", "real", "measure"), ("PassengersCarried", "integer", "measure"),
        ("RevenueSharePct", "real", "measure"), ("SeatSharePct", "real", "measure"),
        ("YieldIndex", "real", "measure"), ("LoadFactorPct", "real", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "loyalty_krisflyer": [
        ("LoyaltyId", "integer", "dimension"), ("Month", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("MonthNum", "integer", "dimension"),
        ("TotalMembers", "integer", "measure"), ("NetNewMembers", "integer", "measure"),
        ("BaseMembers", "integer", "measure"), ("SilverMembers", "integer", "measure"),
        ("GoldMembers", "integer", "measure"), ("PpsMembers", "integer", "measure"),
        ("Redemptions", "integer", "measure"), ("AncillaryRevenueSgd", "real", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "metric_dictionary": [
        ("DictId", "integer", "dimension"), ("MetricKey", "string", "dimension"),
        ("MetricName", "string", "dimension"), ("Unit", "string", "dimension"),
        ("Cadence", "string", "dimension"), ("Definition", "string", "dimension"),
        ("FavorableDirection", "string", "dimension"), ("Source", "string", "dimension"),
        ("SourceUrl", "string", "dimension"), ("MockData", "integer", "dimension"),
        ("TenantId", "string", "dimension"),
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

    def agg_inst(self, col: str, agg="Sum") -> str:
        return f"            <column-instance column='[{esc(col)}]' derivation='{agg}' name='[{agg.lower()[:3]}:{esc(col)}:qk]' pivot='key' type='quantitative' />"

    def dim(self, col: str) -> str:
        return f"[{self.ds}].[none:{esc(col)}:nk]"

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
        fs = f" default-format='{esc(self.fmt)}'" if self.fmt else ""
        return (f"    <column caption='{esc(self.caption)}' datatype='{self.dt}'{fs} "
                f"name='[{self.cid}]' role='{self.role}' type='{self.ct}'>\n"
                f"      <calculation class='tableau' formula='{esc(self.formula)}' />\n"
                f"    </column>")

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
          <connection class='hyper' authentication='auth-none' dbname='{HYPER_DBNAME}' schema='Extract' server='' default-settings='yes' />
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
def _kpi_body(calc: Calc, value_run: str) -> str:
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


def kpi_card_delta(sheet_name: str, calc: Calc, title_vn: str,
                   delta_text: str, delta_color: str, sub_text: str, size=20,
                   value_color=NAVY) -> str:
    label = esc(title_vn.upper())
    field = calc.ref()
    value_run = (
        f"                <run bold='true' fontalignment='1' fontcolor='{value_color}' fontsize='{size}'><![CDATA[<{field}>]]></run>\n"
        f"                <run fontalignment='1'>&#10;</run>\n"
        f"                <run fontalignment='1' fontsize='10' bold='true' fontcolor='{delta_color}'>{esc(delta_text)}</run>\n"
        f"                <run fontalignment='1' fontsize='10' fontcolor='#8A97A6'>  {esc(sub_text)}</run>")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontsize='9' bold='true' fontcolor='#5A6B7B'>{label}</run></formatted-text></title>
      </layout-options>
{_kpi_body(calc, value_run)}
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Sparkline / line-trend (continuous month-trunc axis, PROVEN) ───────────
def _line_ws(sheet_name, table, month_col, value_calc, color, show_axis,
             title_vn=None, area=False, data_label_calc=None) -> str:
    ds = ds_name(table)
    mref = f"[{ds}].[tmn:{esc(month_col)}:qk]"
    vref = value_calc.ref()
    month_dep = (f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' "
                 f"layered='true' name='[{esc(month_col)}]' pivot='key' role='dimension' type='ordinal' "
                 f"user-datatype='datetime' visual-totals='Default' />")
    month_inst = (f"            <column-instance column='[{esc(month_col)}]' derivation='Month-Trunc' "
                  f"name='[tmn:{esc(month_col)}:qk]' pivot='key' type='quantitative' />")
    deps = [month_dep, value_calc.dep_col()]
    insts = [month_inst, value_calc.inst()]
    label_enc = ""
    label_run = ""
    if data_label_calc is not None:
        deps.append(data_label_calc.dep_col()); insts.append(data_label_calc.inst())
        label_enc = f"              <text column='{data_label_calc.ref()}' />\n"
        label_run = (f"            <customized-label><formatted-text>"
                     f"<run bold='true' fontalignment='1' fontcolor='{NAVY}' fontsize='9'>&lt;{data_label_calc.ref()}&gt;</run>"
                     f"</formatted-text></customized-label>\n")
    deps_x = "\n".join(deps)
    insts_x = "\n".join(insts)
    axis_off = ("            <format attr='display' value='false' />\n"
                "            <format attr='tick-color' value='#00000000' />\n"
                "            <format attr='rule-color' value='#00000000' />\n") if not show_axis else (
                "            <format attr='rule-color' value='#C3CDD8' />\n"
                "            <format attr='tick-color' value='#E3E9EF' />\n")
    title_xml = (f"""      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{NAVY}'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>\n""" if title_vn else "")
    mark = "Area" if area else "Line"
    label_show = ("                <format attr='mark-labels-show' value='true' />\n"
                  if data_label_calc is not None else "")
    return f"""    <worksheet name='{esc(sheet_name)}'>
{title_xml}      <table>
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
          <style-rule element='axis'>
{axis_off}          </style-rule>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='false' />
          </style-rule>
          <style-rule element='gridline'>
            <format attr='line-visibility' scope='cols' value='off' />
            <format attr='line-visibility' scope='rows' value='off' />
          </style-rule>
          <style-rule element='worksheet'>
            <format attr='display-field-labels' scope='cols' value='false' />
            <format attr='display-field-labels' scope='rows' value='false' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='{mark}' />
            <encodings>
{label_enc}            </encodings>
{label_run}            <style>
              <style-rule element='mark'>
                <format attr='mark-color' value='{color}' />
                <format attr='size' value='{"1.8" if show_axis else "1.4"}' />
{label_show}              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{vref}</rows>
        <cols>{mref}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


def sparkline(sheet_name, table, month_col, trend_calc, color=BRAND) -> str:
    return _line_ws(sheet_name, table, month_col, trend_calc, color, show_axis=False)


def line_trend(sheet_name, title_vn, table, month_col, value_calc, color=BRAND,
               area=False, data_label_calc=None) -> str:
    return _line_ws(sheet_name, table, month_col, value_calc, color, show_axis=True,
                    title_vn=title_vn, area=area, data_label_calc=data_label_calc)


# ─── Generic bar chart ──────────────────────────────────────────────────────
def chart(sheet_name, title_vn, table, deps, insts, rows, cols, mark="Bar",
          encodings=None, single_color=None, color_palette=None,
          data_label=None, computed_sort=None, bar_size=0.66) -> str:
    ds = ds_name(table)
    enc_list = list(encodings) if encodings else []
    if data_label:
        enc_list.append(("text", data_label))
    enc = ""
    if enc_list:
        enc = "            <encodings>\n" + "".join(
            f"              <{k} column='{c}' />\n" for k, c in enc_list) + "            </encodings>\n"
    if color_palette and enc_list:
        for k, c in enc_list:
            if k == "color":
                enc = enc.replace(
                    f"              <color column='{c}' />\n",
                    f"              <color column='{c}' palette='{color_palette}' type='palette' />\n")
    db = "\n".join(deps)
    ib = "\n".join(insts)
    csort = (f"          <computed-sort column='{computed_sort[0]}' direction='{computed_sort[2]}' using='{computed_sort[1]}' />\n"
             if computed_sort else "")
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
    label_run = ""
    if data_label:
        label_run = (f"            <customized-label><formatted-text>"
                     f"<run bold='true' fontalignment='1' fontcolor='{NAVY}' fontsize='9'>&lt;{data_label}&gt;</run>"
                     f"</formatted-text></customized-label>\n")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{NAVY}'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='{table}' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
{db}
{ib}
          </datasource-dependencies>
{csort}          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='pane'>
            <format attr='grid-line-show' value='false' />
            <format attr='zero-line-show' value='true' />
          </style-rule>
          <style-rule element='axis'>
            <format attr='rule-color' value='#C3CDD8' />
            <format attr='tick-color' value='#E3E9EF' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='{mark}' />
{enc}{label_run}{pane_style}          </pane>
        </panes>
        <rows>{rows}</rows>
        <cols>{cols}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Diverging monthly bar (green ≥0 / red <0) via a sign MEASURE ────────────
def diverging_month_bar(sheet_name, title_vn, table, month_col, value_calc,
                        sign_calc, label_calc=None,
                        color_palette="SIA Diverging Measure") -> str:
    ds = ds_name(table)
    vref = value_calc.ref()
    sref = sign_calc.ref()
    lref = (label_calc.ref() if label_calc is not None else vref)
    mref = f"[{ds}].[mn:{esc(month_col)}:ok]"
    month_dep = (f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' "
                 f"layered='true' name='[{esc(month_col)}]' pivot='key' role='dimension' type='ordinal' "
                 f"user-datatype='datetime' visual-totals='Default' />")
    month_inst = f"            <column-instance column='[{esc(month_col)}]' derivation='Month-Trunc' name='[mn:{esc(month_col)}:ok]' pivot='key' type='quantitative' />"
    deps = [month_dep, value_calc.dep_col(), sign_calc.dep_col()]
    insts = [month_inst, value_calc.inst(), sign_calc.inst()]
    if label_calc is not None:
        deps.append(label_calc.dep_col()); insts.append(label_calc.inst())
    deps_x = "\n".join(deps)
    insts_x = "\n".join(insts)
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{NAVY}'>{esc(title_vn)}</run></formatted-text></title>
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
            <format attr='zero-line-show' value='true' />
          </style-rule>
          <style-rule element='axis'>
            <format attr='display' class='0' field='{vref}' scope='rows' value='false' />
            <format attr='rule-color' value='#C3CDD8' />
            <format attr='tick-color' value='#E3E9EF' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Bar' />
            <encodings>
              <color column='{sref}' palette='{color_palette}' type='palette' />
            </encodings>
            <style>
              <style-rule element='mark'>
                <format attr='mark-bar-size' value='0.6' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{vref}</rows>
        <cols>{mref}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Symbol map — CUSTOM Lat/Lon columns (proven on VNPT; safest map path) ──
def map_custom(sheet_name, title_vn, table, lat_col, lon_col, size_calc, dim_col,
               color_calc=None, color_palette="SIA Sequential Blue") -> str:
    """Plot own Lat/Lon as geographic fields (AVG on rows/cols, dim on detail so
    each city is its own dot). No dependence on name geocoding. Lat/Lon carry
    latitude/longitude semantic-role. PROVEN on the extract path (VNPT).
    The design research flagged this bubble map as the SAFE map approach vs
    spatial MAKELINE / auto-geocode / curved great-circle lines."""
    ds = ds_name(table)
    tbl = Table(table)
    sref = size_calc.ref()
    latref = f"[{ds}].[avg:{esc(lat_col)}:qk]"
    lonref = f"[{ds}].[avg:{esc(lon_col)}:qk]"
    lat_dep = (f"            <column aggregation='Avg' datatype='real' default-type='quantitative' "
               f"layered='true' name='[{esc(lat_col)}]' pivot='key' role='measure' "
               f"semantic-role='[Latitude].[Latitude]' type='quantitative' user-datatype='real' "
               f"visual-totals='Default' />")
    lon_dep = (f"            <column aggregation='Avg' datatype='real' default-type='quantitative' "
               f"layered='true' name='[{esc(lon_col)}]' pivot='key' role='measure' "
               f"semantic-role='[Longitude].[Longitude]' type='quantitative' user-datatype='real' "
               f"visual-totals='Default' />")
    lat_inst = f"            <column-instance column='[{esc(lat_col)}]' derivation='Avg' name='[avg:{esc(lat_col)}:qk]' pivot='key' type='quantitative' />"
    lon_inst = f"            <column-instance column='[{esc(lon_col)}]' derivation='Avg' name='[avg:{esc(lon_col)}:qk]' pivot='key' type='quantitative' />"
    color_enc = color_dep = color_inst = ""
    if color_calc is not None:
        color_enc = f"              <color column='{color_calc.ref()}' palette='{color_palette}' type='palette' />\n"
        color_dep = "\n" + color_calc.dep_col()
        color_inst = "\n" + color_calc.inst()
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{NAVY}'>{esc(title_vn)}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='{table}' name='{ds}' />
          </datasources>
          <mapsources>
            <mapsource name='Tableau' />
          </mapsources>
          <datasource-dependencies datasource='{ds}'>
{lat_dep}
{lon_dep}
{size_calc.dep_col()}
{tbl.dep(dim_col)}{color_dep}
{lat_inst}
{lon_inst}
{size_calc.inst()}
{tbl.dim_inst(dim_col)}{color_inst}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='map'>
            <format attr='washout' value='0.4' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings>
              <size column='{sref}' />
{color_enc}              <lod column='{tbl.dim(dim_col)}' />
            </encodings>
          </pane>
        </panes>
        <rows>{latref}</rows>
        <cols>{lonref}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Donut / pie (revenue mix by dimension) ─────────────────────────────────
def donut(sheet_name, title_vn, table, dim_col, value_calc,
          color_palette="SIA Sequential Blue", label_calc=None) -> str:
    ds = ds_name(table)
    tbl = Table(table)
    vref = value_calc.ref()
    dref = tbl.dim(dim_col)
    lref = (label_calc.ref() if label_calc is not None else vref)
    deps = [tbl.dep(dim_col), value_calc.dep_col()]
    insts = [tbl.dim_inst(dim_col), value_calc.inst()]
    if label_calc is not None:
        deps.append(label_calc.dep_col()); insts.append(label_calc.inst())
    deps_x = "\n".join(deps)
    insts_x = "\n".join(insts)
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontname='Tableau Bold' fontsize='13' bold='true' fontcolor='{NAVY}'>{esc(title_vn)}</run></formatted-text></title>
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
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Pie' />
            <encodings>
              <color column='{dref}' palette='{color_palette}' type='palette' />
              <angle column='{vref}' />
              <text column='{lref}' />
            </encodings>
            <customized-label><formatted-text>
              <run fontalignment='1' fontcolor='#FFFFFF' fontsize='9' bold='true'>&lt;{lref}&gt;</run>
            </formatted-text></customized-label>
            <style>
              <style-rule element='mark'>
                <format attr='mark-labels-show' value='true' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows /><cols />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Dashboard layout-flow ──────────────────────────────────────────────────
ROUNDED = "<_.fcp.DashboardRoundedCorners.true...format attr='corner-radius' value='14' />"

def leaf(name, minw=80, w=100000, kpi=False, show_title=True):
    st = "" if show_title else "show-title='false' "
    cache = ("                <layout-cache cell-count-h='1' non-cell-size-h='32' type-h='cell' type-w='cell' />\n"
             if kpi else
             f"                <layout-cache minwidth='{minw}' type-h='scalable' type-w='scalable' />\n")
    return (f"              <zone h='100000' id='{_zid()}' {st}name='{esc(name)}' w='{w}' x='0' y='0'>\n"
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

def header_band(title_vn: str, subtitle_vn: str, h: int = 4600) -> str:
    tid = _zid()
    return (f"          <zone h='{h}' id='{tid}' type-v2='text' w='100000' x='0' y='0'>\n"
            f"            <formatted-text>\n"
            f"              <run fontname='Tableau Bold' fontsize='18' bold='true' fontcolor='#FCB130'>SINGAPORE AIRLINES</run>\n"
            f"              <run fontname='Tableau Book' fontsize='13' fontcolor='#CBD9EE'>   |   {esc(title_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='11' fontcolor='#A9C0E0'>    ·   {esc(subtitle_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='10' fontcolor='#FCB130'>    ·   Network &amp; Commercial Control Tower</run>\n"
            f"            </formatted-text>\n"
            f"            <zone-style>"
            f"<format attr='border-color' value='{GOLD}' /><format attr='border-style' value='solid' />"
            f"<format attr='border-width' value='0' />"
            f"<format attr='border-bottom-width' value='4' />"
            f"<format attr='margin' value='0' /><format attr='padding' value='14' />"
            f"<format attr='background-color' value='{BRAND}' /></zone-style>\n"
            f"          </zone>")

def hrow(names, h, minw=80):
    body = "\n".join(leaf(n, minw) for n in names)
    return (f"          <zone h='{h}' id='{_zid()}' param='horz' type-v2='layout-flow' w='100000' x='0' y='0'>\n{body}\n          </zone>")


def _spark_kpi_card(number_sheet: str, spark_sheet: str, w=100000):
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


def dashboard(name, rows_xml, width=1560, height=1300):
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


# ─── Palettes ───────────────────────────────────────────────────────────────
_PALETTES = """  <preferences>
    <color-palette name='SIA Sequential Blue' type='ordered-sequential'>
      <color>#DCE6F4</color>
      <color>#A9C0E0</color>
      <color>#6E93C6</color>
      <color>#3E72B8</color>
      <color>#1D4886</color>
      <color>#12203F</color>
    </color-palette>
    <color-palette name='SIA Sequential Gold' type='ordered-sequential'>
      <color>#FDEBC6</color>
      <color>#FCD98C</color>
      <color>#FCB130</color>
      <color>#D98E1E</color>
      <color>#12203F</color>
    </color-palette>
    <color-palette name='SIA Categorical' type='regular'>
      <color>#1D4886</color>
      <color>#3E72B8</color>
      <color>#FCB130</color>
      <color>#0E9F6E</color>
      <color>#8E7CC3</color>
      <color>#D98E1E</color>
    </color-palette>
    <color-palette name='SIA Diverging Measure' type='ordered-diverging'>
      <color>#D64545</color>
      <color>#F0C9C9</color>
      <color>#C7E6D5</color>
      <color>#0E9F6E</color>
    </color-palette>
  </preferences>"""


def workbook(tables_used, calcs, sheets_xml, sheet_names, dashboard_xml, dash_names):
    calcs_by_table: dict[str, list[Calc]] = {}
    for c in calcs:
        calcs_by_table.setdefault(c.table, []).append(c)
    ds_blocks = "\n".join(datasource_block(t, calcs_by_table.get(t, [])) for t in tables_used)
    ws = "  <worksheets>\n" + "\n".join(sheets_xml) + "\n  </worksheets>\n"
    dash = "  <dashboards>\n" + dashboard_xml + "\n  </dashboards>\n"
    hidden = "".join(f"    <window class='worksheet' hidden='true' name='{esc(n)}'></window>\n" for n in sheet_names)
    vps = "\n".join(f"        <viewpoint name='{esc(n)}'><zoom type='entire-view' /></viewpoint>" for n in sheet_names)
    dash_wins = "".join(
        f"    <window class='dashboard' maximized='true' name='{esc(dn)}'>\n      <viewpoints>\n{vps}\n      </viewpoints>\n    </window>\n"
        for dn in dash_names)
    windows = "  <windows>\n" + hidden + dash_wins + "  </windows>\n"
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
    out = Path(f"/tmp/singaporeair/{wb_name}.twbx")
    Path(f"/tmp/singaporeair/{wb_name}.twb").write_text(twb_xml, encoding="utf-8")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{wb_name}.twb", twb_xml)
        z.write(HYPER, arcname="Data/Datasources/singaporeair.hyper")
    return out


def _env() -> dict:
    env = {}
    for line in (Path(__file__).resolve().parents[2] / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def publish(twbx_path: Path, wb_name: str) -> str:
    import tableauserverclient as tsc
    env = _env()
    auth = tsc.PersonalAccessTokenAuth(env["TABLEAU_PAT_NAME"], env["TABLEAU_PAT_SECRET"],
                                       site_id=env["TABLEAU_SITE_NAME"])
    server = tsc.Server(env["TABLEAU_SITE_URL"], use_server_version=True)
    with server.auth.sign_in(auth):
        item = tsc.WorkbookItem(project_id=SIA_PROJECT_ID, name=wb_name, show_tabs=False)
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
            out = Path(f"/tmp/singaporeair/render_{wb_name}_{v.name}.png")
            out.write_bytes(v.image)
            print(f"  rendered {v.name} -> {out} ({len(v.image):,} bytes)")
