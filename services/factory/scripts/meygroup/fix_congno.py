import re
data = open('/tmp/mey_d1_now.twb', encoding='utf-8').read()
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
orig = data

# New aggregate calc: Công nợ còn phải thu (tỷ) = (SUM(Due) - SUM(Collected))/1e9
NEW_ID = "Calculation_0090030000000001"
new_col = (f"      <column caption='Công nợ còn phải thu (tỷ)' datatype='real' "
           f"default-format='n#,##0' name='[{NEW_ID}]' role='measure' type='quantitative'>\n"
           f"        <calculation class='tableau' formula='(SUM([AmountDueVnd]) - SUM([AmountCollectedVnd])) / 1000000000' />\n"
           f"      </column>")
# Inject into datasource before the LAST </datasource> (structural, not CDATA)
idx = data.rfind("</datasource>")
data = data[:idx] + new_col + "\n    " + data[idx:]

# For each công-nợ worksheet: swap the cols measure to the new usr: instance,
# add dep column + column-instance, keep everything else (labels/format/rows).
OLD_REF = f"[{DS}].[sum:Calculation_0013763540656152:qk]"
NEW_REF = f"[{DS}].[usr:{NEW_ID}:qk]"
dep_col = (f"            <column caption='Công nợ còn phải thu (tỷ)' datatype='real' "
           f"default-format='n#,##0' name='[{NEW_ID}]' role='measure' type='quantitative' />")
inst = (f"            <column-instance column='[{NEW_ID}]' derivation='User' "
        f"name='[usr:{NEW_ID}:qk]' pivot='key' type='quantitative' />")

for sheet in ['CongNoDuAn','CongNoTuoi']:
    m = re.search(rf"(<worksheet name='{sheet}'>.*?</worksheet>)", data, re.S)
    block = m.group(1); nb = block
    # 1) swap axis reference everywhere in the sheet (cols + any label/text/style field=)
    nb = nb.replace(OLD_REF, NEW_REF)
    # 2) inject dep column + instance into the datasource-dependencies of the sheet
    #    (add right after the opening <datasource-dependencies ...> tag)
    dd = re.search(r"(<datasource-dependencies datasource='" + re.escape(DS) + r"'>)", nb)
    nb = nb.replace(dd.group(1), dd.group(1) + "\n" + dep_col + "\n" + inst, 1)
    data = data.replace(block, nb)
    print(f"  {sheet}: swapped -> {NEW_REF}")

print("changed:", data != orig)
open('/tmp/mey_d1_congno.twb','w',encoding='utf-8').write(data)
import xml.etree.ElementTree as ET
ET.fromstring(data); print("XML OK")
