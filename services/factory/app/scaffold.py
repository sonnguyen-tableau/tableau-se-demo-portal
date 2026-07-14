"""`new-tenant` scaffolder — stamp out a per-tenant build folder.

Replaces the "copy an existing scripts/<tenant>/ folder and sed-replace the
name" ritual. Given a company + industry + slug, it generates:

  services/factory/scripts/<slug>/provision_<slug>.py   (uses extract_publish)
  services/factory/scripts/<slug>/<slug>_lib.py          (design tokens + notes)
  services/factory/scripts/<slug>/TALK_TRACK.md
  services/factory/app/generators/<slug>.py              (generator stub)
  + registers the generator in app/generators/__init__.py

The emitted provision script follows the self-contained-extract pattern
(`app.extract_publish.publish_extract_tenant`), so publishing needs NO sqlproxy
hash and NO manual Desktop seed step. Fill in the generator's real tables, then:

  uv run python scripts/<slug>/provision_<slug>.py            # build .tdsx only
  uv run python scripts/<slug>/provision_<slug>.py --publish  # + publish to Cloud

Usage:
  uv run python -m app.scaffold --company "Acme Air" --industry airline-catering \\
      --slug acme [--tables Flights,Meals,Complaints] [--force]

Uses stdlib string.Template only — no cookiecutter dependency.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from string import Template

# services/factory/
_FACTORY_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS_DIR = _FACTORY_ROOT / "scripts"
_GENERATORS_DIR = _FACTORY_ROOT / "app" / "generators"


def _slugify(s: str) -> str:
    out: list[str] = []
    for ch in s.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-")[:48]


def _pascal(slug: str) -> str:
    return "".join(part.capitalize() for part in re.split(r"[-_]+", slug) if part)


# ── File templates ──────────────────────────────────────────────────────────
# $-substitution via string.Template. Literal $ in output is escaped as $$.

_GENERATOR_TMPL = Template(
    '''"""$company synthetic data generator ($industry).

Scaffolded stub — replace the sample tables with the real ones for this tenant.
Each table is a pandas DataFrame; column names become Tableau fields.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class ${pascal}Parameters:
    tenant_id: str = "$slug"
    seed: int = 42
    n_rows: int = 5_000


class ${pascal}Dataset:
    def __init__(self, params: ${pascal}Parameters):
        self.p = params
        self._rng = np.random.default_rng(params.seed)

    def all_tables(self) -> dict[str, pd.DataFrame]:
        """Return {table_name: DataFrame}. TODO: model the real tenant schema."""
        rng = self._rng
        n = self.p.n_rows
        fact = pd.DataFrame(
            {
                "Date": pd.date_range("2025-01-01", periods=n, freq="h"),
                "Category": rng.choice(["A", "B", "C"], size=n),
                "Amount": rng.gamma(2.0, 1000.0, size=n).round(2),
            }
        )
        return {
            $tables_dict
        }


def generate_$slug(params: ${pascal}Parameters | None = None) -> ${pascal}Dataset:
    return ${pascal}Dataset(params or ${pascal}Parameters())
'''
)

_PROVISION_TMPL = Template(
    '''"""$company provisioning — generate -> .hyper -> .tdsx -> publish Cloud datasource.

Self-contained-extract pattern (VACS/ACB): one packaged .hyper, a flat .tds, and
`skip_connection_check=True` on the workbook side — NO sqlproxy hash and NO
manual Desktop seed step required for the portal dashboards to render.

Run:
  uv run python scripts/$slug/provision_$slug.py            # build .tdsx only
  uv run python scripts/$slug/provision_$slug.py --publish  # + publish to Cloud
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))

from app.config import get_settings  # noqa: E402
from app.extract_publish import build_extract_tdsx, publish_extract_tenant  # noqa: E402
from app.generators.$slug import ${pascal}Parameters, generate_$slug  # noqa: E402
from app.hyper import write_hyper  # noqa: E402

DS_NAME = "$slug"
OUT_DIR = Path("/tmp/$slug")
HYPER = OUT_DIR / "$slug.hyper"
PROJECT = "$project"

# Table publish order (dashboard reading order). Must match the generator keys.
TABLES: tuple[str, ...] = ($tables_tuple)


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ds = generate_$slug(${pascal}Parameters(tenant_id="$slug"))
    tables = ds.all_tables()
    for name, df in tables.items():
        print(f"  {name:24s} {len(df):>8,} rows")
    write_hyper(tables, HYPER)
    print(f"hyper -> {HYPER}  ({HYPER.stat().st_size:,} bytes)")
    tdsx = build_extract_tdsx(hyper_path=HYPER, datasource_name=DS_NAME, tables=TABLES)
    print(f"tdsx  -> {tdsx}  ({tdsx.stat().st_size:,} bytes)")
    return ds


def publish():
    result = publish_extract_tenant(
        hyper_path=HYPER,
        datasource_name=DS_NAME,
        project_name=PROJECT,
        tables=TABLES,
        settings=get_settings(),
    )
    if result.skipped:
        print(f"SKIPPED publish: {result.reason}")
    else:
        print(f"PUBLISHED datasource: {result.datasource_name}  id={result.datasource_id}  project={result.project_name}")
    return result


if __name__ == "__main__":
    build()
    if "--publish" in sys.argv:
        publish()
'''
)

_LIB_TMPL = Template(
    '''"""$company workbook builder library (design tokens + helpers).

Author the tenant's dashboards here as self-contained extract-workbooks
(one datasource per table, `skip_connection_check=True` at publish) — see
`.claude/skills/tableau-exec-dashboard` and the reference tenants under
services/factory/scripts/ (vacs, acb, mediamart) for the proven pattern.
"""

from __future__ import annotations

from pathlib import Path

HYPER = Path("/tmp/$slug/$slug.hyper")

# ── Design tokens ($company brand) — replace with the real palette ───────────
BG_PAGE = "#F4F8FA"
BG_CARD = "#FFFFFF"
BRAND   = "$primary"
NAVY    = "#0F2233"
GOOD    = "#2E9E6B"
WARN    = "#E8A317"
BAD     = "#D14343"
'''
)

_TALK_TMPL = Template(
    """# $company — Demo Talk Track ($industry)

**Customer:** $company
**Industry:** $industry
**Tenant slug:** `$slug`   ·   **Tableau folder:** `$project`

## Data set

TODO: describe the tables and the timeframe. Tables scaffolded:
$tables_bullets

## Dashboard flow

### D1 — Overview
- TODO: KPIs + the headline story.

## Talking points

- TODO.
"""
)


def _render_tables_dict(tables: tuple[str, ...]) -> str:
    # First table -> the sample `fact` frame; the rest -> a 1-column stub frame
    # so the generated code runs end-to-end (Hyper rejects zero-column tables).
    lines = [f'"{tables[0]}": fact,']
    for t in tables[1:]:
        lines.append(f'"{t}": pd.DataFrame({{"Id": rng.integers(1, 1000, size=n)}}),  # TODO')
    return "\n            ".join(lines)


def scaffold(*, company: str, industry: str, slug: str, tables: tuple[str, ...], force: bool) -> list[Path]:
    pascal = _pascal(slug)
    project = f"Demo/{company}"
    tables_tuple = ", ".join(f'"{t}"' for t in tables) + ("," if len(tables) == 1 else "")
    tables_bullets = "\n".join(f"- `{t}`" for t in tables)

    subs = {
        "company": company,
        "industry": industry,
        "slug": slug,
        "pascal": pascal,
        "project": project,
        "primary": "#1265B6",
        "tables_tuple": tables_tuple,
        "tables_dict": _render_tables_dict(tables),
        "tables_bullets": tables_bullets,
    }

    script_dir = _SCRIPTS_DIR / slug
    targets: dict[Path, str] = {
        _GENERATORS_DIR / f"{slug}.py": _GENERATOR_TMPL.substitute(subs),
        script_dir / f"provision_{slug}.py": _PROVISION_TMPL.substitute(subs),
        script_dir / f"{slug}_lib.py": _LIB_TMPL.substitute(subs),
        script_dir / "TALK_TRACK.md": _TALK_TMPL.substitute(subs),
    }

    existing = [p for p in targets if p.exists()]
    if existing and not force:
        joined = "\n  ".join(str(p) for p in existing)
        raise SystemExit(f"refusing to overwrite existing files (use --force):\n  {joined}")

    script_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for path, content in targets.items():
        path.write_text(content, encoding="utf-8")
        written.append(path)

    _register_generator(slug)
    return written


def _register_generator(slug: str) -> None:
    """Append `from .<slug> import generate_<slug>` + __all__ entry, idempotently."""
    init = _GENERATORS_DIR / "__init__.py"
    text = init.read_text(encoding="utf-8")
    import_line = f"from .{slug} import generate_{slug}"
    if import_line in text:
        return
    # Insert the import after the last existing generator import.
    lines = text.splitlines()
    last_import = max(
        (i for i, ln in enumerate(lines) if ln.startswith("from .") and " import generate_" in ln),
        default=-1,
    )
    lines.insert(last_import + 1, import_line)
    # Add to __all__ (keep it simple: insert before the closing bracket).
    for i, ln in enumerate(lines):
        if ln.strip() == "]":
            lines.insert(i, f'    "generate_{slug}",')
            break
    init.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Scaffold a new per-tenant build folder.")
    ap.add_argument("--company", required=True, help='Display name, e.g. "Acme Air Catering"')
    ap.add_argument("--industry", required=True, help="Industry slug, e.g. airline-catering")
    ap.add_argument("--slug", default=None, help="Tenant slug (defaults to slugified company)")
    ap.add_argument(
        "--tables",
        default="Fact,DimA,DimB",
        help="Comma-separated table names (dashboard reading order)",
    )
    ap.add_argument("--force", action="store_true", help="Overwrite existing files")
    args = ap.parse_args(argv)

    if not re.fullmatch(r"[a-z0-9-]{2,48}", args.industry):
        raise SystemExit(f"industry must be a kebab-case slug, got {args.industry!r}")
    slug = args.slug or _slugify(args.company)
    if not re.fullmatch(r"[a-z0-9-]{2,48}", slug):
        raise SystemExit(f"slug must be a kebab-case slug, got {slug!r}")
    tables = tuple(t.strip() for t in args.tables.split(",") if t.strip())
    if not tables:
        raise SystemExit("at least one table is required")

    written = scaffold(
        company=args.company,
        industry=args.industry,
        slug=slug,
        tables=tables,
        force=args.force,
    )
    print(f"Scaffolded tenant {slug!r} ({args.industry}):")
    for p in written:
        print(f"  {p.relative_to(_FACTORY_ROOT)}")
    print(
        "\nNext:\n"
        f"  1. Fill in app/generators/{slug}.py with the real tables.\n"
        f"  2. uv run python scripts/{slug}/provision_{slug}.py            # build .tdsx\n"
        f"  3. uv run python scripts/{slug}/provision_{slug}.py --publish  # publish to your site\n"
        f"  4. Author dashboards in scripts/{slug}/{slug}_lib.py.\n"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
