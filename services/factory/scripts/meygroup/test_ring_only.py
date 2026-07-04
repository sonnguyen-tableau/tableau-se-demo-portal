import sys
sys.path.insert(0, '/tmp')
import mey_lib as M
from mey_lib import Calc
from pathlib import Path
M.reset_zids()
pct = Calc("0091000000000001","Pct HT","real","measure","quantitative","SUM([UnitsSold]) / SUM([UnitsSoldPlan])","p0.0%")
dat = Calc("0091000000000002","Đạt","real","measure","quantitative","MIN([Calculation_0091000000000001],1)")
rem = Calc("0091000000000003","Còn lại","real","measure","quantitative","1 - [Calculation_0091000000000002]")
zero = Calc("0091000000000004","min0","integer","measure","quantitative","MIN(0)")
dummy = Calc("0091000000000005","Gauge dummy","string","dimension","nominal",'"dummy"')
ring = M.ring_card("Ring SanLuong", pct, dat, rem, zero, dummy, "102%")
dash = M.dashboard("Ring Only", [M.hrow(["Ring SanLuong"], 100000, minw=120)], width=600, height=500)
xml = M.workbook([pct,dat,rem,zero,dummy], [ring], ["Ring SanLuong"], dash, "Ring Only")
Path("/tmp/wb-ring-only.twb").write_text(xml, encoding="utf-8"); print("ring-only:", M.validate(xml))

M.reset_zids()
bullet = M.bullet_chart("Bullet DoanhSo","Doanh số theo Tháng","Month","RevenueVnd","RevenuePlanVnd","RevenueKpiVnd")
dash2 = M.dashboard("Bullet Only", [M.hrow(["Bullet DoanhSo"], 100000, minw=120)], width=800, height=500)
xml2 = M.workbook([], [bullet], ["Bullet DoanhSo"], dash2, "Bullet Only")
Path("/tmp/wb-bullet-only.twb").write_text(xml2, encoding="utf-8"); print("bullet-only:", M.validate(xml2))
