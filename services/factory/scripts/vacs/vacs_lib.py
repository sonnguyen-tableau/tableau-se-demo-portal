"""VACS workbook builder library — self-contained .twbx with per-table datasources.

BREAKTHROUGH (probed 2026-07-09): a self-contained extract-workbook (federated
→ hyper named-connection, .hyper packaged inside the .twbx) RENDERS on this
Tableau Cloud with `skip_connection_check=True` — no fragile sqlproxy seed block
required.

ARCHITECTURE: one `<datasource>` PER TABLE (each a single-relation federated
hyper connection to the SAME packaged vacs.hyper). Every VACS worksheet is
single-table, so each sheet points at its table's datasource — no cross-table
join/relationship is ever needed at render time, and every field name is BARE
(no `[Field (Table)]` qualification, because each datasource is isolated).
  → A single datasource that lists many unjoined sibling <relation>s is INVALID
    federated XML and renders BLANK (learned the hard way on D1 v1).

The published `Demo/VACS` datasource still serves the MCP AI agent; these
embedded workbooks power the portal dashboards.

Design system (VACS brand): blue #006D99, deep #00405A, gold #D09A2D.
100% Vietnamese labels.
"""
from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

CONN_PREFIX = "hyperconn"
HYPER = Path("/tmp/vacs/vacs.hyper")

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


# ─── Design tokens ──────────────────────────────────────────────────────────
BG_PAGE = "#F4F8FA"
BG_CARD = "#FFFFFF"
BORDER  = "#DCE7ED"
NAVY    = "#00405A"
BRAND   = "#006D99"
GOLD    = "#D09A2D"
CYAN    = "#3AA0C4"
BODY    = "#5A6B7B"
GOOD    = "#2E9E6B"
WARN    = "#E8A317"
BAD     = "#D14343"


# ─── Schema: table → [(col, datatype, role)] ────────────────────────────────
_SCHEMA: dict[str, list[tuple[str, str, str]]] = {
    "Airlines": [
        ("AirlineId", "integer", "dimension"), ("AirlineName", "string", "dimension"),
        ("AirlineCode", "string", "dimension"), ("Region", "string", "dimension"),
        ("Country", "string", "dimension"), ("ContractTier", "string", "dimension"),
        ("TenantId", "string", "dimension"),
    ],
    "Routes": [
        ("RouteId", "integer", "dimension"), ("Route", "string", "dimension"),
        ("OriginAirport", "string", "dimension"), ("DestAirport", "string", "dimension"),
        ("DestCity", "string", "dimension"), ("DestCountry", "string", "dimension"),
        ("HaulType", "string", "dimension"),
        ("DestLat", "real", "measure"), ("DestLon", "real", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "Complaints": [
        ("ComplaintId", "integer", "dimension"), ("DepMonth", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("AirlineName", "string", "dimension"),
        ("AirlineCode", "string", "dimension"), ("Flight", "string", "dimension"),
        ("Route", "string", "dimension"), ("OriginAirport", "string", "dimension"),
        ("DestAirport", "string", "dimension"), ("DepDate", "datetime", "dimension"),
        ("ReceivedDate", "datetime", "dimension"), ("RepliedDate", "string", "dimension"),
        ("ReplyDays", "integer", "measure"), ("SLATargetDays", "integer", "measure"),
        ("WithinSLA", "string", "dimension"), ("Category", "string", "dimension"),
        ("SubCategory", "string", "dimension"), ("RootCauseGroup", "string", "dimension"),
        ("ForeignObjectType", "string", "dimension"), ("FlightDelayFlag", "integer", "measure"),
        ("Severity", "string", "dimension"), ("Status", "string", "dimension"),
        ("CorrectiveAction", "string", "dimension"), ("Summary", "string", "dimension"),
        ("Remark", "string", "dimension"), ("TenantId", "string", "dimension"),
    ],
    "Compliments": [
        ("ComplimentId", "integer", "dimension"), ("DepMonth", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("AirlineName", "string", "dimension"),
        ("AirlineCode", "string", "dimension"), ("Flight", "string", "dimension"),
        ("Route", "string", "dimension"), ("DepDate", "datetime", "dimension"),
        ("StaffInHonour", "string", "dimension"), ("Department", "string", "dimension"),
        ("Summary", "string", "dimension"), ("TenantId", "string", "dimension"),
    ],
    "SLARecords": [
        ("SLAId", "integer", "dimension"), ("DepMonth", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("AirlineName", "string", "dimension"),
        ("AirlineCode", "string", "dimension"), ("Flight", "string", "dimension"),
        ("Route", "string", "dimension"), ("DepDate", "datetime", "dimension"),
        ("BreachType", "string", "dimension"), ("DelayMinutes", "integer", "measure"),
        ("PenaltyUsd", "integer", "measure"), ("PenaltyVnd", "integer", "measure"),
        ("Status", "string", "dimension"), ("Summary", "string", "dimension"),
        ("TenantId", "string", "dimension"),
    ],
    "MealVolume": [
        ("VolumeId", "integer", "dimension"), ("Date", "datetime", "dimension"),
        ("DepMonth", "datetime", "dimension"), ("Year", "integer", "dimension"),
        ("AirlineName", "string", "dimension"), ("AirlineCode", "string", "dimension"),
        ("OriginAirport", "string", "dimension"),
        ("MealUnits", "integer", "measure"), ("Flights", "integer", "measure"),
        ("TenantId", "string", "dimension"),
    ],
    "MonthlySummary": [
        ("SummaryId", "integer", "dimension"), ("Month", "datetime", "dimension"),
        ("Year", "integer", "dimension"), ("MonthNum", "integer", "dimension"),
        ("AirlineName", "string", "dimension"), ("AirlineCode", "string", "dimension"),
        ("Meals", "integer", "measure"), ("Flights", "integer", "measure"),
        ("Complaints", "integer", "measure"), ("FOComplaints", "integer", "measure"),
        ("Compliments", "integer", "measure"), ("Penalties", "integer", "measure"),
        ("PenaltyUsd", "integer", "measure"), ("PenaltyVnd", "integer", "measure"),
        ("OnTimeReplies", "integer", "measure"), ("RepliedTotal", "integer", "measure"),
        ("ComplaintIndexPpm", "real", "measure"),
        ("PriorYearMeals", "integer", "measure"), ("PriorYearComplaints", "integer", "measure"),
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

    # raw dependency <column> for a worksheet's datasource-dependencies
    def dep(self, col: str, agg=None, caption=None) -> str:
        dt, role = self._roles[col]
        if role == "measure":
            a = agg or "Sum"
            datatype = "real" if dt == "real" else "integer"
            return (f"            <column aggregation='{a}' datatype='{datatype}' default-type='quantitative' "
                    f"layered='true' name='[{esc(col)}]' pivot='key' role='measure' type='quantitative' "
                    f"user-datatype='{datatype}' visual-totals='Default' />")
        # dimension
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

    def dim(self, col: str) -> str:  # ref
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
          <connection class='hyper' authentication='auth-none' dbname='Data/Datasources/vacs.hyper' schema='Extract' server='' default-settings='yes' />
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


# ─── KPI card (BAN) ─────────────────────────────────────────────────────────
# CRITICAL (learned on VACS): a text-only `Automatic` mark with EMPTY rows/cols
# renders fine STANDALONE but blanks out inside a dashboard cell when the
# datasource is a federated .hyper extract (mey's sqlproxy datasource tolerated
# empty rows/cols; the extract path does not). FIX: put the measure on <rows>
# with mark class='Text' → guarantees a mark in the dashboard cell. The row
# axis is hidden so only the big number shows. Gridlines/zero-line hidden too.
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


def kpi_card(sheet_name: str, calc: Calc, title_vn: str, value_color=NAVY, size=22) -> str:
    field = calc.ref()
    label = esc(title_vn.upper())
    value_run = (f"                <run bold='true' fontalignment='1' fontcolor='{value_color}' "
                 f"fontsize='{size}'><![CDATA[<{field}>]]></run>")
    return f"""    <worksheet name='{esc(sheet_name)}'>
      <layout-options>
        <title><formatted-text><run fontsize='9' bold='true' fontcolor='#5A6B7B'>{label}</run></formatted-text></title>
      </layout-options>
{_kpi_body(calc, label, value_run)}
      <simple-id uuid='{U()}' />
    </worksheet>"""


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
{_kpi_body(calc, label, value_run)}
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ─── Generic chart ──────────────────────────────────────────────────────────
def chart(sheet_name, title_vn, table: str, deps, insts, rows, cols, mark="Bar",
          encodings=None, filters=None, color_palette=None, single_color=None,
          data_label=None, computed_sort=None) -> str:
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
        pane_rules.append("                <format attr='mark-bar-size' value='0.72' />")
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


def categorical_filter(table: str, col: str, keep_members: list[str]) -> str:
    ds = ds_name(table)
    members = "\n".join(
        f"              <groupfilter function='member' level='[none:{esc(col)}:nk]' "
        f"member='&quot;{esc(m)}&quot;' />" for m in keep_members)
    return (f"          <filter class='categorical' column='[{ds}].[none:{esc(col)}:nk]'>\n"
            f"            <groupfilter function='union' user:ui-enumeration='inclusive' "
            f"user:ui-marker='enumerate'>\n{members}\n"
            f"            </groupfilter>\n          </filter>")


# ─── Dashboard layout-flow ──────────────────────────────────────────────────
ROUNDED = "<_.fcp.DashboardRoundedCorners.true...format attr='corner-radius' value='14' />"

def leaf(name, minw=80, w=100000, kpi=False):
    # KPI: type-h='cell' so the BAN number sizes to its natural cell (never
    # scaled-away), but type-w='scalable' so 5 KPIs in one horizontal flow each
    # get their flex width (type-w='cell' collapses all-but-first when several
    # compete for width in a fixed-width flow → blank cards). Charts fully
    # scalable to fill their card.
    cache = (f"                <layout-cache cell-count-h='1' non-cell-size-h='32' type-h='cell' type-w='cell' />\n"
             if kpi else
             f"                <layout-cache minwidth='{minw}' type-h='scalable' type-w='scalable' />\n")
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

def header_band(title_vn: str, subtitle_vn: str, h: int = 4600) -> str:
    """Navy header text band with a gold bottom-border accent. Single zone (the
    earlier separate empty gold stripe expanded to fill flex space → giant gold
    block). Keep `h` small so the KPI row below gets its full height."""
    tid = _zid()
    return (f"          <zone h='{h}' id='{tid}' type-v2='text' w='100000' x='0' y='0'>\n"
            f"            <formatted-text>\n"
            f"              <run fontname='Tableau Bold' fontsize='18' bold='true' fontcolor='#FFFFFF'>VACS</run>\n"
            f"              <run fontname='Tableau Book' fontsize='13' fontcolor='#8FD0E6'>   |   {esc(title_vn)}</run>\n"
            f"              <run fontname='Tableau Book' fontsize='11' fontcolor='#BBDCEA'>    ·   {esc(subtitle_vn)}</run>\n"
            # Synthetic-data marker (project data policy: demo tenants use real
            # company/airline names but must flag the data as a simulation model).
            f"              <run fontname='Tableau Book' fontsize='10' fontcolor='#D09A2D'>    ·   Dữ liệu mô phỏng (demo)</run>\n"
            f"            </formatted-text>\n"
            f"            <zone-style>"
            f"<format attr='border-color' value='{GOLD}' /><format attr='border-style' value='solid' />"
            f"<format attr='border-width' value='0' />"
            f"<format attr='border-bottom-width' value='4' />"
            f"<format attr='margin' value='0' /><format attr='padding' value='14' />"
            f"<format attr='background-color' value='{NAVY}' /></zone-style>\n"
            f"          </zone>")

def hrow(names, h, minw=80, kpi=False):
    body = "\n".join(leaf(n, minw, kpi=kpi) for n in names)
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


# ─── Palettes ───────────────────────────────────────────────────────────────
_PALETTES = """  <preferences>
    <color-palette name='VACS Sequential Blue' type='ordered-sequential'>
      <color>#DCEBF2</color>
      <color>#A9D2E4</color>
      <color>#6FB4D2</color>
      <color>#3AA0C4</color>
      <color>#006D99</color>
      <color>#00405A</color>
    </color-palette>
    <color-palette name='VACS Categorical' type='regular'>
      <color>#006D99</color>
      <color>#D09A2D</color>
      <color>#3AA0C4</color>
      <color>#2E9E6B</color>
      <color>#8E7CC3</color>
      <color>#D14343</color>
    </color-palette>
    <color-palette name='VACS Severity' type='regular'>
      <color>#DCE7ED</color>
      <color>#A9D2E4</color>
      <color>#E8A317</color>
      <color>#D14343</color>
    </color-palette>
  </preferences>"""


def workbook(tables_used: list[str], calcs: list[Calc], sheets_xml, sheet_names,
             dashboard_xml, dash_name):
    """Assemble a workbook with one datasource per used table. `calcs` are
    grouped by their .table and injected into that table's datasource block."""
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
    out = Path(f"/tmp/vacs/{wb_name}.twbx")
    Path(f"/tmp/vacs/{wb_name}.twb").write_text(twb_xml, encoding="utf-8")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{wb_name}.twb", twb_xml)
        z.write(HYPER, arcname="Data/Datasources/vacs.hyper")
    return out


VACS_PROJECT_ID = "96c71641-895b-466b-a972-2b2b34a7861f"  # Demo/VACS

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
        item = tsc.WorkbookItem(project_id=VACS_PROJECT_ID, name=wb_name, show_tabs=False)
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
            out = Path(f"/tmp/vacs/render_{wb_name}_{v.name}.png")
            out.write_bytes(v.image)
            print(f"  rendered {v.name} -> {out} ({len(v.image):,} bytes)")
