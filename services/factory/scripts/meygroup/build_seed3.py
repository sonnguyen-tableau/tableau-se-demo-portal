"""Build _seed_desktop3 = seed2 (finished D1) + all the ring/gauge/KPI-compare
worksheets Claude couldn't perfect in the dashboard, for the user to finish on
Desktop. References the ring calc IDs ALREADY baked into seed2's datasource."""
import re, uuid

DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
data = open('/tmp/mey_seed2.twb', encoding='utf-8').read()

def U(): return "{" + str(uuid.uuid4()).upper() + "}"

# ── Ring gauge worksheet (dual-pie donut, cloned from the WORKING Donut Seed) ──
# Uses existing calcs: Đạt (arc), Còn lại (grey), min0 (axis), Gauge dummy (row).
MIN0 = "Calculation_00900119000000"
DUMMY = "Calculation_00900119000001"
RINGS = [
    ("Ring Sản lượng", "Calculation_009001100000012", "Calculation_009001100000013", "#1F8A70"),
    ("Ring Doanh số",  "Calculation_009001100000022", "Calculation_009001100000023", "#1B75BC"),
    ("Ring Tiền thu",  "Calculation_009001100000032", "Calculation_009001100000033", "#B7823A"),
]

def ring_ws(name, dat_id, rem_id, color):
    dat = f"[{DS}].[usr:{dat_id}:qk]"
    rem = f"[{DS}].[usr:{rem_id}:qk]"
    zero = f"[{DS}].[usr:{MIN0}:qk]"
    dummy = f"[{DS}].[none:{DUMMY}:nk]"
    mn = f"[{DS}].[:Measure Names]"
    mv = f"[{DS}].[Multiple Values]"
    # dep columns (reference existing calc defs by name only; already in datasource)
    def depcol(cid):
        return f"            <column datatype='real' name='[{cid}]' role='measure' type='quantitative' />"
    def usrinst(cid):
        return f"            <column-instance column='[{cid}]' derivation='User' name='[usr:{cid}:qk]' pivot='key' type='quantitative' />"
    deps = "\n".join([
        depcol(dat_id), depcol(rem_id),
        f"            <column datatype='integer' name='[{MIN0}]' role='measure' type='quantitative' />",
        f"            <column datatype='string' name='[{DUMMY}]' role='dimension' type='nominal' />",
        usrinst(dat_id), usrinst(rem_id), usrinst(MIN0),
        f"            <column-instance column='[{DUMMY}]' derivation='None' name='[none:{DUMMY}:nk]' pivot='key' type='nominal' />",
    ])
    return f"""    <worksheet name='{name}'>
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
            <dictionary><bucket>&quot;{dat}&quot;</bucket><bucket>&quot;{rem}&quot;</bucket></dictionary>
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
          <style-rule element='label'><format attr='display' field='{dummy}' value='false' /></style-rule>
          <style-rule element='table'><format attr='background-color' value='#00000000' /></style-rule>
          <style-rule element='worksheet'><format attr='display-field-labels' scope='rows' value='false' /></style-rule>
          <style-rule element='gridline'><format attr='line-visibility' scope='cols' value='off' /><format attr='line-visibility' scope='rows' value='off' /></style-rule>
          <style-rule element='zeroline'><format attr='line-visibility' value='off' /></style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view><mark class='Pie' />
          </pane>
          <pane id='1' selection-relaxation-option='selection-relaxation-allow' x-axis-name='{zero}' x-index='1'>
            <view><breakdown value='auto' /></view><mark class='Pie' />
            <style><style-rule element='mark'><format attr='size' value='0.60' /><format attr='mark-labels-show' value='false' /><format attr='mark-color' value='#FFFFFF' /></style-rule></style>
          </pane>
          <pane id='2' selection-relaxation-option='selection-relaxation-allow' x-axis-name='{zero}'>
            <view><breakdown value='auto' /></view><mark class='Pie' />
            <encodings>
              <color column='{mn}' palette='ring_gauge' type='palette' />
              <size column='{mv}' />
            </encodings>
            <style><style-rule element='mark'><format attr='size' value='1.0' /></style-rule></style>
          </pane>
        </panes>
        <rows>{dummy}</rows>
        <cols>({zero} + {zero})</cols>
        <tooltip-style tooltip-mode='none' />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


# ── KPI card WITH %HT line variant (2-run label) for the user to test/adjust ──
KPI_PCT = [
    ("KPI Sản lượng (pct)", "Calculation_0090010000000004", "Sản lượng (căn)", "▲ 102% so KHNS", "#1F8A70", 'n#,##0'),
    ("KPI Doanh số (pct)",  "Calculation_0090010000000001", "Doanh số",        "▲ 101% so KHNS", "#1F8A70", 'n#,##0,,,&quot;tỷ&quot;'),
    ("KPI Tiền thu (pct)",  "Calculation_0090010000000002", "Tiền thu",        "98% so KHNS",    "#B7823A", 'n#,##0,,,&quot;tỷ&quot;'),
]
def kpi_pct_ws(name, cid, label, pct, color, fmt):
    field = f"[{DS}].[usr:{cid}:qk]"
    return f"""    <worksheet name='{name}'>
      <layout-options>
        <title><formatted-text><run bold='true' fontcolor='#5a6b7b' fontsize='9'>{label.upper()}</run></formatted-text></title>
      </layout-options>
      <table>
        <view>
          <datasources><datasource caption='meygroup' name='{DS}' /></datasources>
          <datasource-dependencies datasource='{DS}'>
            <column caption='{label}' datatype='integer' default-format='{fmt}' name='[{cid}]' role='measure' type='quantitative'><calculation class='tableau' formula='SUM([DealValueVnd])' /></column>
            <column-instance column='[{cid}]' derivation='User' name='[usr:{cid}:qk]' pivot='key' type='quantitative' />
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
                <run fontalignment='1'>&#10;</run>
                <run fontalignment='1' fontsize='10' bold='true' fontcolor='{color}'>{pct}</run>
              </formatted-text>
            </customized-label>
            <style><style-rule element='mark'><format attr='mark-labels-show' value='true' /><format attr='mark-labels-cull' value='true' /></style-rule></style>
          </pane>
        </panes>
        <rows /><cols />
      </table>
      <simple-id uuid='{U()}' />
    </worksheet>"""


new_ws = []
for nm, dat, rem, color in RINGS:
    new_ws.append(ring_ws(nm, dat, rem, color))
for nm, cid, label, pct, color, fmt in KPI_PCT:
    new_ws.append(kpi_pct_ws(nm, cid, label, pct, color, fmt))
new_ws_xml = "\n".join(new_ws)
new_names = [r[0] for r in RINGS] + [k[0] for k in KPI_PCT]

# Ensure ring_gauge palette exists in <preferences>
if "name='ring_gauge'" not in data:
    pal = ("    <color-palette name='ring_gauge' type='regular'>\n      <color>#1F8A70</color>\n      <color>#E7EDF3</color>\n    </color-palette>\n")
    data = data.replace("</preferences>", pal + "  </preferences>")

# Inject worksheets before </worksheets>
idx = data.find("</worksheets>")
data = data[:idx] + new_ws_xml + "\n  " + data[idx:]

# Register hidden windows for the new worksheets (before the first <window class='worksheet'>)
win_block = "".join(
    f"    <window class='worksheet' hidden='true' name='{n}'>\n      <cards><edge name='left'><strip size='160'></strip></edge></cards>\n      <viewpoint><zoom type='entire-view' /></viewpoint>\n      <simple-id uuid='{U()}' />\n    </window>\n"
    for n in new_names)
first_ws_win = re.search(r"<window class='worksheet'", data)
data = data[:first_ws_win.start()] + win_block + data[first_ws_win.start():]

open('/tmp/mey_seed3.twb','w',encoding='utf-8').write(data)
import xml.etree.ElementTree as ET
try:
    ET.fromstring(data); print("XML OK")
except Exception as e:
    print("XML ERR:", e)
print("added worksheets:", new_names)
print("size:", len(data))
