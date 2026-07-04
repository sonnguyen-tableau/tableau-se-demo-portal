import re
data = open('/tmp/mey_d1_fmt.twb', encoding='utf-8').read()
DS = "sqlproxy.052gxnr1oq3gkv13grj2s0u1xyqj"
orig = data
TH, KHNS, KPI = "#1b75bc", "#9fb3c8", "#c29b54"
# measure -> target color
color_of = {
  f"[{DS}].[sum:UnitsSold (MonthlyFinancial):qk]": TH,
  f"[{DS}].[sum:RevenueVnd:qk]": TH,
  f"[{DS}].[sum:CashCollectedVnd:qk]": TH,
  f"[{DS}].[sum:UnitsSoldPlan:qk]": KHNS,
  f"[{DS}].[sum:RevenuePlanVnd:qk]": KHNS,
  f"[{DS}].[sum:CashCollectedPlanVnd:qk]": KHNS,
  f"[{DS}].[sum:UnitsSoldKpi:qk]": KPI,
  f"[{DS}].[sum:RevenueKpiVnd:qk]": KPI,
}
n=0
for measure, color in color_of.items():
    mesc = measure.replace('&','&amp;')  # buckets are &quot;-wrapped; measure text raw
    # pattern: <map to='#xxxxxx'>\s*<bucket>&quot;MEASURE&quot;</bucket>\s*</map>
    pat = re.compile(r"<map to='#[0-9a-fA-F]{6}'>\s*<bucket>&quot;" + re.escape(measure) + r"&quot;</bucket>\s*</map>")
    new = f"<map to='{color}'>\n              <bucket>&quot;{measure}&quot;</bucket>\n            </map>"
    data, cnt = pat.subn(new, data)
    n += cnt
    print(f"  {measure.split(':')[-2] if ':' in measure else measure}: {cnt} -> {color}")
print("total maps rewritten:", n, "changed:", data != orig)
open('/tmp/mey_d1_recolor.twb','w',encoding='utf-8').write(data)
import xml.etree.ElementTree as ET
ET.fromstring(data); print("XML OK")
