import sys
sys.path.insert(0, '/tmp')
import mey_lib as M
from mey_lib import Calc
from pathlib import Path
M.reset_zids()

# Ring calcs (clone user's Ring Seed formulas; %HT sản lượng vs KHNS/plan)
pct = Calc("0091000000000001","Pct HT Sản lượng","real","measure","quantitative",
           "SUM([UnitsSold]) / SUM([UnitsSoldPlan])","p0.0%")
dat = Calc("0091000000000002","Đạt","real","measure","quantitative",
           "MIN([Calculation_0091000000000001],1)")
rem = Calc("0091000000000003","Còn lại","real","measure","quantitative",
           "1 - [Calculation_0091000000000002]")
zero = Calc("0091000000000004","Zero","integer","measure","quantitative","0")
dummy = Calc("0091000000000005","Gauge dummy","string","dimension","nominal",'"dummy"')
calcs = [pct, dat, rem, zero, dummy]

ring = M.ring_card("Ring SanLuong", pct, dat, rem, zero, dummy, "102%", ring_color="#1F8A70")
bullet = M.bullet_chart("Bullet DoanhSo", "Doanh số theo Tháng vs KHNS & KPI",
                        "Month", "RevenueVnd", "RevenuePlanVnd", "RevenueKpiVnd")

sheets = [ring, bullet]
names = ["Ring SanLuong", "Bullet DoanhSo"]
dash = M.dashboard("Test RB", [
    M.hrow(["Ring SanLuong","Bullet DoanhSo"], 100000, minw=120),
], width=1200, height=600)
xml = M.workbook(calcs, sheets, names, dash, "Test RB")
Path("/tmp/wb-test-rb.twb").write_text(xml, encoding="utf-8")
print("test-rb twb:", len(xml), M.validate(xml))
