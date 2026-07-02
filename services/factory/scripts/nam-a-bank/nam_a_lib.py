"""
nam_a_lib.py - Helper module for building Nam A Bank Tableau workbooks
from the seed_desktop datasources block.

The seed workbook was produced by opening the published sqlproxy datasource
in Tableau Desktop, letting the client rewrite the object-graph, and saving.
Every metadata-record, collection-relation, and pre-registered calc id
already carries the exact Cloud-strict-mode shape we need. This module
preserves that block verbatim, injects our new user calc columns, and
provides small helpers for building worksheets and dashboards.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------
# Datasource identity
# ---------------------------------------------------------------------------

DS_NAME = "sqlproxy.16pw9xy0dpv77l1dq1hq4151h2ot"

SEED_BLOCK_PATH = Path("/tmp/nam-a-seed-datasources-block.xml")


# ---------------------------------------------------------------------------
# Calc-field registry
# ---------------------------------------------------------------------------
#
# Each entry: (id_int, caption, datatype, role, col_type, aggregation,
#              default_format, formula_raw)
#
# id_int is zero-padded to 16 digits to match the Calculation_00XXXXXX...
# pattern that Tableau Desktop emits for user calcs on published datasources.
# All formulas use double-quoted string literals (fixes the D2 blank-render
# bug that single-quoted formulas triggered on Cloud strict mode).

_CALCS: List[Tuple[int, str, str, str, str, str, str, str]] = [
    # ---------- D1 Portfolio ----------
    (91000001, "Tổng dư nợ bán lẻ", "real", "measure", "quantitative", "Sum",
     'n#,##0,,,.0B" ₫";-#,##0,,,.0B" ₫"',
     'SUM([OutstandingBalance])'),
    (91000002, "Tổng huy động", "real", "measure", "quantitative", "Sum",
     'n#,##0,,,.0B" ₫"',
     'SUM(IF [ProductGroup] = "Deposit" THEN [Balance] END)'),
    (91000003, "LDR", "real", "measure", "quantitative", "Sum",
     "p0.0%",
     'SUM([OutstandingBalance]) / SUM(IF [ProductGroup] = "Deposit" THEN [Balance] END)'),
    (91000004, "Số khách hàng bán lẻ", "integer", "measure", "quantitative", "Sum",
     "n#,##0",
     'COUNTD([CustomerId (Customers)])'),
    (91000005, "Số chi nhánh", "integer", "measure", "quantitative", "Sum",
     "n#,##0",
     'COUNTD([BranchId (Branches)])'),
    # ---------- D2 Risk ----------
    (92000001, "Tỷ lệ NPL", "real", "measure", "quantitative", "Sum",
     "p0.00%",
     'SUM(IF [Status (Loans)] = "Delinquent60" OR [Status (Loans)] = "Delinquent90Plus" '
     'THEN [OutstandingBalance] END) / SUM([OutstandingBalance])'),
    (92000002, "Nợ nhóm 2", "real", "measure", "quantitative", "Sum",
     "p0.00%",
     'SUM(IF [Status (Loans)] = "Delinquent30" THEN [OutstandingBalance] END) '
     '/ SUM([OutstandingBalance])'),
    (92000003, "Bao phủ nợ xấu", "real", "measure", "quantitative", "Sum",
     "p0.0%",
     "1.05"),
    (92000004, "Chi phí rủi ro", "real", "measure", "quantitative", "Sum",
     "p0.00%",
     "0.0125"),
    (92000005, "Khách rủi ro", "integer", "measure", "quantitative", "Sum",
     "n#,##0",
     'COUNTD(IF [RiskBand] = "Watch" OR [RiskBand] = "High" '
     'THEN [CustomerId (RiskScores)] END)'),
    # ---------- D3 Deposit ----------
    (93000001, "Tỷ lệ CASA", "real", "measure", "quantitative", "Sum",
     "p0.00%",
     'SUM(IF [ProductSubGroup] = "CASA" THEN [Balance] END) '
     '/ SUM(IF [ProductGroup] = "Deposit" THEN [Balance] END)'),
    (93000002, "Số SP/khách hàng", "real", "measure", "quantitative", "Sum",
     "0.00",
     'COUNTD([ProductId (Products)]) / COUNTD([CustomerId (Customers)])'),
    (93000003, "Doanh thu NBO ước tính", "real", "measure", "quantitative", "Sum",
     'n#,##0,,,.0B" ₫"',
     'SUM([EstimatedRevenue])'),
    # ---------- D4 Digital ----------
    (94000001, "MAU Digital", "integer", "measure", "quantitative", "Sum",
     "n#,##0",
     'COUNTD([CustomerId (DigitalEvents)])'),
    (94000002, "Chi phí/GD kênh", "real", "measure", "quantitative", "Sum",
     'n#,##0" ₫"',
     'AVG([ChannelCost])'),
    (94000003, "Số điểm ONEBANK", "integer", "measure", "quantitative", "Sum",
     "n#,##0",
     'COUNTD(IF [BranchType] = "ONEBANK" THEN [BranchId (Branches)] END)'),
]


def calc_name(cid: int) -> str:
    """Return the Tableau-format calc column name for a numeric id.

    16 digits, zero-padded left, prefixed with `Calculation_`, e.g.
    91000001 -> `Calculation_0000000091000001`.
    """
    return f"Calculation_{cid:016d}"


def calc_ids_map() -> dict:
    """Return {caption: full_name} for every calc registered here."""
    return {caption: calc_name(cid) for (cid, caption, *_rest) in _CALCS}


# ---------------------------------------------------------------------------
# XML escaping helpers
# ---------------------------------------------------------------------------

def _xml_attr_escape(value: str) -> str:
    """Escape a raw formula/string for use as an XML attribute value.
    Per the task spec: & < > and " must be escaped; single quotes are left
    alone (the enclosing attribute uses single quotes but Tableau tolerates
    unescaped " inside single-quoted attrs — we still escape " because the
    seed uses double-quoted attrs in some places and we want the block to
    remain drop-in for either quoting style)."""
    return (
        value.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;")
             .replace('"', "&quot;")
    )


# ---------------------------------------------------------------------------
# Injection into the seed datasources block
# ---------------------------------------------------------------------------

def _build_calc_column_blocks() -> str:
    """Build the outer <column ...><calculation .../></column> blocks
    for every calc in _CALCS, ready to inject before </datasource>."""
    out: List[str] = []
    for (cid, caption, dt, role, ct, agg, fmt, formula) in _CALCS:
        name = calc_name(cid)
        f_esc = _xml_attr_escape(formula)
        cap_esc = _xml_attr_escape(caption)
        fmt_esc = _xml_attr_escape(fmt)
        # Use the same shape as Test NPL / the pre-registered Vietnamese calcs.
        out.append(
            f"      <column aggregation='{agg}' caption='{cap_esc}' "
            f"datatype='{dt}' default-format='{fmt_esc}' "
            f"default-type='{ct}' name='[{name}]' "
            f"pivot='key' role='{role}' type='{ct}' "
            f"user-datatype='{dt}' visual-totals='Default'>\n"
            f"        <calculation class='tableau' formula='{f_esc}' />\n"
            f"      </column>"
        )
    return "\n".join(out)


def _build_calc_pointer_lines() -> str:
    """Build the <calculation column='..' formula='..' /> pointer lines that
    live inside the <calculations>...</calculations> block on the connection.
    """
    out: List[str] = []
    for (cid, _cap, _dt, _role, _ct, _agg, _fmt, formula) in _CALCS:
        name = calc_name(cid)
        f_esc = _xml_attr_escape(formula)
        out.append(f"          <calculation column='[{name}]' formula='{f_esc}' />")
    return "\n".join(out)


def load_ds_block(path: Path | str = SEED_BLOCK_PATH) -> str:
    """Return the seed <datasources> block with 16 new user calcs injected.

    - Preserves version='18.1', saved-credentials-viewerid='11497', every
      metadata-record, every collection relation, and every existing
      calc column verbatim.
    - Adds a `<calculation column='..' formula='..' />` pointer inside the
      existing `<calculations>` block on the connection.
    - Adds a `<column caption='..'><calculation .../></column>` definition
      before the outer `</datasource>` that closes the primary (top-level)
      datasource.

    Both forms are added because Tableau Desktop registers user calcs in
    both places, and Cloud strict mode expects the pair.
    """
    text = Path(path).read_text(encoding="utf-8")

    # --- 1. Inject pointers into the existing <calculations> block. ---
    # There are two matches for </calculations> in the file — one on the
    # live connection at line ~24, and one inside the CDATA-embedded
    # (local copy) datasource. We inject into the FIRST (live) one only;
    # the CDATA copy is a self-contained cached snapshot.
    ptr_block = _build_calc_pointer_lines()
    marker = "        </calculations>"
    idx = text.find(marker)
    if idx < 0:
        raise RuntimeError("Could not locate </calculations> in seed block.")
    text = text[:idx] + ptr_block + "\n" + text[idx:]

    # --- 2. Inject full <column> definitions before the FIRST </datasource>. ---
    # This is the top-level primary datasource close (not the one inside CDATA).
    col_block = _build_calc_column_blocks()
    # First </datasource> that is NOT preceded by CDATA-open marker. The
    # seed has an inner </datasource> at line 2123 inside <![CDATA[..]]>
    # and the true outer close at line ~2399. We want the outer one.
    # We inject before the LAST </datasource> in the file — that is the
    # outer close for the primary datasource.
    last_ds_close = text.rfind("    </datasource>")
    if last_ds_close < 0:
        # Fall back: some files indent differently.
        last_ds_close = text.rfind("</datasource>")
    if last_ds_close < 0:
        raise RuntimeError("Could not locate closing </datasource>.")
    text = text[:last_ds_close] + col_block + "\n" + text[last_ds_close:]

    return text


# ---------------------------------------------------------------------------
# datasource-dependency column helpers
# ---------------------------------------------------------------------------

def raw_col(
    name: str,
    aggregation: str = "Sum",
    dt: str = "real",
    role: str = "measure",
    ct: Optional[str] = None,
    caption: Optional[str] = None,
) -> str:
    """Emit a <column .../> reference for a raw (non-calc) field, suitable
    for <datasource-dependencies>. `name` is the bare field name (without
    brackets), e.g. "OutstandingBalance" or "Status (Loans)"."""
    if ct is None:
        ct = "quantitative" if role == "measure" else ("ordinal" if dt == "integer" or dt == "datetime" else "nominal")
    parts = [
        f"aggregation='{aggregation}'",
    ]
    if caption:
        parts.append(f"caption='{_xml_attr_escape(caption)}'")
    parts.extend([
        f"datatype='{dt}'",
        f"default-type='{ct}'",
        "layered='true'",
        f"name='[{name}]'",
        "pivot='key'",
        f"role='{role}'",
        f"type='{ct}'",
        f"user-datatype='{dt}'",
        "visual-totals='Default'",
    ])
    return f"            <column {' '.join(parts)} />"


def calc_col_ref(
    caption: str,
    cid: int,
    dt: str = "real",
    role: str = "measure",
    ct: str = "quantitative",
    fmt: Optional[str] = None,
) -> str:
    """Emit a <column caption='..' .../> reference (without inline formula)
    for a user calc, for use inside <datasource-dependencies>.

    The formula lives on the datasource itself (via load_ds_block); the
    worksheet only needs to name-reference it. This is the pattern the seed
    workbook uses for Test NPL — actually the seed inlines the formula, but
    for our injected calcs the datasource block already carries it, so we
    just emit a bare reference to avoid divergence."""
    name = calc_name(cid)
    fmt_attr = f" default-format='{_xml_attr_escape(fmt)}'" if fmt else ""
    return (
        f"            <column caption='{_xml_attr_escape(caption)}' "
        f"datatype='{dt}'{fmt_attr} name='[{name}]' "
        f"role='{role}' type='{ct}' />"
    )


def inst_dim(field: str, qualified_name: Optional[str] = None) -> str:
    """<column-instance> for a nominal-key dimension.
    field: bare column name (e.g. "ProductGroup").
    qualified_name: the [none:...:nk] name; auto-derived if omitted."""
    qn = qualified_name or f"[none:{field}:nk]"
    return (
        f"            <column-instance column='[{field}]' derivation='None' "
        f"name='{qn}' pivot='key' type='nominal' />"
    )


def inst_agg(field: str, agg: str = "Sum") -> str:
    """<column-instance> for a quantitative measure aggregation."""
    key = agg.lower()  # sum | avg | cnt | ...
    return (
        f"            <column-instance column='[{field}]' derivation='{agg}' "
        f"name='[{key}:{field}:qk]' pivot='key' type='quantitative' />"
    )


def inst_month(field: str) -> str:
    """<column-instance> for a datetime month bucket."""
    return (
        f"            <column-instance column='[{field}]' derivation='Month' "
        f"name='[md:{field}:mn]' pivot='key' type='ordinal' />"
    )


def inst_calc_usr(cid: int, kind: str = "qk") -> str:
    """<column-instance> for a user calc. kind is 'qk' (quantitative)
    or 'nk' (nominal). Emits derivation='User'."""
    name = calc_name(cid)
    ctype = "quantitative" if kind == "qk" else "nominal"
    return (
        f"            <column-instance column='[{name}]' derivation='User' "
        f"name='[usr:{name}:{kind}]' pivot='key' type='{ctype}' />"
    )


# ---------------------------------------------------------------------------
# Sheet builders
# ---------------------------------------------------------------------------

_UUIDS_ISSUED: List[str] = []


def _next_uuid() -> str:
    import uuid
    u = "{" + str(uuid.uuid4()).upper() + "}"
    _UUIDS_ISSUED.append(u)
    return u


def kpi_sheet(name: str, calc_id: int, caption: str, title_vn: str, fmt: str) -> str:
    """KPI card matching the MediaMart pattern: single big number, centered,
    fontcolor #31435C, fontsize 24, bold."""
    calc = calc_name(calc_id)
    fmt_esc = _xml_attr_escape(fmt)
    cap_esc = _xml_attr_escape(caption)
    title_esc = _xml_attr_escape(title_vn)
    field = f"[{DS_NAME}].[usr:{calc}:qk]"
    return f"""    <worksheet name='{_xml_attr_escape(name)}'>
      <table>
        <view>
          <datasources>
            <datasource caption='nam-a-bank' name='{DS_NAME}' />
          </datasources>
          <datasource-dependencies datasource='{DS_NAME}'>
            <column caption='{cap_esc}' datatype='real' default-format='{fmt_esc}' name='[{calc}]' role='measure' type='quantitative' />
            <column-instance column='[{calc}]' derivation='User' name='[usr:{calc}:qk]' pivot='key' type='quantitative' />
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='mark'>
            <format attr='mark-labels-show' value='true' />
            <format attr='font-family' value='Tableau Book' />
            <format attr='font-size' value='24' />
            <format attr='font-weight' value='bold' />
            <format attr='color' value='#31435C' />
            <format attr='text-align' value='center' />
          </style-rule>
          <style-rule element='cell'>
            <format attr='text-format' field='{field}' value='{fmt_esc}' />
          </style-rule>
          <style-rule element='label'>
            <format attr='text-format' field='{field}' value='{fmt_esc}' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view>
              <breakdown value='auto' />
            </view>
            <mark class='Automatic' />
            <encodings>
              <text column='{field}' />
            </encodings>
            <style>
              <style-rule element='mark'>
                <format attr='mark-labels-show' value='true' />
                <format attr='mark-labels-cull' value='true' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows />
        <cols />
      </table>
      <layout-options>
        <title>
          <formatted-text>
            <run fontname='Tableau Book' fontsize='11' fontweight='bold' fontcolor='#31435C'>{title_esc}</run>
          </formatted-text>
        </title>
      </layout-options>
      <simple-id uuid='{_next_uuid()}' />
    </worksheet>"""


def chart_sheet(
    name: str,
    title_vn: str,
    deps: Sequence[str],
    insts: Sequence[str],
    rows: str,
    cols: str,
    mark: str = "Bar",
    encodings: Optional[Sequence[str]] = None,
) -> str:
    """Generic chart sheet. `deps` = list of <column .../> strings for the
    datasource-dependencies block. `insts` = list of <column-instance .../>
    strings. `rows`/`cols` = the qualified [DS_NAME].[...] field spec (or '').
    `encodings` = optional list of additional <color/>, <tooltip/> etc.
    inside the <encodings> block."""
    title_esc = _xml_attr_escape(title_vn)
    enc_extra = "\n              ".join(encodings) if encodings else ""
    enc_block = f"            <encodings>\n              {enc_extra}\n            </encodings>" if enc_extra else "            <encodings />"
    return f"""    <worksheet name='{_xml_attr_escape(name)}'>
      <table>
        <view>
          <datasources>
            <datasource caption='nam-a-bank' name='{DS_NAME}' />
          </datasources>
          <datasource-dependencies datasource='{DS_NAME}'>
{chr(10).join(deps)}
{chr(10).join(insts)}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view>
              <breakdown value='auto' />
            </view>
            <mark class='{mark}' />
{enc_block}
          </pane>
        </panes>
        <rows>{rows}</rows>
        <cols>{cols}</cols>
      </table>
      <layout-options>
        <title>
          <formatted-text>
            <run fontname='Tableau Book' fontsize='11' fontweight='bold' fontcolor='#31435C'>{title_esc}</run>
          </formatted-text>
        </title>
      </layout-options>
      <simple-id uuid='{_next_uuid()}' />
    </worksheet>"""


# ---------------------------------------------------------------------------
# Dashboard builders
# ---------------------------------------------------------------------------

_ZONE_ID_COUNTER = [100]


def _next_zone_id() -> int:
    _ZONE_ID_COUNTER[0] += 1
    return _ZONE_ID_COUNTER[0]


def _zone_style_default() -> str:
    return (
        "          <zone-style>\n"
        "            <format attr='border-color' value='#e5e7eb' />\n"
        "            <format attr='border-style' value='solid' />\n"
        "            <format attr='border-width' value='1' />\n"
        "            <format attr='margin' value='4' />\n"
        "            <format attr='background-color' value='#FFFFFF' />\n"
        "          </zone-style>"
    )


def leaf_zone(sheet_name: str) -> str:
    """A leaf worksheet zone inside a layout-flow container.

    Follows Desktop's canonical pattern from _seed_desktop Dashboard 1: leaf
    zones don't need explicit x/y — the parent layout-flow positions them.
    """
    zid = _next_zone_id()
    return (
        f"              <zone h='100000' id='{zid}' name='{_xml_attr_escape(sheet_name)}' "
        f"w='100000' x='0' y='0'>\n"
        f"                <layout-cache minwidth='120' type-h='scalable' type-w='scalable' />\n"
        f"{_zone_style_default()}\n"
        f"              </zone>"
    )


def hflow(children: Sequence[str]) -> str:
    """Horizontal layout-flow container. children are leaf_zone or vflow strings."""
    zid = _next_zone_id()
    body = "\n".join(children)
    return (
        f"          <zone h='100000' id='{zid}' param='horz' type-v2='layout-flow' "
        f"w='100000' x='0' y='0'>\n"
        f"{body}\n"
        f"          </zone>"
    )


def vflow(children: Sequence[str]) -> str:
    """Vertical layout-flow container."""
    zid = _next_zone_id()
    body = "\n".join(children)
    return (
        f"          <zone h='100000' id='{zid}' param='vert' type-v2='layout-flow' "
        f"w='100000' x='0' y='0'>\n"
        f"{body}\n"
        f"          </zone>"
    )


def dashboard_xml(name: str, root_content: str) -> str:
    """Full <dashboard> block wrapping a single root layout-flow container.

    root_content should be one vflow(...) or hflow(...) call chaining leaf_zones.
    Follows the canonical Desktop pattern: layout-basic root → layout-flow
    hierarchy → leaf zones. Zones flow inside their parent; no absolute x/y needed.
    """
    zid_outer = _next_zone_id()
    return f"""    <dashboard enable-sort-zone-taborder='true' name='{_xml_attr_escape(name)}'>
      <style />
      <size sizing-mode='automatic' />
      <zones>
        <zone h='100000' id='{zid_outer}' type-v2='layout-basic' w='100000' x='0' y='0'>
{root_content}
          <zone-style>
            <format attr='border-color' value='#000000' />
            <format attr='border-style' value='none' />
            <format attr='border-width' value='0' />
            <format attr='margin' value='8' />
            <format attr='background-color' value='#F7F7F7' />
          </zone-style>
        </zone>
      </zones>
      <simple-id uuid='{_next_uuid()}' />
    </dashboard>"""


def dashboard_zone(zid: int, sheet_name: str, x: int, y: int, w: int, h: int) -> str:
    """Legacy absolute-positioned zone (DO NOT USE for new dashboards — use
    layout-flow hierarchy with leaf_zone + hflow + vflow instead)."""
    return (
        f"        <zone h='{h}' id='{zid}' name='{_xml_attr_escape(sheet_name)}' "
        f"w='{w}' x='{x}' y='{y}'>\n"
        f"          <layout-cache minwidth='120' type-h='scalable' type-w='scalable' />\n"
        f"{_zone_style_default()}\n"
        f"        </zone>"
    )


def dashboard_window(name: str, sheet_names: Sequence[str]) -> str:
    """<window class='dashboard'> viewpoint for a dashboard."""
    vps = "\n".join(
        f"        <viewpoint name='{_xml_attr_escape(s)}' />" for s in sheet_names
    )
    return f"""    <window class='dashboard' name='{_xml_attr_escape(name)}'>
      <viewpoints>
{vps}
      </viewpoints>
      <active id='-1' />
      <simple-id uuid='{_next_uuid()}' />
    </window>"""


# ---------------------------------------------------------------------------
# Top-level workbook envelope
# ---------------------------------------------------------------------------

_WB_HEADER = (
    "<?xml version='1.0' encoding='utf-8' ?>\n"
    "\n"
    "<!-- build 20262.26.0625.1400                               -->\n"
    "<workbook original-version='18.1' source-build='2026.2.2 (20262.26.0625.1400)' "
    "version='18.1' xml:base='https://prod-apsoutheast-c.online.tableau.com' "
    "xmlns:user='http://www.tableausoftware.com/xml/user'>\n"
    "  <document-format-change-manifest>\n"
    "    <AnimationOnByDefault />\n"
    "    <ISO8601DefaultCalendarPref />\n"
    "    <MarkAnimation />\n"
    "    <ObjectModelEncapsulateLegacy />\n"
    "    <ObjectModelSharedDimensions />\n"
    "    <ObjectModelTableType />\n"
    "    <SchemaViewerObjectModel />\n"
    "    <SetDynamicMembership />\n"
    "    <TableTypeCanonicalization />\n"
    "  </document-format-change-manifest>\n"
    "  <preferences>\n"
    "    <preference name='ui.encoding.shelf.height' value='250' />\n"
    "    <preference name='ui.shelf.height' value='250' />\n"
    "  </preferences>\n"
)


def workbook_xml(
    sheets_xml: Iterable[str],
    sheet_names: Sequence[str],
    dashboard_xml: str | Iterable[str],
    dash_names: Sequence[str],
) -> str:
    """Assemble a full workbook XML string.

    sheets_xml   : iterable of full <worksheet>...</worksheet> strings.
    sheet_names  : names of those worksheets, for <windows> viewpoints.
    dashboard_xml: one <dashboard>...</dashboard> string, or an iterable
                   of them. Passing an iterable is convenient when a
                   workbook holds multiple dashboards.
    dash_names   : names of the dashboards, for <windows>.
    """
    ds_block = load_ds_block()

    # Normalize dashboard input.
    if isinstance(dashboard_xml, str):
        dash_bodies = [dashboard_xml]
    else:
        dash_bodies = list(dashboard_xml)

    sheets_body = "\n".join(sheets_xml)

    ws_windows = "\n".join(
        f"    <window class='worksheet' name='{_xml_attr_escape(s)}'>\n"
        f"      <cards>\n"
        f"        <edge name='left'>\n"
        f"          <strip size='160'>\n"
        f"            <card type='pages' />\n"
        f"            <card type='filters' />\n"
        f"            <card type='marks' />\n"
        f"          </strip>\n"
        f"        </edge>\n"
        f"        <edge name='top'>\n"
        f"          <strip size='31'>\n"
        f"            <card type='columns' />\n"
        f"          </strip>\n"
        f"          <strip size='31'>\n"
        f"            <card type='rows' />\n"
        f"          </strip>\n"
        f"        </edge>\n"
        f"      </cards>\n"
        f"      <viewpoint>\n"
        f"        <zoom type='entire-view' />\n"
        f"      </viewpoint>\n"
        f"      <simple-id uuid='{_next_uuid()}' />\n"
        f"    </window>"
        for s in sheet_names
    )
    dash_windows = "\n".join(
        dashboard_window(n, sheet_names) for n in dash_names
    )

    return (
        _WB_HEADER
        + "  "
        + ds_block.strip()
        + "\n"
        + "  <worksheets>\n"
        + sheets_body
        + "\n  </worksheets>\n"
        + "  <dashboards>\n"
        + "\n".join(dash_bodies)
        + "\n  </dashboards>\n"
        + "  <windows source-height='30'>\n"
        + ws_windows
        + "\n"
        + dash_windows
        + "\n  </windows>\n"
        + "</workbook>\n"
    )


# ---------------------------------------------------------------------------
# Self-check
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Quick smoke test.
    print(f"DS_NAME = {DS_NAME}")
    print(f"Registered calcs: {len(_CALCS)}")
    for (cid, cap, *_rest) in _CALCS:
        print(f"  {calc_name(cid):32s}  {cap}")
    ds = load_ds_block()
    print(f"Injected datasources block: {len(ds)} chars")
    # Ensure every injected calc name appears in the datasource block.
    missing = [calc_name(c[0]) for c in _CALCS if calc_name(c[0]) not in ds]
    print(f"Missing after injection: {missing}")
