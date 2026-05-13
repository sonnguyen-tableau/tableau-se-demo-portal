"""Healthcare (provider) synthetic data generator.

IMPORTANT: this generator emits SYNTHETIC data only. There is no path by
which real PHI can enter the output — patient names, IDs, and dates are all
generated. Dashboards built on this data MUST display a "synthetic data"
banner; the Healthcare industry template enforces it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd
from faker import Faker

DEPARTMENTS = ("ED", "ICU", "Cardiology", "Orthopedics", "Oncology", "Pediatrics", "Maternity")
PROCEDURE_NAMES = (
    "Routine Exam",
    "Imaging — CT",
    "Imaging — MRI",
    "Cardiac Cath",
    "Joint Replacement",
    "Chemo Cycle",
    "Delivery",
    "ICU Stay",
)


@dataclass
class HealthcareParameters:
    tenant_id: str
    start_date: date
    end_date: date
    seed: int = 42
    n_patients: int = 4_200
    n_providers: int = 180
    n_beds: int = 320


@dataclass
class HealthcareDataset:
    patients: pd.DataFrame
    providers: pd.DataFrame
    departments: pd.DataFrame
    procedures: pd.DataFrame
    encounters: pd.DataFrame
    claims: pd.DataFrame
    beds: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Patients": self.patients,
            "Providers": self.providers,
            "Departments": self.departments,
            "Procedures": self.procedures,
            "Encounters": self.encounters,
            "Claims": self.claims,
            "Beds": self.beds,
        }


def generate_healthcare(params: HealthcareParameters) -> HealthcareDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker()
    Faker.seed(params.seed)

    departments = pd.DataFrame(
        {
            "DepartmentId": np.arange(1, len(DEPARTMENTS) + 1, dtype=np.int32),
            "DepartmentName": list(DEPARTMENTS),
            "Type": ["Acute", "Acute", "Specialty", "Specialty", "Specialty", "Outpatient", "Acute"],
        }
    )

    providers = pd.DataFrame(
        {
            "ProviderId": np.arange(1, params.n_providers + 1, dtype=np.int32),
            "ProviderName": [f"Dr. {fake.unique.last_name()}" for _ in range(params.n_providers)],
            "Specialty": rng.choice(list(DEPARTMENTS), size=params.n_providers),
            "DepartmentId": rng.integers(1, len(DEPARTMENTS) + 1, size=params.n_providers, dtype=np.int32),
        }
    )

    procedures = pd.DataFrame(
        {
            "ProcedureId": np.arange(1, len(PROCEDURE_NAMES) + 1, dtype=np.int32),
            "ProcedureName": list(PROCEDURE_NAMES),
            "AvgCharge": np.round(rng.lognormal(mean=6.5, sigma=0.8, size=len(PROCEDURE_NAMES)), 2),
        }
    )

    patients = pd.DataFrame(
        {
            "PatientId": [f"P{i:07d}" for i in range(1, params.n_patients + 1)],
            "GenderCode": rng.choice(["F", "M", "U"], size=params.n_patients, p=[0.51, 0.47, 0.02]),
            "AgeBand": rng.choice(
                ["0-17", "18-34", "35-54", "55-74", "75+"], size=params.n_patients, p=[0.16, 0.22, 0.28, 0.22, 0.12]
            ),
            "Region": rng.choice(["NA", "EMEA"], size=params.n_patients, p=[0.75, 0.25]),
            "TenantId": params.tenant_id,
        }
    )

    beds = pd.DataFrame(
        {
            "BedId": np.arange(1, params.n_beds + 1, dtype=np.int32),
            "DepartmentId": rng.integers(1, len(DEPARTMENTS) + 1, size=params.n_beds, dtype=np.int32),
            "Type": rng.choice(["Standard", "ICU", "Maternity", "Observation"], size=params.n_beds, p=[0.6, 0.18, 0.12, 0.10]),
        }
    )

    # Encounter volume: weekday peak + flu-season multiplier (Dec-Feb).
    days = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(days)
    dow = np.array([d.dayofweek for d in days])
    base = np.full(n_days, 85.0)
    dow_mult = np.where(dow == 5, 0.6, np.where(dow == 6, 0.55, 1.0))
    month = np.array([d.month for d in days])
    flu_mult = np.where(np.isin(month, [12, 1, 2]), 1.35, 1.0)
    daily_enc = np.maximum(rng.poisson(base * dow_mult * flu_mult), 1)
    total_enc = int(daily_enc.sum())

    enc_dates = np.repeat(days.values, daily_enc).astype("datetime64[D]")
    patient_idx = rng.integers(0, params.n_patients, size=total_enc, dtype=np.int32)
    provider_ids = rng.integers(1, params.n_providers + 1, size=total_enc, dtype=np.int32)
    department_ids = rng.integers(1, len(DEPARTMENTS) + 1, size=total_enc, dtype=np.int32)
    procedure_ids = rng.integers(1, len(PROCEDURE_NAMES) + 1, size=total_enc, dtype=np.int32)
    los_days = np.clip(rng.gamma(shape=1.6, scale=2.4, size=total_enc), 0.1, 60.0).astype(np.float32)
    readmit30 = rng.choice([True, False], size=total_enc, p=[0.097, 0.903])

    encounters = pd.DataFrame(
        {
            "EncounterId": np.arange(1, total_enc + 1, dtype=np.int64),
            "EncounterDate": enc_dates,
            "PatientId": patients["PatientId"].to_numpy()[patient_idx],
            "ProviderId": provider_ids,
            "DepartmentId": department_ids,
            "ProcedureId": procedure_ids,
            "LengthOfStay_Days": los_days,
            "Readmission_30Day": readmit30,
            "OutcomeCode": rng.choice(
                ["Recovered", "Improved", "NoChange", "Deteriorated"], size=total_enc, p=[0.62, 0.30, 0.06, 0.02]
            ),
        }
    )

    # Claims: 1:1 with encounter, denial rate ~7%.
    claim_charge = procedures.set_index("ProcedureId").loc[procedure_ids, "AvgCharge"].to_numpy()
    claim_charge = claim_charge * rng.uniform(0.7, 1.5, size=total_enc)
    claims = pd.DataFrame(
        {
            "ClaimId": np.arange(1, total_enc + 1, dtype=np.int64),
            "EncounterId": encounters["EncounterId"].to_numpy(),
            "Charge": np.round(claim_charge, 2),
            "Payer": rng.choice(["Commercial", "Medicare", "Medicaid", "SelfPay"], size=total_enc, p=[0.55, 0.22, 0.16, 0.07]),
            "Status": rng.choice(["Paid", "Denied", "Pending"], size=total_enc, p=[0.85, 0.07, 0.08]),
        }
    )

    return HealthcareDataset(patients, providers, departments, procedures, encounters, claims, beds)
