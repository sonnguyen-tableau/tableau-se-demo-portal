"""Nam A Bank KPI v2 clone library.

Reproduces the user's Desktop-authored 'KPI Tong du no v2' pattern:
- 4 windowed calc fields per metric (current 12mo, prior 12-24mo, delta $, delta %)
- 2 shared arrow calcs (▲ green / ▼ red)
- KPI card worksheet: big value (28pt navy) + arrow + delta $ + delta % + "vs LY"
- optional sparkline worksheet: Line mark over MONTH(date), hidden axes, trendline

Clones across all metrics that have a natural date field for the 12mo window.
Ratio KPIs (NPL%, CASA%, LDR%) use a plain snapshot value with no window/sparkline.
"""

from __future__ import annotations
import re
import uuid
from pathlib import Path

DS = "sqlproxy.16pw9xy0dpv77l1dq1hq4151h2ot"
SEED_BLOCK = Path("/tmp/nam-a-seed-block-v2.xml")

# Shared arrow calc IDs (reuse the user's — they already exist on datasource)
ARROW_UP = "Calculation_0013900176605199"       # ▲ green, fires when delta > 0
ARROW_DOWN = "▲Arrow (copy)_0013900204544016"    # ▼ red, fires when delta <= 0
# But arrows reference a specific delta calc. The user's arrows point at
# Calculation_0013900176449549 (Total Loans delta). For per-KPI arrows we must
# generate NEW arrow calcs bound to each KPI's own delta. See _arrow_calcs().

_ZID = [5000]
def _zid() -> int:
    _ZID[0] += 1
    return _ZID[0]

def U() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


def _esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
             .replace('"', '&quot;'))


# ─── KPI metric definitions ─────────────────────────────────────────────────
# Each entry defines one KPI card. `windowed=True` means build 12mo current +
# prior + delta calcs + sparkline. `windowed=False` = plain snapshot (ratios).
#
# base_id: 8-digit numeric namespace for this KPI's calc family
# value_formula: the CURRENT-period aggregation (already double-quoted strings)
# prior_formula: the PRIOR-period aggregation (None if not windowed)
# date_field: qualified date field name for sparkline (None if not windowed)
# spark_measure: raw measure expr for sparkline rows (None if no sparkline)

class KPI:
    def __init__(self, key, title, base_id, value_formula, fmt,
                 windowed=True, prior_formula=None, date_field=None,
                 spark_measure=None, spark_agg="Sum"):
        self.key = key
        self.title = title
        self.base = base_id
        self.value_formula = value_formula
        self.fmt = fmt
        self.windowed = windowed
        self.prior_formula = prior_formula
        self.date_field = date_field
        self.spark_measure = spark_measure
        self.spark_agg = spark_agg

    def cid(self, suffix):
        return f"Calculation_00{self.base}{suffix:02d}"

    @property
    def value_id(self): return self.cid(1)
    @property
    def prior_id(self): return self.cid(2)
    @property
    def delta_id(self): return self.cid(3)
    @property
    def pct_id(self): return self.cid(4)
    @property
    def arrow_up_id(self): return self.cid(5)
    @property
    def arrow_dn_id(self): return self.cid(6)


def build_calc_columns(kpi: KPI) -> str:
    """Full <column> defs (with <calculation>) for this KPI, to inject into
    the datasources block."""
    cols = []
    # Value (current)
    cols.append(
        f"      <column caption='{_esc(kpi.title)} — Kỳ này' datatype='real' "
        f"default-format='{_esc(kpi.fmt)}' name='[{kpi.value_id}]' role='measure' type='quantitative'>\n"
        f"        <calculation class='tableau' formula='{_esc(kpi.value_formula)}' />\n"
        f"      </column>"
    )
    if kpi.windowed:
        # Prior
        cols.append(
            f"      <column caption='{_esc(kpi.title)} — Kỳ trước' datatype='real' "
            f"name='[{kpi.prior_id}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='{_esc(kpi.prior_formula)}' />\n"
            f"      </column>"
        )
        # Delta $
        cols.append(
            f"      <column caption='{_esc(kpi.title)} — Δ' datatype='real' "
            f"default-format='{_esc(kpi.fmt)}' name='[{kpi.delta_id}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='[{kpi.value_id}] - [{kpi.prior_id}]' />\n"
            f"      </column>"
        )
        # Delta %
        cols.append(
            f"      <column caption='{_esc(kpi.title)} — Δ%' datatype='real' "
            f"default-format='p0.0%' name='[{kpi.pct_id}]' role='measure' type='quantitative'>\n"
            f"        <calculation class='tableau' formula='([{kpi.value_id}] - [{kpi.prior_id}]) / [{kpi.prior_id}]' />\n"
            f"      </column>"
        )
        # Arrow up (green)
        cols.append(
            f"      <column caption='{_esc(kpi.title)} ▲' datatype='string' "
            f"name='[{kpi.arrow_up_id}]' role='measure' type='nominal'>\n"
            f"        <calculation class='tableau' formula='IF [{kpi.delta_id}] &gt; 0 THEN &quot;▲&quot; END' />\n"
            f"      </column>"
        )
        # Arrow down (red)
        cols.append(
            f"      <column caption='{_esc(kpi.title)} ▼' datatype='string' "
            f"name='[{kpi.arrow_dn_id}]' role='measure' type='nominal'>\n"
            f"        <calculation class='tableau' formula='IF [{kpi.delta_id}] &lt;= 0 THEN &quot;▼&quot; END' />\n"
            f"      </column>"
        )
    return "\n".join(cols)


def build_kpi_card(kpi: KPI) -> str:
    """KPI card worksheet with value + delta line (arrow color-coded)."""
    ds = DS
    v = f"[{ds}].[usr:{kpi.value_id}:qk]"
    if kpi.windowed:
        up = f"[{ds}].[usr:{kpi.arrow_up_id}:nk]"
        dn = f"[{ds}].[usr:{kpi.arrow_dn_id}:nk]"
        delta = f"[{ds}].[usr:{kpi.delta_id}:qk]"
        pct = f"[{ds}].[usr:{kpi.pct_id}:qk]"
        deps = f"""            <column caption='{_esc(kpi.title)} — Kỳ này' datatype='real' default-format='{_esc(kpi.fmt)}' name='[{kpi.value_id}]' role='measure' type='quantitative' />
            <column caption='{_esc(kpi.title)} — Δ' datatype='real' default-format='{_esc(kpi.fmt)}' name='[{kpi.delta_id}]' role='measure' type='quantitative' />
            <column caption='{_esc(kpi.title)} — Δ%' datatype='real' default-format='p0.0%' name='[{kpi.pct_id}]' role='measure' type='quantitative' />
            <column caption='{_esc(kpi.title)} ▲' datatype='string' name='[{kpi.arrow_up_id}]' role='measure' type='nominal' />
            <column caption='{_esc(kpi.title)} ▼' datatype='string' name='[{kpi.arrow_dn_id}]' role='measure' type='nominal' />
            <column-instance column='[{kpi.value_id}]' derivation='User' name='[usr:{kpi.value_id}:qk]' pivot='key' type='quantitative' />
            <column-instance column='[{kpi.delta_id}]' derivation='User' name='[usr:{kpi.delta_id}:qk]' pivot='key' type='quantitative' />
            <column-instance column='[{kpi.pct_id}]' derivation='User' name='[usr:{kpi.pct_id}:qk]' pivot='key' type='quantitative' />
            <column-instance column='[{kpi.arrow_up_id}]' derivation='User' name='[usr:{kpi.arrow_up_id}:nk]' pivot='key' type='nominal' />
            <column-instance column='[{kpi.arrow_dn_id}]' derivation='User' name='[usr:{kpi.arrow_dn_id}:nk]' pivot='key' type='nominal' />"""
        encodings = f"""              <text column='{v}' />
              <text column='{up}' />
              <text column='{dn}' />
              <text column='{delta}' />
              <text column='{pct}' />"""
        label = f"""            <customized-label>
              <formatted-text>
                <run bold='true' fontalignment='1' fontsize='26' fontcolor='#31435C'><![CDATA[<{v}>]]></run>
                <run fontalignment='1'>&#10;</run>
                <run fontalignment='1' fontcolor='#059669' fontsize='13'><![CDATA[<{up}>]]></run>
                <run fontalignment='1' fontcolor='#b7302b' fontsize='13'><![CDATA[<{dn}>]]></run>
                <run fontalignment='1' fontsize='13'> </run>
                <run fontalignment='1' fontsize='13'><![CDATA[<{delta}>]]></run>
                <run fontalignment='1' fontsize='13'>  (</run>
                <run fontalignment='1' fontsize='13'><![CDATA[<{pct}>]]></run>
                <run fontalignment='1' fontsize='13'>) vs LY</run>
              </formatted-text>
            </customized-label>"""
    else:
        # Snapshot ratio — value only, no delta
        deps = f"""            <column caption='{_esc(kpi.title)}' datatype='real' default-format='{_esc(kpi.fmt)}' name='[{kpi.value_id}]' role='measure' type='quantitative' />
            <column-instance column='[{kpi.value_id}]' derivation='User' name='[usr:{kpi.value_id}:qk]' pivot='key' type='quantitative' />"""
        encodings = f"""              <text column='{v}' />"""
        label = f"""            <customized-label>
              <formatted-text>
                <run bold='true' fontalignment='1' fontsize='26' fontcolor='#31435C'><![CDATA[<{v}>]]></run>
              </formatted-text>
            </customized-label>"""

    return f"""    <worksheet name='{_esc(kpi.key)}'>
      <layout-options>
        <title>
          <formatted-text><run fontname='Tableau Book' fontsize='10' fontcolor='#6B7280'>{_esc(kpi.title)}</run></formatted-text>
        </title>
      </layout-options>
      <table>
        <view>
          <datasources>
            <datasource caption='nam-a-bank' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
{deps}
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style />
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Automatic' />
            <encodings>
{encodings}
            </encodings>
{label}
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
      <simple-id uuid='{U()}' />
    </worksheet>"""


def build_sparkline(kpi: KPI) -> str:
    """Sparkline worksheet: Line over MONTH(date), hidden axes, trendline."""
    if not kpi.windowed or not kpi.date_field or not kpi.spark_measure:
        return ""
    ds = DS
    date_f = kpi.date_field
    meas = kpi.spark_measure
    agg = kpi.spark_agg
    agg_short = agg.lower()[:3]
    meas_inst = f"[{ds}].[{agg_short}:{meas}:qk]"
    date_inst = f"[{ds}].[tmn:{date_f}:qk]"
    return f"""    <worksheet name='{_esc(kpi.key)} Spark'>
      <table>
        <view>
          <datasources>
            <datasource caption='nam-a-bank' name='{ds}' />
          </datasources>
          <datasource-dependencies datasource='{ds}'>
            <column aggregation='Year' caption='{date_f}' datatype='datetime' default-type='ordinal' layered='true' name='[{date_f}]' pivot='key' role='dimension' type='ordinal' user-datatype='datetime' visual-totals='Default' />
            <column aggregation='Sum' datatype='real' default-type='quantitative' layered='true' name='[{meas}]' pivot='key' role='measure' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column-instance column='[{meas}]' derivation='{agg}' name='[{agg_short}:{meas}:qk]' pivot='key' type='quantitative' />
            <column-instance column='[{date_f}]' derivation='Month-Trunc' name='[tmn:{date_f}:qk]' pivot='key' type='quantitative' />
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='axis'>
            <format attr='display' class='0' field='{meas_inst}' scope='rows' value='false' />
            <format attr='display' class='0' field='{date_inst}' scope='cols' value='false' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Line' />
            <style>
              <style-rule element='mark'>
                <format attr='color' value='#0072BC' />
              </style-rule>
            </style>
          </pane>
        </panes>
        <rows>{meas_inst}</rows>
        <cols>{date_inst}</cols>
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


def load_seed_block_with_calcs(kpis: list[KPI]) -> str:
    """Load the seed datasources block and inject all KPI calc columns."""
    block = SEED_BLOCK.read_text(encoding='utf-8')
    calc_xml = "\n".join(build_calc_columns(k) for k in kpis)
    # Insert before the closing </datasource> (the inner one, before </datasources>)
    # The seed block ends with ...</datasource>\n  </datasources>. Inject before
    # the last </datasource>.
    idx = block.rfind("</datasource>")
    return block[:idx] + calc_xml + "\n    " + block[idx:]
