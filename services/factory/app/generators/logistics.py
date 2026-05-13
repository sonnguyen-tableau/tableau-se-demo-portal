"""Logistics / Supply Chain synthetic data generator."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker


@dataclass
class LogisticsParameters:
    tenant_id: str
    start_date: date
    end_date: date
    seed: int = 42
    n_carriers: int = 18
    n_hubs: int = 14
    n_lanes: int = 70
    n_vehicles: int = 240
    n_customers: int = 380


@dataclass
class LogisticsDataset:
    carriers: pd.DataFrame
    hubs: pd.DataFrame
    lanes: pd.DataFrame
    vehicles: pd.DataFrame
    customers: pd.DataFrame
    shipments: pd.DataFrame
    routes: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Carriers": self.carriers,
            "Hubs": self.hubs,
            "Lanes": self.lanes,
            "Vehicles": self.vehicles,
            "Customers": self.customers,
            "Shipments": self.shipments,
            "Routes": self.routes,
        }


def generate_logistics(params: LogisticsParameters) -> LogisticsDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker()
    Faker.seed(params.seed)

    carriers = pd.DataFrame(
        {
            "CarrierId": np.arange(1, params.n_carriers + 1, dtype=np.int32),
            "CarrierName": [fake.unique.company()[:60] for _ in range(params.n_carriers)],
            "Tier": rng.choice(["Premium", "Standard", "Budget"], size=params.n_carriers, p=[0.25, 0.55, 0.20]),
        }
    )

    hubs = pd.DataFrame(
        {
            "HubId": np.arange(1, params.n_hubs + 1, dtype=np.int32),
            "HubCode": [f"HUB-{i:02d}" for i in range(1, params.n_hubs + 1)],
            "Country": rng.choice(["US", "DE", "JP", "AU"], size=params.n_hubs),
            "Region": rng.choice(["NA", "EMEA", "APAC"], size=params.n_hubs, p=[0.5, 0.3, 0.2]),
        }
    )

    lanes = pd.DataFrame(
        {
            "LaneId": np.arange(1, params.n_lanes + 1, dtype=np.int32),
            "OriginHubId": rng.integers(1, params.n_hubs + 1, size=params.n_lanes, dtype=np.int32),
            "DestinationHubId": rng.integers(1, params.n_hubs + 1, size=params.n_lanes, dtype=np.int32),
            "DistanceMiles": rng.integers(80, 3500, size=params.n_lanes, dtype=np.int32),
            "ServiceLevelDays": rng.integers(1, 7, size=params.n_lanes, dtype=np.int8),
        }
    )

    vehicles = pd.DataFrame(
        {
            "VehicleId": np.arange(1, params.n_vehicles + 1, dtype=np.int32),
            "Type": rng.choice(["Van", "Truck", "TrailerSemi", "Reefer"], size=params.n_vehicles, p=[0.30, 0.40, 0.22, 0.08]),
            "CarrierId": rng.integers(1, params.n_carriers + 1, size=params.n_vehicles, dtype=np.int32),
            "Capacity_Cwt": rng.integers(20, 480, size=params.n_vehicles, dtype=np.int32),
        }
    )

    customers = pd.DataFrame(
        {
            "CustomerId": np.arange(1, params.n_customers + 1, dtype=np.int32),
            "CustomerName": [fake.unique.company()[:60] for _ in range(params.n_customers)],
            "Region": rng.choice(["NA", "EMEA", "APAC"], size=params.n_customers, p=[0.5, 0.3, 0.2]),
            "Tier": rng.choice(["Strategic", "Core", "Standard"], size=params.n_customers, p=[0.10, 0.30, 0.60]),
            "TenantId": params.tenant_id,
        }
    )

    # Daily shipment volume with Q4 surge (Nov-Dec) and weekly cycle.
    days = pd.date_range(params.start_date, params.end_date, freq="D")
    dow = np.array([d.dayofweek for d in days])
    dow_mult = np.where(dow == 6, 0.4, np.where(dow == 5, 0.8, 1.0))  # Sun light
    month = np.array([d.month for d in days])
    q4_mult = np.where(np.isin(month, [11, 12]), 1.6, 1.0)
    daily = np.maximum(rng.poisson(360 * dow_mult * q4_mult), 1)
    total = int(daily.sum())

    ship_dates = np.repeat(days.values, daily).astype("datetime64[D]")
    lane_ids = rng.integers(1, params.n_lanes + 1, size=total, dtype=np.int32)
    customer_ids = rng.integers(1, params.n_customers + 1, size=total, dtype=np.int32)
    carrier_ids = rng.integers(1, params.n_carriers + 1, size=total, dtype=np.int32)
    vehicle_ids = rng.integers(1, params.n_vehicles + 1, size=total, dtype=np.int32)
    weight = np.round(rng.lognormal(mean=4.2, sigma=0.7, size=total), 1).astype(np.float32)
    miles = lanes.set_index("LaneId").loc[lane_ids, "DistanceMiles"].to_numpy()
    fuel_cost_per_mile = np.round(rng.uniform(0.42, 0.66, size=total), 3).astype(np.float32)
    shipment_cost = np.round(miles * fuel_cost_per_mile + weight * 0.4, 2)
    on_time = rng.choice([True, False], size=total, p=[0.93, 0.07])
    damage = rng.choice([True, False], size=total, p=[0.013, 0.987])

    shipments = pd.DataFrame(
        {
            "ShipmentId": np.arange(1, total + 1, dtype=np.int64),
            "ShipDate": ship_dates,
            "LaneId": lane_ids,
            "CustomerId": customer_ids,
            "CarrierId": carrier_ids,
            "VehicleId": vehicle_ids,
            "WeightCwt": weight,
            "Miles": miles.astype(np.int32),
            "Cost": shipment_cost,
            "OnTime": on_time,
            "Damaged": damage,
        }
    )

    # Routes — a route is a planned itinerary covering 1-4 shipments.
    n_routes = max(int(total / 3), 500)
    routes = pd.DataFrame(
        {
            "RouteId": np.arange(1, n_routes + 1, dtype=np.int64),
            "PlannedDate": [
                _rand_date(rng, params.start_date, params.end_date) for _ in range(n_routes)
            ],
            "VehicleId": rng.integers(1, params.n_vehicles + 1, size=n_routes, dtype=np.int32),
            "StopCount": rng.integers(2, 8, size=n_routes, dtype=np.int8),
            "PlannedMiles": rng.integers(40, 1400, size=n_routes, dtype=np.int32),
        }
    )

    return LogisticsDataset(carriers, hubs, lanes, vehicles, customers, shipments, routes)


def _rand_date(rng: np.random.Generator, start: date, end: date) -> datetime:
    span = max((end - start).days, 1)
    offset = int(rng.integers(0, span))
    return datetime.combine(start + timedelta(days=offset), datetime.min.time())
