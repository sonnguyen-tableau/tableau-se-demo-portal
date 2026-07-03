"""Mey Group (Meyland / Tân Á Đại Thành) real-estate synthetic data generator.

Powers the Mey Group Executive demo for CEO/CFO/PMO — 5 dashboards:
Tài Chính · Kinh Doanh & Phễu · Dự Án & Gói Thầu · Nhân Sự · Kênh Đại Lý,
plus the Mey Pearl Ciel AI deep-dive.

Contract: emits a `MeyGroupDataset` whose column names match
`packages/factory-schema/retail-realestate.schema.json`.

Calibrated to `tmp/meygroup/MEYGROUP_MASTER_DATA.md` aggregates:
- 6 built projects + Mey Pearl Ciel (Rumor stage, AI deep-dive)
- Leads funnel (terminal status, NOT cumulative): Lead 926 · NET 599 · Visit 663
  · Booking 432 · Deal 233 · Lost 154  (total ~3,001 leads)
- 595 sales/deals · 1,785 collection records (3 milestones × 595)
- 8 sàn giao dịch, 60 agents (A001–A060), 2 vùng (Bắc/Trung)
- Plan-vs-actual by month: T1-2 vượt KH, T3-6 dưới KH (matches talk track)

100% Vietnamese labels. Currency VND, displayed as tỷ (÷1e9).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker


# ─── Projects (6 built + Ciel for AI deep-dive) ─────────────────────────────
# (name, district, region, target_deals, target_revenue_ty, lat, lon, stage)
_PROJECTS: tuple[tuple[str, str, str, int, int, float, float, str], ...] = (
    ("Rivea Hanoi",                 "Central", "Bắc",  181, 1968, 21.0075, 105.8425, "Đang bán"),
    ("Meyhomes Capital Phú Quốc",   "South",   "Trung",123, 1420, 10.2270, 103.9670, "Đang bán"),
    ("Meypearl Harmony Phú Quốc",   "South",   "Trung", 83, 1169, 10.2150, 103.9600, "Đang bán"),
    ("Mey Retreat Bãi Lữ",          "East",    "Trung", 57, 1009, 18.8100, 105.7600, "Đang bán"),
    ("Galia Hanoi",                 "North",   "Bắc",  116,  957, 21.0450, 105.7900, "Đang bán"),
    ("Rivea Residences Vinh Hưng",  "West",    "Bắc",   35,  354, 20.9200, 105.7500, "Đang bán"),
    ("Mey Pearl Ciel Phú Quốc",     "South",   "Trung",  0,    0, 10.2050, 103.9550, "Rumor"),
)

# Funnel stages — TERMINAL status (where a lead sits now), not cumulative.
# (status, target_count)
_FUNNEL: tuple[tuple[str, int], ...] = (
    ("Lead", 926),
    ("NET", 599),
    ("Visit", 663),
    ("Booking", 432),
    ("Deal", 233),
    ("Lost", 154),
)
_FUNNEL_ORDER = ["Lead", "NET", "Visit", "Booking", "Deal"]  # Lost = branch

# Lead sources (5)
_SOURCES: tuple[tuple[str, int], ...] = (
    ("Referral", 731), ("Event", 678), ("Walk-in", 609), ("Đại lý", 530), ("Digital", 459),
)

# Sàn giao dịch (8) — only when source = Đại lý. (name, leads, net, visit, booking, deal, revenue_ty)
_SAN: tuple[tuple[str, int, int, int, int, int, int], ...] = (
    ("Sàn CEN",      235, 133, 78, 42, 24, 556),
    ("Sàn TTG",      212, 125, 64, 29, 13, 381),
    ("Sàn Tân Long", 188, 102, 56, 26, 12, 323),
    ("Sàn FTN",      204,  96, 62, 13,  9, 271),
    ("Sàn Âu Lạc",   155,  91, 45, 26, 13, 370),
    ("Sàn Euro",     107,  63, 37, 15,  9, 316),
    ("Sàn BTB",      134,  89, 34,  9,  5, 154),
    ("Sàn VLand",    106,  50, 22, 12,  6, 117),
)

# Product types (6)
_UNIT_TYPES: tuple[tuple[str, int], ...] = (
    ("2PN", 187), ("2PN+", 134), ("1PN+", 130), ("3PN", 87), ("Duplex", 33), ("Villa", 24),
)

# Customer segments (4)
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

# Plan vs actual by month (from Excel KeHoach_ThucHien) — LEAD/BOOKING/DEAL/DOANHSO
# (month, lead_plan, lead_actual, booking_plan, booking_actual, deal_plan, deal_actual, rev_plan_ty, rev_actual_ty)
_PLAN_ACTUAL: tuple[tuple, ...] = (
    (1,  40, 63,  6, 16, 3, 4,  84, 102),
    (2,  45, 64,  7, 12, 4, 5, 112, 167),
    (3,  50, 72,  8, 17, 5, 4, 140,  86),
    (4,  55, 69,  9, 16, 6, 3, 168, 101),
    (5,  60, 71, 10, 12, 7, 4, 196, 105),
    (6,  65, 41, 11,  7, 8, 3, 224,  88),
    (7,  70,  0, 12,  0, 9, 0, 252,   0),
    (8,  68,  0, 11,  0, 8, 0, 224,   0),
    (9,  60,  0, 10,  0, 7, 0, 196,   0),
    (10, 55,  0,  9,  0, 6, 0, 168,   0),
    (11, 50,  0,  8,  0, 5, 0, 140,   0),
    (12, 45,  0,  7,  0, 4, 0, 112,   0),
)


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
    monthly_financial = _build_monthly_financial(params, rng)
    plan_targets = _build_plan_targets(params)
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
    for i, (name, district, region, tgt_deals, tgt_rev, lat, lon, stage) in enumerate(_PROJECTS, 1):
        rows.append({
            "ProjectId": i,
            "ProjectName": name,
            "District": district,
            "Region": region,
            "Stage": stage,
            "TargetDeals": tgt_deals,
            "TargetRevenueVnd": int(tgt_rev * 1e9),
            "Latitude": lat,
            "Longitude": lon,
            "Country": "VN",
            "TenantId": params.tenant_id,
        })
    return pd.DataFrame(rows)


def _build_leads(params: MeyGroupParameters, rng, fake) -> pd.DataFrame:
    # Build leads with terminal status matching _FUNNEL counts.
    status_list = []
    for status, cnt in _FUNNEL:
        status_list.extend([status] * cnt)
    n = len(status_list)
    rng.shuffle(status_list)

    # Source distribution matching _SOURCES
    source_list = []
    for src, cnt in _SOURCES:
        source_list.extend([src] * cnt)
    # pad/trim to n
    while len(source_list) < n:
        source_list.append(_SOURCES[0][0])
    source_list = source_list[:n]
    rng.shuffle(source_list)

    # Assign leads to projects — the 6 built projects proportional to deals,
    # plus Ciel gets a chunk (Rumor-stage leads, 1247 per talk track — but we
    # cap total at n; give Ciel ~a slice via a separate flag). Here Ciel leads
    # are handled in a dedicated Ciel lead pool appended below.
    proj_names = [p[0] for p in _PROJECTS if p[7] != "Rumor"]
    proj_weights = np.array([p[3] for p in _PROJECTS if p[7] != "Rumor"], dtype=float)
    proj_weights /= proj_weights.sum()
    lead_projects = list(rng.choice(proj_names, size=n, p=proj_weights))

    # Sàn only when source == Đại lý
    san_names = [s[0] for s in _SAN]
    san_weights = np.array([s[1] for s in _SAN], dtype=float)
    san_weights /= san_weights.sum()

    # Dates spread across the period, weighted so T1-2 higher (matches actual)
    total_days = (params.end_date - params.start_date).days + 1
    # month weights from plan-actual lead_actual
    month_actual = {m[0]: m[2] for m in _PLAN_ACTUAL}
    day_month = []
    for _ in range(n):
        # pick a month weighted by actual leads (Jan-Jun only)
        months = list(range(1, 7))
        mw = np.array([month_actual[m] for m in months], dtype=float)
        mw /= mw.sum()
        mo = int(rng.choice(months, p=mw))
        day = int(rng.integers(1, 28))
        day_month.append(date(2026, mo, day))

    rows = {
        "LeadId": np.arange(1, n + 1, dtype=np.int64),
        "LeadName": [fake.name() for _ in range(n)],
        "Status": status_list,
        "Source": source_list,
        "SanGiaoDich": [
            str(rng.choice(san_names, p=san_weights)) if source_list[i] == "Đại lý" else ""
            for i in range(n)
        ],
        "ProjectName": lead_projects,
        "CustomerSegment": [
            str(rng.choice([s[0] for s in _SEGMENTS], p=_seg_probs()))
            for _ in range(n)
        ],
        "AgentId": [f"A{int(rng.integers(1, 61)):03d}" for _ in range(n)],
        "CreatedDate": [datetime.combine(d, datetime.min.time()) for d in day_month],
        "TenantId": [params.tenant_id] * n,
    }
    leads = pd.DataFrame(rows)

    # ── Ciel lead pool (Rumor) — 1,247 leads over 8 sàn, top 3 = 68% ──
    ciel_n = 1247
    ciel_san = list(rng.choice(san_names, size=ciel_n, p=_ciel_san_probs()))
    ciel_weeks = rng.choice([1, 2, 3, 4], size=ciel_n, p=[0.30, 0.30, 0.25, 0.15])  # slowing wk4
    ciel_rows = {
        "LeadId": np.arange(n + 1, n + 1 + ciel_n, dtype=np.int64),
        "LeadName": [fake.name() for _ in range(ciel_n)],
        "Status": ["Lead"] * ciel_n,  # all Rumor-stage leads
        "Source": ["Đại lý"] * ciel_n,
        "SanGiaoDich": ciel_san,
        "ProjectName": ["Mey Pearl Ciel Phú Quốc"] * ciel_n,
        "CustomerSegment": [str(rng.choice([s[0] for s in _SEGMENTS], p=_seg_probs())) for _ in range(ciel_n)],
        "AgentId": [f"A{int(rng.integers(1, 61)):03d}" for _ in range(ciel_n)],
        "CreatedDate": [
            datetime.combine(date(2026, 6, min(28, int(w) * 7)), datetime.min.time())
            for w in ciel_weeks
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
    # 595 sales total across the 6 built projects (deal counts per project).
    rows = []
    sale_id = 1
    unit_pool = []
    for ut, cnt in _UNIT_TYPES:
        unit_pool.extend([ut] * cnt)
    seg_pool = []
    for sg, cnt in _SEGMENTS:
        seg_pool.extend([sg] * cnt)

    # per-project deal counts (sum = 595)
    proj_deals = {p[0]: p[3] for p in _PROJECTS if p[7] != "Rumor"}
    for proj, ndeals in proj_deals.items():
        prj = next(p for p in _PROJECTS if p[0] == proj)
        avg_price = (prj[4] * 1e9) / max(ndeals, 1)  # revenue_ty / deals
        for _ in range(ndeals):
            close_month = int(rng.choice([1, 2, 3, 4, 5, 6], p=[0.18, 0.20, 0.16, 0.16, 0.16, 0.14]))
            closed = date(2026, close_month, int(rng.integers(1, 28)))
            price = round(avg_price * rng.uniform(0.7, 1.4), -6)
            rows.append({
                "SaleId": sale_id,
                "ProjectName": proj,
                "UnitType": str(rng.choice(unit_pool)),
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


def _build_monthly_financial(params: MeyGroupParameters, rng) -> pd.DataFrame:
    # Per project × month: sản lượng (units), doanh số (revenue), tiền thu (cash), chi phí.
    rows = []
    fid = 1
    for prj in _PROJECTS:
        if prj[7] == "Rumor":
            continue
        name, _, region, tgt_deals, tgt_rev, *_ = prj
        for mo in range(1, 7):
            # scale by month-actual revenue pattern
            m = _PLAN_ACTUAL[mo - 1]
            rev_factor = m[8] / max(sum(x[8] for x in _PLAN_ACTUAL[:6]), 1)
            revenue = int(tgt_rev * 1e9 * rev_factor * rng.uniform(0.85, 1.15))
            units = max(1, int(tgt_deals * rev_factor * rng.uniform(0.8, 1.2)))
            cash = int(revenue * rng.uniform(0.55, 0.85))
            cost = int(revenue * rng.uniform(0.60, 0.78))
            rows.append({
                "FinancialId": fid,
                "ProjectName": name,
                "Region": region,
                "Month": datetime(2026, mo, 1),
                "UnitsSold": units,
                "RevenueVnd": revenue,
                "CashCollectedVnd": cash,
                "CostVnd": cost,
                "ProfitVnd": revenue - cost,
                "TenantId": params.tenant_id,
            })
            fid += 1
    return pd.DataFrame(rows)


def _build_plan_targets(params: MeyGroupParameters) -> pd.DataFrame:
    # Group-level plan vs actual by month + metric (Lead/Booking/Deal/DoanhSo).
    rows = []
    pid = 1
    for m in _PLAN_ACTUAL:
        mo = m[0]
        month = datetime(2026, mo, 1)
        specs = [
            ("Lead", m[1], m[2]),
            ("Booking", m[3], m[4]),
            ("Deal", m[5], m[6]),
            ("DoanhSo", int(m[7] * 1e9), int(m[8] * 1e9)),
        ]
        for metric, plan, actual in specs:
            rows.append({
                "PlanId": pid,
                "Month": month,
                "Metric": metric,
                "PlanValue": plan,
                "ActualValue": actual,
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
    for prj in _PROJECTS:
        if prj[7] == "Rumor":
            continue
        name = prj[0]
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
