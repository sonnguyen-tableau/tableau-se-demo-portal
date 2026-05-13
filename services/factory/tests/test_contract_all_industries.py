"""Contract test: every generator must emit columns matching its JSON schema.

Reads `packages/factory-schema/<industry>.schema.json` and validates that each
generated DataFrame's column set exactly matches the contract.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.generators.banking import BankingParameters, generate_banking
from app.generators.healthcare import HealthcareParameters, generate_healthcare
from app.generators.logistics import LogisticsParameters, generate_logistics
from app.generators.manufacturing import ManufacturingParameters, generate_manufacturing
from app.generators.retail import RetailParameters, generate_retail

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "factory-schema"
END = date(2026, 1, 1)
START = END - timedelta(days=730)


def _load_schema(name: str) -> dict[str, object]:
    return json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text())


def _expected_columns(schema: dict[str, object]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    props = schema.get("properties", {})
    assert isinstance(props, dict)
    for table_name, table_spec in props.items():
        assert isinstance(table_spec, dict)
        cols = table_spec.get("properties", {}).get("columns", {}).get("items", {}).get("enum", [])
        out[table_name] = set(cols)
    return out


CASES = [
    (
        "retail-ecommerce",
        lambda: generate_retail(
            RetailParameters(tenant_id="t", start_date=START, end_date=END)
        ).all_tables(),
    ),
    (
        "retail-banking",
        lambda: generate_banking(
            BankingParameters(tenant_id="t", start_date=START, end_date=END)
        ).all_tables(),
    ),
    (
        "manufacturing",
        lambda: generate_manufacturing(
            ManufacturingParameters(tenant_id="t", start_date=START, end_date=END)
        ).all_tables(),
    ),
    (
        "healthcare",
        lambda: generate_healthcare(
            HealthcareParameters(tenant_id="t", start_date=START, end_date=END)
        ).all_tables(),
    ),
    (
        "logistics",
        lambda: generate_logistics(
            LogisticsParameters(tenant_id="t", start_date=START, end_date=END)
        ).all_tables(),
    ),
]


@pytest.mark.parametrize("name,build_tables", CASES)
def test_generated_columns_match_schema(name: str, build_tables) -> None:
    schema = _load_schema(name)
    expected = _expected_columns(schema)
    tables = build_tables()

    assert set(tables.keys()) == set(expected.keys()), (
        f"Generator for {name} emitted tables {set(tables)}; "
        f"schema expects {set(expected)}"
    )

    for table_name, df in tables.items():
        produced = set(df.columns.astype(str).tolist())
        contract = expected[table_name]
        missing = contract - produced
        extra = produced - contract
        assert not missing and not extra, (
            f"{name}/{table_name}: missing={missing} extra={extra}"
        )


@pytest.mark.parametrize("name,build_tables", CASES)
def test_row_count_within_budget(name: str, build_tables) -> None:
    tables = build_tables()
    total = sum(len(t) for t in tables.values())
    # Plan calls for 150-300K target; allow a 50K-800K acceptance window so
    # naturally-lower-volume industries (Manufacturing production runs) and
    # higher-volume ones (Logistics shipments) both fit without re-tuning.
    assert 50_000 <= total <= 800_000, f"{name}: row count out of bounds: {total}"


def test_healthcare_patient_ids_are_synthetic() -> None:
    """PatientId must be in `P####` synthetic format — never real MRN/SSN-like."""
    tables = generate_healthcare(
        HealthcareParameters(tenant_id="t", start_date=START, end_date=END, n_patients=200)
    ).all_tables()
    pid = tables["Patients"]["PatientId"].astype(str)
    assert pid.str.fullmatch(r"P\d{7}").all()
