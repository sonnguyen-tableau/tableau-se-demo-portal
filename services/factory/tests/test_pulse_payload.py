from __future__ import annotations

from app.models import KpiSpec
from app.pulse import build_payload


def test_currency_kpi_payload_shape() -> None:
    payload = build_payload(
        tenant_slug="acme",
        industry="retail-ecommerce",
        datasource_id="ds-123",
        kpi=KpiSpec(name="Revenue", type="currency", favorable_direction="up", time_dim="OrderDate"),
    )
    meta = payload["metadata"]
    assert isinstance(meta, dict)
    assert meta["ext_assigned_id"] == "retail-ecommerce-revenue-v1"
    rep = payload["representation_options"]
    assert isinstance(rep, dict)
    assert rep["type"] == "NUMBER_FORMAT_TYPE_CURRENCY"
    assert rep["sentiment_type"] == "SENTIMENT_TYPE_UP_IS_GOOD"


def test_down_is_good_for_negative_kpis() -> None:
    payload = build_payload(
        tenant_slug="acme",
        industry="retail-ecommerce",
        datasource_id="ds",
        kpi=KpiSpec(name="Return Rate", type="percent", favorable_direction="down"),
    )
    rep = payload["representation_options"]
    assert isinstance(rep, dict)
    assert rep["sentiment_type"] == "SENTIMENT_TYPE_DOWN_IS_GOOD"
    assert rep["type"] == "NUMBER_FORMAT_TYPE_PERCENT"


def test_rls_filter_present() -> None:
    payload = build_payload(
        tenant_slug="acme",
        industry="retail-ecommerce",
        datasource_id="ds",
        kpi=KpiSpec(name="Revenue", type="currency", favorable_direction="up"),
    )
    spec = payload["specification"]
    assert isinstance(spec, dict)
    basic = spec["basic_specification"]
    assert isinstance(basic, dict)
    filters = basic["filters"]
    assert isinstance(filters, list) and len(filters) == 1
    first = filters[0]
    assert isinstance(first, dict)
    assert first["user_attribute"] == "TenantId"
