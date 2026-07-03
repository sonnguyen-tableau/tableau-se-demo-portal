"""Rebuild 'Bản đồ Dư nợ theo Tỉnh' using the CORRECT pattern from Sheet 7:
Country + City (Branches) as geo dimensions with semantic-role → Tableau
auto-generates [Latitude (generated)] / [Longitude (generated)], one dot per
city. Replaces the broken raw-AVG(Latitude/Longitude) approach entirely.
"""
import re
from pathlib import Path

DS = "sqlproxy.16pw9xy0dpv77l1dq1hq4151h2ot"
P = Path("/tmp/wb-nam-a-portfolio-v2.twb")
content = P.read_text(encoding="utf-8")

# The correct worksheet <table> body, modeled exactly on _seed_desktop Sheet 7
# but using OutstandingBalance (dư nợ) as the size measure and titled for Tỉnh.
new_table = f"""      <table>
        <view>
          <datasources>
            <datasource caption='nam-a-bank' name='{DS}' />
          </datasources>
          <mapsources>
            <mapsource name='Tableau' />
          </mapsources>
          <datasource-dependencies datasource='{DS}'>
            <column aggregation='Sum' datatype='real' default-type='quantitative' layered='true' name='[OutstandingBalance]' pivot='key' role='measure' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Count' datatype='string' default-type='nominal' layered='true' name='[City (Branches)]' pivot='key' role='dimension' semantic-role='[City].[Name]' type='nominal' user-datatype='string' visual-totals='Default' />
            <column aggregation='Count' datatype='string' default-type='nominal' layered='true' name='[Country]' pivot='key' role='dimension' semantic-role='[Country].[ISO3166_2]' type='nominal' user-datatype='string' visual-totals='Default' />
            <column-instance column='[City (Branches)]' derivation='None' name='[none:City (Branches):nk]' pivot='key' type='nominal' />
            <column-instance column='[Country]' derivation='None' name='[none:Country:nk]' pivot='key' type='nominal' />
            <column-instance column='[OutstandingBalance]' derivation='Sum' name='[sum:OutstandingBalance:qk]' pivot='key' type='quantitative' />
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style>
          <style-rule element='map'>
            <format attr='washout' value='0.0' />
          </style-rule>
        </style>
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view>
              <breakdown value='auto' />
            </view>
            <mark class='Automatic' />
            <encodings>
              <size column='[{DS}].[sum:OutstandingBalance:qk]' />
              <lod column='[{DS}].[none:Country:nk]' />
              <lod column='[{DS}].[none:City (Branches):nk]' />
            </encodings>
          </pane>
        </panes>
        <rows>[{DS}].[Latitude (generated)]</rows>
        <cols>[{DS}].[Longitude (generated)]</cols>
      </table>"""

# Replace the <table>...</table> inside the map worksheet only.
pat = re.compile(
    r"(<worksheet name='Bản đồ Dư nợ theo Tỉnh'>\s*)<table>.*?</table>",
    re.DOTALL,
)
new_content, n = pat.subn(lambda m: m.group(1) + new_table, content, count=1)
if n == 0:
    # The worksheet may have layout-options before <table>; try a looser match
    pat2 = re.compile(
        r"(<worksheet name='Bản đồ Dư nợ theo Tỉnh'>)(.*?)<table>.*?</table>",
        re.DOTALL,
    )
    new_content, n = pat2.subn(lambda m: m.group(1) + m.group(2) + new_table, content, count=1)

print(f"Replaced map table: {n} match(es)")
P.write_text(new_content, encoding="utf-8")

import xml.etree.ElementTree as ET
try:
    ET.fromstring(new_content); print("XML valid ✓")
except ET.ParseError as e:
    print(f"XML PARSE ERR: {e}")
