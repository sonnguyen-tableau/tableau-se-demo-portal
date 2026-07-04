# D1 Tài Chính — the FINAL format template (apply to D2–D5)

Live workbook: "Mey Group - Tai Chinh". This is the design + format standard.

## Layout (user-formatted, learned from their Desktop work)
- Fixed size 1560×1100, rounded cards (corner-radius 14, margin 9, padding 10).
- KPI strip: 4 BAN cards. 3 of them (Sản lượng/Doanh số/Tiền thu) pair the big
  number with a % RING GAUGE beside it (type-h='cell' zone). Công nợ = number
  only (no target).
- Bullet legends sit at the BOTTOM of each bullet card, aligned to the chart
  (the user moved them there — do the same, don't leave floating legend zones).

## UNIFIED color palette (one set across ALL charts — no rainbow)
Bullet 3-layer TH/KHNS/KPI, everywhere:
- Thực hiện  = #1b75bc (Mey blue)
- Kế hoạch (KHNS) = #9fb3c8 (muted grey-blue)
- KPI         = #c29b54 (champagne gold)
Ranking bars + công nợ = Mey Sequential Blue. Ring gauge = #1f8a70 (đạt) + #e7edf3 (còn lại).

## HOW colors are stored (critical for editing)
Colors for [:Measure Names] live in ONE datasource-level
`<encoding attr='color' field='[:Measure Names]' type='palette'>` block with
`<map to='#hex'><bucket>&quot;[ds].[sum:Measure:qk]&quot;</bucket></map>` per
measure. To recolor: rewrite the `to='#hex'` for each measure's bucket. Do NOT
add a second color encoding inside the worksheet <style> — Cloud ignores it and
the datasource-level map wins. (See scripts/meygroup/recolor script pattern.)

## Ring gauge = measure vs KPI stretch (not KHNS)
%HT = Thực hiện / KPI (not /KHNS) so actual≥plan still shows a partial arc.
Sản lượng 90%, Doanh số 89%, Tiền thu 87% vs KPI.

## Legends/axis captions (clean, Vietnamese)
Rename measure captions: RevenueVnd/CashCollectedVnd/UnitsSold(MF)→'Thực hiện';
*PlanVnd/UnitsSoldPlan→'Kế hoạch (KHNS)'; *KpiVnd/UnitsSoldKpi→'KPI';
DealValueVnd→'Doanh số (tỷ)'; AmountDueVnd→'Công nợ (tỷ)'.
