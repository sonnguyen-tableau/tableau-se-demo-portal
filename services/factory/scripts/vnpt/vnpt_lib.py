"""VNPT workbook builder library — self-contained .twbx with per-table datasources.

Adapted from vacs_lib.py (the proven self-contained extract-workbook technique:
federated → hyper named-connection, .hyper packaged inside the .twbx, RENDERS on
Cloud with skip_connection_check=True — no fragile sqlproxy seed block).

ARCHITECTURE: one `<datasource>` PER TABLE (each a single-relation federated
hyper connection to the SAME packaged vnpt.hyper). Every VNPT worksheet is
single-table (pre-aggregated facts), so each sheet points at its table's
datasource — no cross-table join/relationship is ever needed at render time,
and every field name is BARE (no `[Field (Table)]` qualification).

Design system (VNPT brand): royal blue #1265b6, sky #1e82c8, deep navy #0b2f5e.
Executive "quản trị điều hành" control-tower framing. 100% Vietnamese labels.
"""
from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

CONN_PREFIX = "hyperconn"
HYPER = Path("/tmp/vnpt/vnpt.hyper")

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


# ─── Design tokens (VNPT) ────────────────────────────────────────────────────
BG_PAGE = "#EEF3F9"
BG_CARD = "#FFFFFF"
BORDER  = "#D8E2EE"
NAVY    = "#0B2F5E"
BRAND   = "#1265B6"
SKY     = "#1E82C8"
GOLD    = "#E8A317"
BODY    = "#5A6B7B"
GOOD    = "#1E9E62"
WARN    = "#E8A317"
BAD     = "#D14343"


# ─── Schema: table → [(col, datatype, role)] ────────────────────────────────
_SCHEMA: dict[str, list[tuple[str, str, str]]] = {
    "Services": [
        ("ServiceId", "integer", "dimension"), ("ServiceName", "string", "dimension"),
        ("IsSubscriberLine", "integer", "measure"), ("TenantId", "string", "dimension"),
    ],
    "Provinces": [
        ("ProvinceId", "integer", "dimension"), ("Province", "string", "dimension"),
        ("Region", "string", "dimension"), ("Lat", "real", "measure"),
        ("Lon", "real", "measure"), ("TenantId", "string", "dimension"),
    ],
    "MonthlyTotals": [
        ("TotalsId", "integer", "dimension"), ("Month", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("MonthNum", "integer", "dimension"),
        ("RevenueVnd", "real", "measure"), ("EbitdaVnd", "real", "measure"),
        ("PretaxProfitVnd", "real", "measure"), ("TotalSubscribers", "integer", "measure"),
        ("GrossAdds", "integer", "measure"), ("Churned", "integer", "measure"),
        ("NetAdds", "integer", "measure"), ("ChurnRatePct", "real", "measure"),
        ("Arpu", "integer", "measure"), ("FiveGSubs", "integer", "measure"),
        ("DataTrafficPb", "real", "measure"),
        ("PriorYearRevenueVnd", "real", "measure"), ("PriorYearSubscribers", "integer", "measure"),
        ("PriorYearNetAdds", "integer", "measure"), ("PriorYearArpu", "integer", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "MonthlyService": [
        ("ServiceMonthId", "integer", "dimension"), ("Month", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("MonthNum", "integer", "dimension"),
        ("ServiceName", "string", "dimension"), ("RevenueVnd", "real", "measure"),
        ("Subscribers", "integer", "measure"), ("GrowthYoYPct", "real", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "ProvinceSummary": [
        ("ProvinceSummaryId", "integer", "dimension"), ("Province", "string", "dimension"),
        ("Region", "string", "dimension"), ("Lat", "real", "measure"),
        ("Lon", "real", "measure"), ("RevenueVnd", "real", "measure"),
        ("Subscribers", "integer", "measure"), ("ChurnRatePct", "real", "measure"),
        ("FiveGCoveragePct", "real", "measure"), ("MarketSharePct", "real", "measure"),
        ("GrowthYoYPct", "real", "measure"), ("TenantId", "string", "dimension"),
    ],
    "ChurnReasons": [
        ("ChurnReasonId", "integer", "dimension"), ("Reason", "string", "dimension"),
        ("ChurnedCount", "integer", "measure"), ("SharePct", "real", "measure"),
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

    def geo_dep(self, col: str, semantic_role: str) -> str:
        """Dimension dep carrying a geographic semantic-role (for geocoded maps)."""
        return (f"            <column aggregation='Count' datatype='string' default-type='nominal' "
                f"layered='true' name='[{esc(col)}]' pivot='key' role='dimension' "
                f"semantic-role='{semantic_role}' type='nominal' user-datatype='string' "
                f"visual-totals='Default' />")

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
          <connection class='hyper' authentication='auth-none' dbname='Data/Datasources/vnpt.hyper' schema='Extract' server='' default-settings='yes' />
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
                   delta_text: str, delta_color: str, sub_text: str, size=22,
                   value_color=NAVY) -> str:
    field = calc.ref()
    label = esc(title_vn.upper())
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


# ─── Sparkline worksheet (6/12-month mini-trend Line) ───────────────────────
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
    if color_palette and encodings:
        for k, c in encodings:
            if k == "color":
                enc_block = enc_block.replace(
                    f"              <color column='{c}' />\n",
                    f"              <color column='{c}' palette='{color_palette}' type='palette' />\n")

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


# ─── §11 Emphasis monthly chart: max column darkest + value labels ──────────
def emphasis_month_chart(sheet_name, title_vn, table: str, month_col: str,
                         value_calc: Calc, label_calc: Calc = None,
                         color_palette="VNPT Sequential Blue",
                         hide_axis=True, filters=None) -> str:
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
    filt_xml = ("\n" + "\n".join(filters)) if filters else ""
    axis_hide = (f"            <format attr='display' class='0' field='{vref}' scope='rows' value='false' />\n"
                 if hide_axis else "")
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
          </datasource-dependencies>{filt_xml}
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
              <color column='{vref}' palette='{color_palette}' type='palette' />
              <text column='{lref}' />
            </encodings>
            <customized-label><formatted-text>
              <run bold='true' fontalignment='1' fontcolor='{NAVY}' fontsize='10'>&lt;{lref}&gt;</run>
            </formatted-text></customized-label>
            <style>
              <style-rule element='mark'>
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


# ─── Diverging monthly bar (Net Adds: green ≥0 / red <0) via a sign MEASURE ──
def diverging_month_bar(sheet_name, title_vn, table: str, month_col: str,
                        value_calc: Calc, sign_calc: Calc,
                        label_calc: Calc = None,
                        color_palette="VNPT Diverging Measure", filters=None) -> str:
    """Monthly bars colored by a sign MEASURE (values -1/+1) mapped through a
    2-stop diverging measure palette — color-by-dimension does NOT bind in a
    hand-authored .twb (falls to default orange), but a MEASURE pill does. So
    `sign_calc` must be a quantitative calc, e.g. SIGN(SUM([NetAdds])).
    `value_calc` = bar length (NetAdds)."""
    ds = ds_name(table)
    vref = value_calc.ref()
    sref = sign_calc.ref()
    lref = (label_calc.ref() if label_calc is not None else vref)
    mref = f"[{ds}].[mn:{esc(month_col)}:ok]"
    month_dep = (f"            <column aggregation='Year' datatype='datetime' default-type='ordinal' "
                 f"layered='true' name='[{esc(month_col)}]' pivot='key' role='dimension' type='ordinal' "
                 f"user-datatype='datetime' visual-totals='Default' />")
    month_inst = f"            <column-instance column='[{esc(month_col)}]' derivation='Month' name='[mn:{esc(month_col)}:ok]' pivot='key' type='ordinal' />"
    deps = [month_dep, value_calc.dep_col(), sign_calc.dep_col()]
    insts = [month_inst, value_calc.inst(), sign_calc.inst()]
    if label_calc is not None:
        deps.append(label_calc.dep_col()); insts.append(label_calc.inst())
    deps_x = "\n".join(deps)
    insts_x = "\n".join(insts)
    filt_xml = ("\n" + "\n".join(filters)) if filters else ""
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
          </datasource-dependencies>{filt_xml}
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
              <text column='{lref}' />
            </encodings>
            <customized-label><formatted-text>
              <run bold='true' fontalignment='1' fontcolor='{NAVY}' fontsize='9'>&lt;{lref}&gt;</run>
            </formatted-text></customized-label>
            <style>
              <style-rule element='mark'>
                <format attr='mark-bar-size' value='0.62' />
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


# ─── Donut (revenue mix by service) ─────────────────────────────────────────
def donut(sheet_name, title_vn, table: str, dim_col: str, value_calc: Calc,
          color_palette="VNPT Categorical", label_calc: Calc = None,
          inner_pct=55) -> str:
    """A pie mark (angle = value, color = dim). Donut hole via a smaller white
    second layer is not authored here — a filled pie reads fine as a mix. The
    slice value shown as a % mark label if `label_calc` given."""
    ds = ds_name(table)
    vref = value_calc.ref()
    dref = f"[{ds}].[none:{esc(dim_col)}:nk]"
    lref = (label_calc.ref() if label_calc is not None else vref)
    dim_dep = (f"            <column aggregation='Count' datatype='string' default-type='nominal' "
               f"layered='true' name='[{esc(dim_col)}]' pivot='key' role='dimension' type='nominal' "
               f"user-datatype='string' visual-totals='Default' />")
    dim_inst = f"            <column-instance column='[{esc(dim_col)}]' derivation='None' name='[none:{esc(dim_col)}:nk]' pivot='key' type='nominal' />"
    deps = [dim_dep, value_calc.dep_col()]
    insts = [dim_inst, value_calc.inst()]
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
        <rows />
        <cols />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Symbol map — geocoded province name → generated lat/long ───────────────
def map_geocoded(sheet_name, title_vn, table: str, size_calc: Calc,
                 color_calc: Calc = None, color_palette="VNPT Sequential Blue") -> str:
    """One dot per Province (geocoded via semantic-role → [Latitude/Longitude
    (generated)]), sized by `size_calc`, optionally colored by `color_calc`.
    Requires Country for disambiguation (VN provinces). PROBE before dashboard."""
    ds = ds_name(table)
    prov = Table(table)
    sref = size_calc.ref()
    color_enc = ""
    color_dep = ""
    color_inst = ""
    if color_calc is not None:
        cref = color_calc.ref()
        color_enc = f"              <color column='{cref}' palette='{color_palette}' type='palette' />\n"
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
{size_calc.dep_col()}
{prov.geo_dep("Province", "[State].[Name]")}{color_dep}
{size_calc.inst()}
{prov.dim_inst("Province")}{color_inst}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='map'>
            <format attr='washout' value='0.35' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings>
              <size column='{sref}' />
{color_enc}              <lod column='{prov.dim("Province")}' />
            </encodings>
          </pane>
        </panes>
        <rows>[{ds}].[Latitude (generated)]</rows>
        <cols>[{ds}].[Longitude (generated)]</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Symbol map — CUSTOM Lat/Lon columns (no geocoding dependency) ──────────
def map_custom(sheet_name, title_vn, table: str, lat_col: str, lon_col: str,
               size_calc: Calc, dim_col: str, color_calc: Calc = None,
               color_palette="VNPT Sequential Blue") -> str:
    """Plot own Lat/Lon as geographic fields (AVG on rows/cols, Province on
    detail so each province is its own dot). No dependence on name geocoding.
    Lat/Lon columns carry latitude/longitude semantic-role. PROBE before use."""
    ds = ds_name(table)
    prov = Table(table)
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
    color_enc = ""
    color_dep = ""
    color_inst = ""
    if color_calc is not None:
        cref = color_calc.ref()
        color_enc = f"              <color column='{cref}' palette='{color_palette}' type='palette' />\n"
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
{prov.dep(dim_col)}{color_dep}
{lat_inst}
{lon_inst}
{size_calc.inst()}
{prov.dim_inst(dim_col)}{color_inst}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='map'>
            <format attr='washout' value='0.35' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings>
              <size column='{sref}' />
{color_enc}              <lod column='{prov.dim(dim_col)}' />
            </encodings>
          </pane>
        </panes>
        <rows>{latref}</rows>
        <cols>{lonref}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Dashboard layout-flow ──────────────────────────────────────────────────
ROUNDED = "<_.fcp.DashboardRoundedCorners.true...format attr='corner-radius' value='14' />"

def leaf(name, minw=80, w=100000, kpi=False, show_title=True):
    st = "" if show_title else "show-title='false' "
    cache = (f"                <layout-cache cell-count-h='1' non-cell-size-h='32' type-h='cell' type-w='cell' />\n"
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
    """Navy control-tower header band with a sky-blue accent bottom border."""
    tid = _zid()
    return (f"          <zone h='{h}' id='{tid}' type-v2='text' w='100000' x='0' y='0'>\n"
            f"            <formatted-text>\n"
            f"              <run fontname='Tableau Bold' fontsize='18' bold='true' fontcolor='#FFFFFF'>VNPT</run>\n"
            f"              <run fontname='Tableau Book' fontsize='13' fontcolor='#8FC4EC'>   |   {esc(title_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='11' fontcolor='#B9D6EF'>    ·   {esc(subtitle_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='10' fontcolor='#E8A317'>    ·   Dữ liệu mô phỏng (demo)</run>\n"
            f"            </formatted-text>\n"
            f"            <zone-style>"
            f"<format attr='border-color' value='{SKY}' /><format attr='border-style' value='solid' />"
            f"<format attr='border-width' value='0' />"
            f"<format attr='border-bottom-width' value='4' />"
            f"<format attr='margin' value='0' /><format attr='padding' value='14' />"
            f"<format attr='background-color' value='{NAVY}' /></zone-style>\n"
            f"          </zone>")

def hrow(names, h, minw=80, kpi=False):
    body = "\n".join(leaf(n, minw, kpi=kpi) for n in names)
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

def dashboard(name, rows_xml, width=1560, height=1240):
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
    <color-palette name='VNPT Sequential Blue' type='ordered-sequential'>
      <color>#DCEBF7</color>
      <color>#A9CDEC</color>
      <color>#6FA8DC</color>
      <color>#3A82C8</color>
      <color>#1265B6</color>
      <color>#0B2F5E</color>
    </color-palette>
    <color-palette name='VNPT Categorical' type='regular'>
      <color>#1265B6</color>
      <color>#1E82C8</color>
      <color>#6FA8DC</color>
      <color>#E8A317</color>
      <color>#1E9E62</color>
      <color>#8E7CC3</color>
    </color-palette>
    <color-palette name='VNPT Diverging' type='regular'>
      <color>#1E9E62</color>
      <color>#D14343</color>
    </color-palette>
    <color-palette name='VNPT Diverging Measure' type='ordered-diverging'>
      <color>#D14343</color>
      <color>#F0C9C9</color>
      <color>#C7E6D5</color>
      <color>#1E9E62</color>
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
    out = Path(f"/tmp/vnpt/{wb_name}.twbx")
    Path(f"/tmp/vnpt/{wb_name}.twb").write_text(twb_xml, encoding="utf-8")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{wb_name}.twb", twb_xml)
        z.write(HYPER, arcname="Data/Datasources/vnpt.hyper")
    return out


VNPT_PROJECT_ID = "f7106e3c-280e-4886-b528-312f3131b683"  # Demo/VNPT

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
        item = tsc.WorkbookItem(project_id=VNPT_PROJECT_ID, name=wb_name, show_tabs=False)
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
            out = Path(f"/tmp/vnpt/render_{wb_name}_{v.name}.png")
            out.write_bytes(v.image)
            print(f"  rendered {v.name} -> {out} ({len(v.image):,} bytes)")
