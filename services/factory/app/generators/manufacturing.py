"""Manufacturing / Operations synthetic data generator."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker


@dataclass
class ManufacturingParameters:
    tenant_id: str
    start_date: date
    end_date: date
    seed: int = 42
    n_plants: int = 8
    lines_per_plant: int = 6
    n_products: int = 60
    n_suppliers: int = 24


@dataclass
class ManufacturingDataset:
    plants: pd.DataFrame
    lines: pd.DataFrame
    products: pd.DataFrame
    suppliers: pd.DataFrame
    production_runs: pd.DataFrame
    defects: pd.DataFrame
    shipments: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Plants": self.plants,
            "Lines": self.lines,
            "Products": self.products,
            "Suppliers": self.suppliers,
            "ProductionRuns": self.production_runs,
            "Defects": self.defects,
            "Shipments": self.shipments,
        }


def generate_manufacturing(params: ManufacturingParameters) -> ManufacturingDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker()
    Faker.seed(params.seed)

    plants = pd.DataFrame(
        {
            "PlantId": np.arange(1, params.n_plants + 1, dtype=np.int32),
            "PlantName": [f"Plant {i:02d}" for i in range(1, params.n_plants + 1)],
            "Country": rng.choice(["US", "MX", "DE", "CN", "VN"], size=params.n_plants),
            "Region": rng.choice(["NA", "EMEA", "APAC"], size=params.n_plants, p=[0.5, 0.25, 0.25]),
            "Capacity_UnitsPerDay": rng.integers(1500, 9000, size=params.n_plants, dtype=np.int32),
        }
    )

    n_lines = params.n_plants * params.lines_per_plant
    lines = pd.DataFrame(
        {
            "LineId": np.arange(1, n_lines + 1, dtype=np.int32),
            "PlantId": np.repeat(plants["PlantId"].to_numpy(), params.lines_per_plant),
            "LineName": [f"L{i:02d}" for i in range(1, n_lines + 1)],
            "AvailabilityPct": np.round(rng.uniform(0.78, 0.94, size=n_lines), 4).astype(np.float32),
        }
    )

    products = pd.DataFrame(
        {
            "ProductId": np.arange(1, params.n_products + 1, dtype=np.int32),
            "Sku": [f"P-{i:05d}" for i in range(1, params.n_products + 1)],
            "ProductName": [fake.bs().title()[:60] for _ in range(params.n_products)],
            "TargetCycleSec": rng.integers(15, 120, size=params.n_products, dtype=np.int32),
            "UnitCost": np.round(rng.lognormal(mean=2.8, sigma=0.5, size=params.n_products), 2),
        }
    )

    suppliers = pd.DataFrame(
        {
            "SupplierId": np.arange(1, params.n_suppliers + 1, dtype=np.int32),
            "SupplierName": [fake.unique.company()[:60] for _ in range(params.n_suppliers)],
            "Country": rng.choice(["US", "CN", "JP", "DE", "VN"], size=params.n_suppliers),
            "ScoreCard": np.round(rng.beta(a=6, b=2, size=params.n_suppliers), 3).astype(np.float32),
        }
    )

    days = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(days)
    # Each line runs ~2 production runs/day (shift A + B) on weekdays, ~1 on weekends.
    dow = np.array([d.dayofweek for d in days])
    runs_per_day_per_line = np.where(dow < 5, 2, 1)
    runs_per_day = runs_per_day_per_line * n_lines
    total_runs = int(runs_per_day.sum())

    line_ids = np.tile(np.repeat(lines["LineId"].to_numpy(), 2), n_days)[:total_runs]
    run_dates = np.repeat(days.values, runs_per_day).astype("datetime64[D]")
    product_ids = rng.integers(1, params.n_products + 1, size=total_runs, dtype=np.int32)
    planned = rng.integers(120, 1100, size=total_runs, dtype=np.int32)
    yield_pct = np.clip(rng.normal(loc=0.965, scale=0.025, size=total_runs), 0.7, 1.0)
    actual = (planned * yield_pct).astype(np.int32)
    downtime_min = np.clip(rng.gamma(shape=1.4, scale=18.0, size=total_runs), 0, 360).astype(np.int32)

    production_runs = pd.DataFrame(
        {
            "RunId": np.arange(1, total_runs + 1, dtype=np.int64),
            "RunDate": run_dates,
            "LineId": line_ids,
            "ProductId": product_ids,
            "Shift": rng.choice(["A", "B", "C"], size=total_runs, p=[0.45, 0.40, 0.15]),
            "PlannedUnits": planned,
            "ActualUnits": actual,
            "DowntimeMinutes": downtime_min,
            "TenantId": params.tenant_id,
        }
    )

    # Defects: ~one defect record per ~30 runs on average, more for low-yield runs.
    defect_count = max(int(total_runs / 28), 100)
    defect_runs = rng.choice(production_runs["RunId"].to_numpy(), size=defect_count, replace=False)
    defects = pd.DataFrame(
        {
            "DefectId": np.arange(1, defect_count + 1, dtype=np.int64),
            "RunId": defect_runs,
            "Category": rng.choice(
                ["Visual", "Functional", "Dimensional", "Packaging"],
                size=defect_count,
                p=[0.25, 0.40, 0.25, 0.10],
            ),
            "Severity": rng.choice(["Low", "Medium", "High", "Critical"], size=defect_count, p=[0.55, 0.30, 0.12, 0.03]),
            "Quantity": rng.integers(1, 25, size=defect_count, dtype=np.int16),
        }
    )

    # Shipments: roughly 1 per 4 runs.
    ship_count = max(int(total_runs / 4), 200)
    shipments = pd.DataFrame(
        {
            "ShipmentId": np.arange(1, ship_count + 1, dtype=np.int64),
            "ShipDate": [
                _rand_date(rng, params.start_date, params.end_date) for _ in range(ship_count)
            ],
            "PlantId": rng.integers(1, params.n_plants + 1, size=ship_count, dtype=np.int32),
            "SupplierId": rng.integers(1, params.n_suppliers + 1, size=ship_count, dtype=np.int32),
            "Units": rng.integers(50, 2000, size=ship_count, dtype=np.int32),
            "OnTime": rng.choice([True, False], size=ship_count, p=[0.92, 0.08]),
        }
    )

    return ManufacturingDataset(plants, lines, products, suppliers, production_runs, defects, shipments)


def _rand_date(rng: np.random.Generator, start: date, end: date) -> datetime:
    span = max((end - start).days, 1)
    offset = int(rng.integers(0, span))
    return datetime.combine(start + timedelta(days=offset), datetime.min.time())
