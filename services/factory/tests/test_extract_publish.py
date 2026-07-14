"""C4 self-contained extract publisher + legacy seed-probe extraction.

Covers the offline-testable surface: the flat .tds XML shape, the .tdsx zip
contents, the credentials-missing skip path, and the seed-block regex parser.
"""

from __future__ import annotations

import zipfile

from app.config import Settings
from app.extract_publish import (
    build_extract_tdsx,
    build_flat_tds_xml,
    publish_extract_tenant,
)
from app.seed_probe import _extract_from_twb_bytes


TABLES = ("Airlines", "Routes", "Complaints")


def test_flat_tds_lists_every_table_under_one_hyperconn():
    xml = build_flat_tds_xml(
        datasource_name="acme", hyper_filename="acme.hyper", tables=TABLES
    ).decode()
    assert 'class="hyper"' in xml
    assert 'dbname="Data/Datasources/acme.hyper"' in xml
    for t in TABLES:
        assert f'name="{t}"' in xml
        assert f"[Extract].[{t}]" in xml
    # exactly one named-connection / hyper connection
    assert xml.count('name="hyperconn"') == 1


def test_build_extract_tdsx_zip_contents(tmp_path):
    hyper = tmp_path / "acme.hyper"
    hyper.write_bytes(b"fake-hyper-bytes")
    tdsx = build_extract_tdsx(hyper_path=hyper, datasource_name="acme", tables=TABLES)

    assert tdsx.exists() and tdsx.suffix == ".tdsx"
    with zipfile.ZipFile(tdsx) as zf:
        names = zf.namelist()
    assert "acme.tds" in names
    assert "Data/Datasources/acme.hyper" in names


def test_publish_skips_without_credentials(tmp_path):
    hyper = tmp_path / "acme.hyper"
    hyper.write_bytes(b"fake")
    settings = Settings(
        portal_env="dev", anthropic_api_key=None,
        tableau_site_url=None, tableau_site_name=None,
        tableau_pat_name=None, tableau_pat_secret=None,
        target_row_count=200_000,
    )
    result = publish_extract_tenant(
        hyper_path=hyper, datasource_name="acme", project_name="Demo/Acme",
        tables=TABLES, settings=settings,
    )
    # No creds → skipped, but the .tdsx is still built for inspection.
    assert result.skipped is True
    assert result.tdsx_path.exists()
    assert result.datasource_id == ""


def test_seed_probe_extracts_hash_and_block():
    twb = (
        "<workbook><datasources>"
        "<datasource caption='acme' name='sqlproxy.abc123xyz' />"
        "</datasources></workbook>"
    )
    name, block = _extract_from_twb_bytes(twb)
    assert name == "sqlproxy.abc123xyz"
    assert block is not None and block.startswith("<datasources>")
    assert block.endswith("</datasources>")


def test_seed_probe_returns_none_when_absent():
    name, block = _extract_from_twb_bytes("<workbook><worksheets/></workbook>")
    assert name is None
    assert block is None
