"""Stage-8 workbook contract tests.

These tests run with no Tableau credentials — they exercise the template
loading, validation, and XML rewrite logic only. The actual `publish_workbook`
call is covered by integration tests gated on TABLEAU_PAT_SECRET.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.workbook import (
    TEMPLATES_DIR,
    TemplateContractError,
    rewrite_for_tenant,
    template_path_for,
    validate_template,
)


def test_retail_template_exists_and_validates():
    p = template_path_for("retail-ecommerce")
    assert p is not None and p.exists(), "retail-ecommerce.twb must ship with the factory"
    # Must not raise.
    validate_template(p, "retail-ecommerce")


def test_unknown_industry_returns_none():
    assert template_path_for("does-not-exist") is None


def test_missing_rls_predicate_is_rejected(tmp_path: Path):
    src = TEMPLATES_DIR / "retail-ecommerce.twb"
    bad = src.read_text().replace(
        '[TenantId] = USERATTRIBUTE(&quot;TenantId&quot;) OR USERATTRIBUTE(&quot;TenantId&quot;) = &quot;internal&quot;',
        '1 = 1',
    )
    target = tmp_path / "retail-ecommerce.twb"
    target.write_text(bad)
    # Reach into validate_template by pointing at the tampered file.
    with pytest.raises(TemplateContractError, match="RLS predicate"):
        validate_template(target, "retail-ecommerce")


def test_missing_dbname_marker_is_rejected(tmp_path: Path):
    src = TEMPLATES_DIR / "retail-ecommerce.twb"
    bad = src.read_text().replace("__FACTORY_DATASOURCE__", "hardcoded-name")
    target = tmp_path / "retail-ecommerce.twb"
    target.write_text(bad)
    with pytest.raises(TemplateContractError, match="FACTORY_DATASOURCE"):
        validate_template(target, "retail-ecommerce")


def test_unknown_field_reference_is_rejected(tmp_path: Path):
    """Inject a reference to a column not present in the schema and assert
    the validator catches it. The tenant filter guarding RLS must remain.
    """
    src = TEMPLATES_DIR / "retail-ecommerce.twb"
    raw = src.read_text()
    # Replace the [OrderDate] reference inside <cols> with a nonexistent field.
    bad = raw.replace(
        "<cols>[federated.retail].[OrderDate]</cols>",
        "<cols>[federated.retail].[NotInSchema]</cols>",
    )
    target = tmp_path / "retail-ecommerce.twb"
    target.write_text(bad)
    with pytest.raises(TemplateContractError, match="not in"):
        validate_template(target, "retail-ecommerce")


def test_rewrite_substitutes_dbname(tmp_path: Path):
    src = template_path_for("retail-ecommerce")
    assert src is not None
    out = rewrite_for_tenant(src, datasource_name="acme-retail-2026", out_dir=tmp_path)
    rewritten = out.read_text()
    assert "__FACTORY_DATASOURCE__" not in rewritten
    assert "dbname='acme-retail-2026'" in rewritten
    # The RLS predicate must survive the rewrite untouched.
    assert 'USERATTRIBUTE(&quot;TenantId&quot;)' in rewritten


def test_rewrite_does_not_mutate_template_on_disk(tmp_path: Path):
    src = template_path_for("retail-ecommerce")
    assert src is not None
    before = src.read_text()
    rewrite_for_tenant(src, datasource_name="some-ds", out_dir=tmp_path)
    after = src.read_text()
    assert before == after
