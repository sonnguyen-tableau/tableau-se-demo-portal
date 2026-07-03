"""Mey Group (Meyland / Tân Á Đại Thành) real-estate synthetic data generator.

Powers the Mey Group Executive demo for CEO/CFO/PMO — 5 dashboards:
Tài Chính · Kinh Doanh & Phễu · Dự Án & Gói Thầu · Nhân Sự · Kênh Đại Lý,
plus the Mey Pearl Ciel AI deep-dive.

Contract: emits a `MeyGroupDataset` whose column names match
`packages/factory-schema/retail-realestate.schema.json`.

Calibrated to REAL project facts (see scripts/meygroup/PROJECT_RESEARCH_SPEC.md,
grounded by an 8-agent web-research sweep 2026-07-04):
- 7 real projects with REAL total inventory (giỏ hàng): Meyhomes Capital PQ
  17,939 · Rivea Hanoi 1,168 · Meypearl Harmony PQ 1,115 · Meypearl Ciel PQ
  1,012 · Galia Hanoi 798 · Mey Retreat Bãi Lữ 350 · Meyhomes Thanh Chương 319.
- H1-2026 GROUP scale ≈ 2,485 units sold / ~23,089 tỷ signed revenue (only a
  fraction of each project's opened inventory is sold — townships open in
  phases). Meyhomes Capital PQ = largest absolute volume; Ciel = booking-heavy
  F0; Bãi Lữ = high-ticket villas (~28 tỷ); Thanh Chương = tier-2 slow.
- Per-project avg price grounded in researched price points (tỷ VND/unit).
- Every metric (sản lượng · doanh số · dòng tiền) carries THREE series to match
  the client's report template: Thực hiện (actual) · KHNS (kế hoạch ngân sách) ·
  KPI tháng (stretch). Variance renders red/yellow/green.
- 8 sàn giao dịch, 60 agents (A001–A060), 2 vùng (Bắc/Trung).

100% Vietnamese labels. Currency VND, displayed as tỷ (÷1e9).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker


# ─── Projects (7 real projects) ─────────────────────────────────────────────
# City + Province are REAL Vietnamese place names so Tableau geocodes the map.
# Inventory + H1-2026 sold volume + avg price grounded in PROJECT_RESEARCH_SPEC.md.
# (name, city, province, district, region, total_inventory, units_opened,
#  units_sold_h1, avg_price_ty, lat, lon, stage)
_PROJECTS: tuple[tuple, ...] = (
    ("Meyhomes Capital Phú Quốc",  "Phú Quốc", "Kiên Giang", "South",   "Trung", 17939, 1900, 920, 15.0, 10.2270, 103.9670, "Đang bán"),
    ("Rivea Hanoi",                "Hà Nội",   "Hà Nội",     "Central", "Bắc",    1168,  650, 400,  7.5, 21.0075, 105.8425, "Mới mở bán"),
    ("Meypearl Harmony Phú Quốc",  "Phú Quốc", "Kiên Giang", "South",   "Trung",  1115,  760, 360,  2.8, 10.2150, 103.9600, "Đang bán"),
    ("Meypearl Ciel Phú Quốc",     "Phú Quốc", "Kiên Giang", "South",   "Trung",  1012,  506,  60,  2.8, 10.2050, 103.9550, "Mới mở bán"),
    ("Galia Hanoi",                "Hà Nội",   "Hà Nội",     "North",   "Bắc",     798,  650, 470,  5.5, 21.0450, 105.7900, "Đang bán"),
    ("Mey Retreat Bãi Lữ",         "Nghi Lộc", "Nghệ An",    "East",    "Trung",   350,  210,  65, 28.0, 18.8100, 105.7600, "Đang bán"),
    ("Meyhomes Thanh Chương",      "Thanh Chương", "Nghệ An","West",    "Trung",   319,  210,  60,  4.8, 18.6800, 105.3800, "Mới mở bán"),
)

# Named accessor so downstream code isn't coupled to tuple positions.
_PROJ_KEYS = ("name", "city", "province", "district", "region",
              "total_inventory", "units_opened", "units_sold_h1",
              "avg_price_ty", "lat", "lon", "stage")

# Ciel is the AI deep-dive project — booking-heavy F0 (kickoff 25/06/2026).
_CIEL = "Meypearl Ciel Phú Quốc"


def _proj_dicts(built_only: bool = False) -> list[dict]:
    # `built_only` retained for API compatibility; all 7 are real selling
    # projects now (Ciel included, though it's booking-heavy). built_only=True
    # still returns all 7 — Ciel has real (small) deal volume.
    return [dict(zip(_PROJ_KEYS, p)) for p in _PROJECTS]

# Funnel stages — TERMINAL status ratios (from master data), scaled up to the
# group's real deal volume in _build_leads. (status, master_data_count)
_FUNNEL: tuple[tuple[str, int], ...] = (
    ("Lead", 926),
    ("NET", 599),
    ("Visit", 663),
    ("Booking", 432),
    ("Deal", 233),
    ("Lost", 154),
)
_FUNNEL_ORDER = ["Lead", "NET", "Visit", "Booking", "Deal"]  # Lost = branch

# Lead sources (5) — used as proportional weights (scale-independent).
_SOURCES: tuple[tuple[str, int], ...] = (
    ("Referral", 731), ("Event", 678), ("Walk-in", 609), ("Đại lý", 530), ("Digital", 459),
)

# Sàn giao dịch (8) — from Bãi Lữ Data_DaiLy ranking (CEN top, VLand bottom).
# (name, leads, net, visit, booking, deal, revenue_ty). These represent the 8
# active brokerages group-wide; revenue is their attributed signed value (tỷ).
_SAN: tuple[tuple[str, int, int, int, int, int, int], ...] = (
    ("Sàn CEN",      1880, 1064, 624, 336, 192, 2224),
    ("Sàn TTG",      1696, 1000, 512, 232, 104, 1524),
    ("Sàn Tân Long", 1504,  816, 448, 208,  96, 1292),
    ("Sàn FTN",      1632,  768, 496, 104,  72, 1084),
    ("Sàn Âu Lạc",   1240,  728, 360, 208, 104, 1480),
    ("Sàn Euro",      856,  504, 296, 120,  72, 1264),
    ("Sàn BTB",      1072,  712, 272,  72,  40,  616),
    ("Sàn VLand",     848,  400, 176,  96,  48,  468),
)

# Product types (6) — proportional weights (real estate unit mix).
_UNIT_TYPES: tuple[tuple[str, int], ...] = (
    ("2PN", 187), ("2PN+", 134), ("1PN+", 130), ("3PN", 87), ("Duplex", 33), ("Villa", 24),
)

# Customer segments (4) — proportional weights.
_SEGMENTS: tuple[tuple[str, int], ...] = (
    ("Nhà đầu tư", 321), ("Người sử dụng cuối", 168), ("Khách nước ngoài", 67), ("Doanh nghiệp", 39),
)

# Payment milestones (3)
_MILESTONES: tuple[tuple[str, float, int], ...] = (
    ("Đặt cọc 30%", 0.30, 0), ("Bàn giao 50%", 0.50, 180), ("Hoàn tất 20%", 0.20, 365),
)

# Aging buckets for collections
_AGING = ("Đã thu", "Chưa đến hạn", "0-30 ngày", "31-60 ngày", "61-90 ngày", "90+ ngày")

# Departments (for gói thầu accountability + HR dashboards)
_DEPARTMENTS = ("Kinh doanh", "Marketing", "Kỹ thuật", "Mua hàng", "Tài chính", "Nhân sự", "Pháp chế", "Vận hành")

# Contract package status
_PACKAGE_STATUS = ("Đúng tiến độ", "Chậm tiến độ", "Hoàn thành")

# ─── Monthly demand curve + KHNS/KPI multipliers (from PROJECT_RESEARCH_SPEC) ──
# Group units-sold split across Jan–Jun 2026 (rising toward mid-year). Each
# project's units_sold_h1 is distributed by these weights. The three metrics
# (sản lượng · doanh số · dòng tiền) each get a Thực-hiện baseline plus KHNS
# (kế hoạch ngân sách) and KPI (stretch) via monthly multipliers, so the
# template's 3-way comparison renders red/yellow/green.
# (month, units_weight, khns_units_mult, kpi_units_mult,
#         khns_rev_mult, kpi_rev_mult, khns_cash_mult, kpi_cash_mult)
_MONTHLY: tuple[tuple, ...] = (
    (1, 0.133, 1.08, 1.20, 1.10, 1.22, 1.12, 1.25),
    (2, 0.137, 1.05, 1.18, 1.06, 1.18, 1.08, 1.20),
    (3, 0.161, 0.95, 1.08, 0.96, 1.09, 1.00, 1.12),
    (4, 0.169, 0.92, 1.05, 0.94, 1.07, 0.97, 1.10),
    (5, 0.189, 1.02, 1.14, 1.03, 1.15, 1.04, 1.16),
    (6, 0.211, 0.90, 1.06, 0.92, 1.08, 0.95, 1.11),
)

# Per-project cash-collection ratio (share of signed revenue collected in H1).
# Ciel = booking-heavy F0 (tiny cash); Rivea = grace period lag; Galia +
# Meyhomes Capital PQ = mid-cycle installments flowing (green).
_CASH_RATIO = {
    "Meyhomes Capital Phú Quốc": 0.38,
    "Rivea Hanoi": 0.20,
    "Meypearl Harmony Phú Quốc": 0.30,
    "Meypearl Ciel Phú Quốc": 0.06,
    "Galia Hanoi": 0.38,
    "Mey Retreat Bãi Lữ": 0.25,
    "Meyhomes Thanh Chương": 0.20,
}

# Project-level KHNS (kế hoạch ngân sách) deal target for H1 (from spec). Actual
# vs this target drives the red/yellow/green per-project variance in the report.
_PROJ_KHNS_DEALS = {
    "Meyhomes Capital Phú Quốc": 830,   # actual 920 → GREEN (+11%)
    "Rivea Hanoi": 390,                 # actual 400 → GREEN (on plan)
    "Meypearl Harmony Phú Quốc": 420,   # actual 360 → YELLOW (−14%)
    "Meypearl Ciel Phú Quốc": 200,      # actual 60  → RED (F0, booking-heavy)
    "Galia Hanoi": 420,                 # actual 470 → GREEN (+12%, star)
    "Mey Retreat Bãi Lữ": 80,           # actual 65  → YELLOW (−19%)
    "Meyhomes Thanh Chương": 80,        # actual 60  → RED (−25%, tier-2)
}


@dataclass
class MeyGroupParameters:
    tenant_id: str
    start_date: date = date(2026, 1, 1)
    end_date: date = date(2026, 6, 30)
    seed: int = 42


@dataclass
class MeyGroupDataset:
    projects: pd.DataFrame
    leads: pd.DataFrame
    sales: pd.DataFrame
    collections: pd.DataFrame
    monthly_financial: pd.DataFrame
    plan_targets: pd.DataFrame
    agencies: pd.DataFrame
    packages: pd.DataFrame
    hr_metrics: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Projects": self.projects,
            "Leads": self.leads,
            "Sales": self.sales,
            "Collections": self.collections,
            "MonthlyFinancial": self.monthly_financial,
            "PlanTargets": self.plan_targets,
            "Agencies": self.agencies,
            "Packages": self.packages,
            "HRMetrics": self.hr_metrics,
        }


def generate_meygroup(params: MeyGroupParameters) -> MeyGroupDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker("vi_VN")
    Faker.seed(params.seed)

    projects = _build_projects(params)
    leads = _build_leads(params, rng, fake)
    sales = _build_sales(params, rng, fake, leads)
    collections = _build_collections(params, rng, sales)
    monthly_financial = _build_monthly_financial(params, rng, sales, collections)
    plan_targets = _build_plan_targets(params, monthly_financial)
    agencies = _build_agencies(params)
    packages = _build_packages(params, rng)
    hr_metrics = _build_hr_metrics(params, rng)

    return MeyGroupDataset(
        projects=projects, leads=leads, sales=sales, collections=collections,
        monthly_financial=monthly_financial, plan_targets=plan_targets,
        agencies=agencies, packages=packages, hr_metrics=hr_metrics,
    )


# ─── Table builders ─────────────────────────────────────────────────────────


def _build_projects(params: MeyGroupParameters) -> pd.DataFrame:
    rows = []
    for i, d in enumerate(_proj_dicts(), 1):
        name = d["name"]
        sold = d["units_sold_h1"]
        khns = _PROJ_KHNS_DEALS.get(name, sold)
        # TargetDeals = KHNS (kế hoạch) so project-level actual-vs-plan variance
        # is meaningful. TargetRevenueVnd = KHNS × avg price.
        rows.append({
            "ProjectId": i,
            "ProjectName": name,
            "City": d["city"],
            "Province": d["province"],
            "District": d["district"],
            "Region": d["region"],
            "Stage": d["stage"],
            "TargetDeals": khns,
            "TargetRevenueVnd": int(khns * d["avg_price_ty"] * 1e9),
            "TotalInventory": d["total_inventory"],
            "UnitsOpened": d["units_opened"],
            "UnitsSold": sold,
            "UnitsInventory": d["units_opened"] - sold,  # tồn kho (đã mở, chưa bán)
            "Latitude": d["lat"],
            "Longitude": d["lon"],
            "Country": "VN",
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


def _build_leads(params: MeyGroupParameters, rng, fake) -> pd.DataFrame:
    # Scale the master-data funnel ratios up to the group's real deal volume.
    # Master data: Deal 233 of ~3,001 leads. Group H1 deals ≈ sum of sold units
    # across the 6 non-Ciel projects (Ciel handled separately as booking-heavy).
    non_ciel = [d for d in _proj_dicts() if d["name"] != _CIEL]
    group_deals = sum(d["units_sold_h1"] for d in non_ciel)   # ≈ 2,425
    master_deal = dict(_FUNNEL)["Deal"]
    scale = group_deals / master_deal                          # ≈ 10.4×

    # Per-project deal target = its real sold count; distribute funnel per project
    # so Deal-stage leads exactly match Sales rows per project.
    status_list, project_list = [], []
    for d in non_ciel:
        pdeals = d["units_sold_h1"]
        pscale = pdeals / master_deal
        for status, cnt in _FUNNEL:
            k = max(1, round(cnt * pscale))
            status_list.extend([status] * k)
            project_list.extend([d["name"]] * k)
    n = len(status_list)

    # Source, segment, sàn as scale-independent weighted draws.
    src_names = [s[0] for s in _SOURCES]
    src_w = np.array([s[1] for s in _SOURCES], float); src_w /= src_w.sum()
    source_list = list(rng.choice(src_names, size=n, p=src_w))

    san_names = [s[0] for s in _SAN]
    san_w = np.array([s[1] for s in _SAN], float); san_w /= san_w.sum()

    # Lead dates weighted by the monthly demand curve.
    months = [m[0] for m in _MONTHLY]
    mw = np.array([m[1] for m in _MONTHLY], float); mw /= mw.sum()
    mo_draw = rng.choice(months, size=n, p=mw)
    day_draw = rng.integers(1, 28, size=n)
    day_month = [date(2026, int(mo), int(day)) for mo, day in zip(mo_draw, day_draw)]

    # Shuffle project/status pairing order for realistic interleave (keep paired).
    order = rng.permutation(n)
    status_list = [status_list[i] for i in order]
    project_list = [project_list[i] for i in order]

    rows = {
        "LeadId": np.arange(1, n + 1, dtype=np.int64),
        "LeadName": [fake.name() for _ in range(n)],
        "Status": status_list,
        "Source": source_list,
        "SanGiaoDich": [
            str(rng.choice(san_names, p=san_w)) if source_list[i] == "Đại lý" else ""
            for i in range(n)
        ],
        "ProjectName": project_list,
        "CustomerSegment": list(rng.choice([s[0] for s in _SEGMENTS], size=n, p=_seg_probs())),
        "AgentId": [f"A{int(rng.integers(1, 61)):03d}" for _ in range(n)],
        "CreatedDate": [datetime.combine(d, datetime.min.time()) for d in day_month],
        "TenantId": [params.tenant_id] * n,
    }
    leads = pd.DataFrame(rows)

    # ── Ciel lead pool (F0 booking-heavy) — big pipeline, few signed deals. ──
    # This is the AI deep-dive project: ~6,500 leads, mostly Booking/Lead status,
    # only 60 Deal (matches units_sold_h1). Top 3 sàn = ~68% of Ciel leads.
    ciel_funnel = [("Lead", 3200), ("NET", 1400), ("Visit", 900),
                   ("Booking", 780), ("Deal", 60), ("Lost", 210)]
    ciel_status = []
    for status, cnt in ciel_funnel:
        ciel_status.extend([status] * cnt)
    ciel_n = len(ciel_status)
    rng.shuffle(ciel_status)
    ciel_san = list(rng.choice(san_names, size=ciel_n, p=_ciel_san_probs()))
    ciel_mo = rng.choice([4, 5, 6], size=ciel_n, p=[0.25, 0.35, 0.40])  # ramping to kickoff
    ciel_rows = {
        "LeadId": np.arange(n + 1, n + 1 + ciel_n, dtype=np.int64),
        "LeadName": [fake.name() for _ in range(ciel_n)],
        "Status": ciel_status,
        "Source": list(rng.choice(src_names, size=ciel_n, p=src_w)),
        "SanGiaoDich": [ciel_san[i] if True else "" for i in range(ciel_n)],
        "ProjectName": [_CIEL] * ciel_n,
        "CustomerSegment": list(rng.choice([s[0] for s in _SEGMENTS], size=ciel_n, p=_seg_probs())),
        "AgentId": [f"A{int(rng.integers(1, 61)):03d}" for _ in range(ciel_n)],
        "CreatedDate": [
            datetime.combine(date(2026, int(mo), int(rng.integers(1, 28))), datetime.min.time())
            for mo in ciel_mo
        ],
        "TenantId": [params.tenant_id] * ciel_n,
    }
    return pd.concat([leads, pd.DataFrame(ciel_rows)], ignore_index=True)


def _seg_probs():
    total = sum(s[1] for s in _SEGMENTS)
    return [s[1] / total for s in _SEGMENTS]


def _ciel_san_probs():
    # top 3 sàn = 68% of Ciel leads
    w = np.array([0.30, 0.24, 0.14, 0.10, 0.08, 0.06, 0.05, 0.03])
    return list(w / w.sum())


def _build_sales(params: MeyGroupParameters, rng, fake, leads) -> pd.DataFrame:
    # One Sale row per signed deal (units_sold_h1 per project, ~2,485 total).
    # Deal value ~ project avg price × per-unit-type multiplier so villas/duplex
    # cost more than studios within a project.
    rows = []
    sale_id = 1
    unit_pool = []
    for ut, cnt in _UNIT_TYPES:
        unit_pool.extend([ut] * cnt)
    seg_pool = []
    for sg, cnt in _SEGMENTS:
        seg_pool.extend([sg] * cnt)

    # unit-type price multiplier (relative to project avg) — bigger units pricier
    ut_mult = {"1PN+": 0.62, "2PN": 0.85, "2PN+": 1.05, "3PN": 1.35, "Duplex": 2.1, "Villa": 3.0}
    # monthly close weights from the demand curve
    months = [m[0] for m in _MONTHLY]
    close_w = np.array([m[1] for m in _MONTHLY], float); close_w /= close_w.sum()

    for d in _proj_dicts():
        proj = d["name"]
        ndeals = d["units_sold_h1"]
        avg_price = d["avg_price_ty"] * 1e9
        for _ in range(ndeals):
            close_month = int(rng.choice(months, p=close_w))
            closed = date(2026, close_month, int(rng.integers(1, 28)))
            ut = str(rng.choice(unit_pool))
            price = round(avg_price * ut_mult.get(ut, 1.0) * rng.uniform(0.85, 1.15), -6)
            rows.append({
                "SaleId": sale_id,
                "ProjectName": proj,
                "UnitType": ut,
                "CustomerSegment": str(rng.choice(seg_pool)),
                "AgentId": f"A{int(rng.integers(1, 61)):03d}",
                "DealValueVnd": int(price),
                "ClosedDate": datetime.combine(closed, datetime.min.time()),
                "TenantId": params.tenant_id,
            })
            sale_id += 1
    return pd.DataFrame(rows)


def _build_collections(params: MeyGroupParameters, rng, sales) -> pd.DataFrame:
    # 3 milestone rows per sale (Deposit 30% / Handover 50% / Final 20%).
    rows = []
    cid = 1
    today = params.end_date
    for _, s in sales.iterrows():
        closed = pd.Timestamp(s["ClosedDate"]).date()
        deal_val = s["DealValueVnd"]
        for mname, pct, offset in _MILESTONES:
            due = closed + timedelta(days=offset)
            amount = int(deal_val * pct)
            # Aging bucket. Calibrated to master data: Đã thu 1203 · Chưa đến hạn
            # 506 · overdue 76 (of 1785). Deposit (T+0) almost always collected;
            # Handover/Final collected early in a share of cases (real estate
            # buyers prepay), the rest not-yet-due, a small tail overdue.
            collect_prob = 0.97 if offset == 0 else 0.62
            days_over = (today - due).days
            if due <= today and rng.random() < collect_prob:
                aging, collected = "Đã thu", amount
            elif due > today and rng.random() < collect_prob:
                # prepaid ahead of schedule
                aging, collected = "Đã thu", amount
            elif due > today:
                aging, collected = "Chưa đến hạn", 0
            elif days_over > 90:
                aging, collected = "90+ ngày", 0
            elif days_over > 60:
                aging, collected = "61-90 ngày", 0
            elif days_over > 30:
                aging, collected = "31-60 ngày", 0
            else:
                aging, collected = "0-30 ngày", 0
            rows.append({
                "CollectionId": cid,
                "SaleId": s["SaleId"],
                "ProjectName": s["ProjectName"],
                "MilestoneType": mname,
                "DueDate": datetime.combine(due, datetime.min.time()),
                "AmountDueVnd": amount,
                "AmountCollectedVnd": collected,
                "AgingBucket": aging,
                "TenantId": params.tenant_id,
            })
            cid += 1
    return pd.DataFrame(rows)


def _build_monthly_financial(params: MeyGroupParameters, rng, sales, collections) -> pd.DataFrame:
    # Per project × month, with the THREE series the report template needs:
    #   Thực hiện (actual)  ·  KHNS (kế hoạch ngân sách)  ·  KPI tháng (stretch)
    # for each of sản lượng (units), doanh số (revenue), dòng tiền (cash).
    # Actuals are aggregated from the real Sales + Collections rows so the
    # dashboard totals reconcile exactly with the detail tables.
    s = sales.copy()
    s["mo"] = pd.to_datetime(s["ClosedDate"]).dt.month
    c = collections.copy()
    c["mo"] = pd.to_datetime(c["DueDate"]).dt.month

    mult = {m[0]: m for m in _MONTHLY}
    rows = []
    fid = 1
    for d in _proj_dicts():
        name, region = d["name"], d["region"]
        cash_ratio = _CASH_RATIO.get(name, 0.3)
        for mo in range(1, 7):
            sub = s[(s["ProjectName"] == name) & (s["mo"] == mo)]
            units = int(len(sub))
            revenue = int(sub["DealValueVnd"].sum())
            # cash collected this month = share of signed revenue by project ratio,
            # spread with mild monthly noise.
            cash = int(revenue * cash_ratio * rng.uniform(0.9, 1.1))
            cost = int(revenue * rng.uniform(0.60, 0.72))
            _, uw, ku, kpu, kr, kpr, kc, kpc = mult[mo]
            rows.append({
                "FinancialId": fid,
                "ProjectName": name,
                "Region": region,
                "Month": datetime(2026, mo, 1),
                "UnitsSold": units,
                "UnitsSoldPlan": int(round(units * ku)),
                "UnitsSoldKpi": int(round(units * kpu)),
                "RevenueVnd": revenue,
                "RevenuePlanVnd": int(revenue * kr),
                "RevenueKpiVnd": int(revenue * kpr),
                "CashCollectedVnd": cash,
                "CashCollectedPlanVnd": int(cash * kc),
                "CashCollectedKpiVnd": int(cash * kpc),
                "CostVnd": cost,
                "ProfitVnd": revenue - cost,
                "TenantId": params.tenant_id,
            })
            fid += 1
    return pd.DataFrame(rows)


def _build_plan_targets(params: MeyGroupParameters, monthly_financial) -> pd.DataFrame:
    # Group-level KH vs TH vs KPI by month + metric, aggregated from the real
    # MonthlyFinancial rows so totals reconcile. Metrics: SanLuong (units),
    # DoanhSo (revenue), DongTien (cash). Three series: PlanValue (KHNS),
    # ActualValue (thực hiện), KpiValue (stretch).
    mf = monthly_financial.copy()
    mf["mo"] = pd.to_datetime(mf["Month"]).dt.month
    rows = []
    pid = 1
    metric_cols = [
        ("SanLuong", "UnitsSold", "UnitsSoldPlan", "UnitsSoldKpi"),
        ("DoanhSo", "RevenueVnd", "RevenuePlanVnd", "RevenueKpiVnd"),
        ("DongTien", "CashCollectedVnd", "CashCollectedPlanVnd", "CashCollectedKpiVnd"),
    ]
    for mo in range(1, 7):
        month = datetime(2026, mo, 1)
        sub = mf[mf["mo"] == mo]
        for metric, acol, pcol, kcol in metric_cols:
            rows.append({
                "PlanId": pid,
                "Month": month,
                "Metric": metric,
                "PlanValue": int(sub[pcol].sum()),
                "ActualValue": int(sub[acol].sum()),
                "KpiValue": int(sub[kcol].sum()),
                "TenantId": params.tenant_id,
            })
            pid += 1
    return pd.DataFrame(rows)


def _build_agencies(params: MeyGroupParameters) -> pd.DataFrame:
    rows = []
    for i, (name, leads, net, visit, booking, deal, rev) in enumerate(_SAN, 1):
        # marketing support budget — deliberately NOT correlated with performance
        # (talk track: "sàn nhận nhiều hỗ trợ nhất có phải sàn hiệu quả nhất?")
        support = int(rev * 1e9 * (0.03 if i % 2 == 0 else 0.06))  # some over-supported
        rows.append({
            "AgencyId": i,
            "AgencyName": name,
            "LeadsReferred": leads,
            "NetCount": net,
            "VisitCount": visit,
            "BookingCount": booking,
            "DealCount": deal,
            "RevenueVnd": int(rev * 1e9),
            "SupportBudgetVnd": support,
            "ConversionRate": round(deal / leads, 4) if leads else 0,
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


def _build_packages(params: MeyGroupParameters, rng) -> pd.DataFrame:
    # Contract packages per project with department accountability + progress.
    pkg_types = ["Móng & Thô", "Kết cấu", "MEP (Cơ điện)", "Hoàn thiện", "Cảnh quan", "Hạ tầng"]
    rows = []
    pid = 1
    for d in _proj_dicts(built_only=True):
        name = d["name"]
        for pkg in pkg_types:
            status = str(rng.choice(_PACKAGE_STATUS, p=[0.55, 0.25, 0.20]))
            progress = (1.0 if status == "Hoàn thành"
                        else rng.uniform(0.4, 0.9) if status == "Đúng tiến độ"
                        else rng.uniform(0.15, 0.6))
            delay_weeks = int(rng.integers(1, 5)) if status == "Chậm tiến độ" else 0
            blocking = str(rng.choice(["Kỹ thuật", "Mua hàng", "Vận hành", ""],
                                       p=[0.3, 0.3, 0.15, 0.25])) if delay_weeks else ""
            rows.append({
                "PackageId": pid,
                "ProjectName": name,
                "PackageName": pkg,
                "Status": status,
                "ProgressPct": round(float(progress), 3),
                "DelayWeeks": delay_weeks,
                "BlockingDepartment": blocking,
                "TenantId": params.tenant_id,
            })
            pid += 1
    return pd.DataFrame(rows)


def _build_hr_metrics(params: MeyGroupParameters, rng) -> pd.DataFrame:
    # Per department × month: headcount, payroll, attrition, KPI progress, hiring.
    rows = []
    hid = 1
    for dept in _DEPARTMENTS:
        base_hc = int(rng.integers(15, 80))
        payroll_plan = base_hc * int(rng.integers(18, 32)) * 1_000_000  # ~monthly
        for mo in range(1, 7):
            hc = base_hc + int(rng.integers(-3, 4))
            payroll = int(payroll_plan * rng.uniform(0.92, 1.08))
            # attrition spike for one dept in a late month (demo signal)
            attr = rng.uniform(0.01, 0.04)
            if dept == "Kinh doanh" and mo >= 5:
                attr = rng.uniform(0.08, 0.13)  # đột biến nghỉ việc
            rows.append({
                "HRId": hid,
                "Department": dept,
                "Month": datetime(2026, mo, 1),
                "Headcount": hc,
                "PayrollPlanVnd": payroll_plan,
                "PayrollActualVnd": payroll,
                "AttritionRate": round(float(attr), 4),
                "NewHires": int(rng.integers(0, 6)),
                "KpiProgressPct": round(float(rng.uniform(0.55, 1.05)), 3),
                "TrainingKpiPct": round(float(rng.uniform(0.4, 1.0)), 3),
                "TenantId": params.tenant_id,
            })
            hid += 1
    return pd.DataFrame(rows)
