"""Scaffolder CLI — stamps a runnable per-tenant folder from templates.

Redirects the scaffolder's output dirs to a tmp tree so the test never touches
the real scripts/ or generators/. Verifies the emitted generator is valid
Python that produces non-empty tables (the bug that segfaulted Hyper was empty
stub frames), and that the generator gets registered.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import app.scaffold as scaffold


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    # Register before exec so @dataclass introspection (which reads
    # sys.modules[cls.__module__]) resolves.
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_scaffold_emits_runnable_generator(tmp_path, monkeypatch):
    gen_dir = tmp_path / "generators"
    scripts_dir = tmp_path / "scripts"
    gen_dir.mkdir()
    scripts_dir.mkdir()
    # Minimal __init__ the registrar can append to.
    (gen_dir / "__init__.py").write_text(
        '"""gens."""\nfrom .banking import generate_banking\n\n__all__ = [\n    "generate_banking",\n]\n',
        encoding="utf-8",
    )

    monkeypatch.setattr(scaffold, "_GENERATORS_DIR", gen_dir)
    monkeypatch.setattr(scaffold, "_SCRIPTS_DIR", scripts_dir)

    written = scaffold.scaffold(
        company="Acme Air Catering",
        industry="airline-catering",
        slug="acmeair",
        tables=("Flights", "Meals", "Complaints"),
        force=False,
    )

    gen_path = gen_dir / "acmeair.py"
    assert gen_path in written
    assert (scripts_dir / "acmeair" / "provision_acmeair.py").exists()
    assert (scripts_dir / "acmeair" / "acmeair_lib.py").exists()
    assert (scripts_dir / "acmeair" / "TALK_TRACK.md").exists()

    # Registered in the package __init__.
    init_txt = (gen_dir / "__init__.py").read_text()
    assert "from .acmeair import generate_acmeair" in init_txt
    assert '"generate_acmeair",' in init_txt

    # The emitted generator is importable and yields non-empty tables for EVERY
    # table (no zero-column frames — those crash the Hyper writer).
    mod = _load_module(gen_path, "acmeair_gen")
    tables = mod.generate_acmeair().all_tables()
    assert set(tables) == {"Flights", "Meals", "Complaints"}
    for name, df in tables.items():
        assert len(df) > 0, name
        assert len(df.columns) > 0, name


def test_scaffold_refuses_overwrite_without_force(tmp_path, monkeypatch):
    gen_dir = tmp_path / "generators"
    scripts_dir = tmp_path / "scripts"
    gen_dir.mkdir()
    scripts_dir.mkdir()
    (gen_dir / "__init__.py").write_text("__all__ = [\n]\n", encoding="utf-8")
    monkeypatch.setattr(scaffold, "_GENERATORS_DIR", gen_dir)
    monkeypatch.setattr(scaffold, "_SCRIPTS_DIR", scripts_dir)

    kw = dict(company="Dup Co", industry="telecom", slug="dupco", tables=("A",), force=False)
    scaffold.scaffold(**kw)  # first time OK
    import pytest

    with pytest.raises(SystemExit):
        scaffold.scaffold(**kw)  # second time refuses
