# Ring gauge + Bullet chart — Tableau technique (from user's Superstore refs)

Studied 3 user-provided Superstore workbooks + the user's own Ring/Bullet seed.

## Ring / donut % gauge (the WOW element)
Single Pie renders as a solid DOT (no hole). The correct donut is a **dual-pie**:
- Rows = `(zeroMeasure + zeroMeasure)` → dual axis → two Pie panes at same spot.
- Pane 0: big Pie, wedge-size = [Multiple Values], color = [:Measure Names]
  (Đạt arc = brand/green, Còn lại arc = light grey). `mark size ~1.2`.
- Pane 1 (`y-index='1'`): smaller Pie, `mark-color='#FFFFFF'`, `size ~0.62` →
  punches the hole. `mark-sizing marks-scaling-off` on both.
- Measure-Names filter keeps only Đạt + Còn lại; a `dummy` string dim on cols;
  hide axis (`display=false` both classes) + `tick-color=#00000000`.
- Center % shown via worksheet title (big colored run).
Calcs: Pct = SUM(actual)/SUM(plan); Đạt = MIN(Pct,1); Còn lại = 1-Đạt;
       Zero = 0 (measure); Gauge dummy = "dummy" (string dim).
Implemented in mey_lib.ring_card().

## Bullet (actual vs KHNS ghost + KPI)
- TRUE dual-axis: rows = `planMeasure actualMeasure` (two pills), synchronized
  via <join-axes><axis-mapping>. Pane 0 (plan) = wide grey ghost bar
  (mark-bar-size 0.86); Pane 1 (actual) = thin brand-blue in front (0.44).
- Superstore "Segment" adds pointer/target arcs; for KHNS/KPI we keep it simple:
  ghost = KHNS, front bar = Thực hiện. KPI as gold reference line is NOT reliably
  hand-authorable (type='r<' parse issue) — prefer a thin marker or omit.
Implemented in mey_lib.bullet_chart().

## Rounded corners (premium cards)
Manifest needs `<_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners />`
and each card zone-style adds
`<_.fcp.DashboardRoundedCorners.true...format attr='corner-radius' value='14' />`.
Verified rendering on Cloud (test-rb render 2026-07-04).

## Fixed dashboard size (KPI clip root cause)
Superstore uses `<size sizing-mode='fixed' maxheight=.. minheight=.. />`. Same
fix applied in mey_lib.dashboard(). Never 'automatic' with hero numbers.
