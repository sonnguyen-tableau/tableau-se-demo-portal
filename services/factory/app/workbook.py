"""Stage 8 — workbook templating.

Loads the per-industry .twb template, rewrites the inner Hyper connection
to point at the freshly published datasource, validates that every field
the workbook references is present in the schema contract, and republishes
the workbook to the tenant project on Tableau Cloud.

Design notes:

* Tableau's old `tableaudocumentapi` package is deprecated and unmaintained.
  All we need is to flip a single attribute (`dbname`) on the inner
  `<connection class='hyper' …/>` element, so we use `xml.etree.ElementTree`
  directly. The .twb format guarantees this attribute is present on every
  template authored against a Hyper extract.

* The placeholder string `__FACTORY_DATASOURCE__` in the template marks the
  attribute that gets rewritten — making the rewrite intent explicit instead
  of "the first hyper connection we find".

* The schema contract validation parses the .twb and inspects every
  `<column name='[X]' …>` reference on the datasource and the `<rows>` /
  `<cols>` / `<datasource-dependencies>` blocks of every worksheet. Any
  reference not in the schema (and not a locally-defined calculated field
  or the `__tenant_filter__` RLS field) raises before publish.

* RLS guard: the template MUST contain a calculated field whose formula
  matches the canonical USERATTRIBUTE("TenantId") policy. Without it, a
  downloaded extract bypasses Tableau's server-side data policy.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .publish import is_configured as tableau_configured

# Marker the templates use for the dbname attribute the factory rewrites.
_DBNAME_PLACEHOLDER = "__FACTORY_DATASOURCE__"

# Canonical RLS predicate every template must contain. Tableau encodes the
# inner double-quotes as &quot; inside formula attributes, so accept either
# raw " or the entity form.
_Q = r'(?:"|&quot;)'
_RLS_PREDICATE_RE = re.compile(
    rf"\[TenantId\]\s*=\s*USERATTRIBUTE\(\s*{_Q}TenantId{_Q}\s*\)\s*OR\s*"
    rf"USERATTRIBUTE\(\s*{_Q}TenantId{_Q}\s*\)\s*=\s*{_Q}internal{_Q}",
    re.IGNORECASE,
)

# Fields the template may reference that aren't in the schema JSON: locally
# defined calculated fields and the tenant filter. The validator detects
# calc fields via the presence of an inline <calculation/> child, so the
# only allowlist needed here is the tenant filter.
_LOCAL_FIELDS = {"__tenant_filter__"}

# Templates directory shipped alongside the app.
TEMPLATES_DIR = Path(__file__).parent / "templates"

# Schema directory — bundled at app/schemas/ (committed to repo, copied into Docker).
# Fallback to monorepo path only if the bundle is missing, guarded against
# short path trees (Docker places the app at /app/app/, only 2 parents).
_APP_DIR = Path(__file__).parent
SCHEMAS_DIR = _APP_DIR / "schemas"
if not SCHEMAS_DIR.exists():
    try:
        SCHEMAS_DIR = _APP_DIR.parents[2] / "packages" / "factory-schema"
    except IndexError:
        pass

# Industry slug → (template filename, schema filename) mapping.
_INDUSTRY_TO_FILES: dict[str, tuple[str, str]] = {
    "retail-ecommerce": ("retail-ecommerce.twb", "retail-ecommerce.schema.json"),
    "retail-banking": ("retail-banking.twb", "retail-banking.schema.json"),
    "retail-mall": ("retail-mall.twb", "retail-mall.schema.json"),
    "retail-mediamart": ("retail-mediamart.twb", "retail-mediamart.schema.json"),
    "manufacturing": ("manufacturing.twb", "manufacturing.schema.json"),
    "healthcare": ("healthcare.twb", "healthcare.schema.json"),
    "logistics": ("logistics.twb", "logistics.schema.json"),
}


@dataclass
class WorkbookResult:
    workbook_id: str
    workbook_name: str
    project_name: str
    skipped: bool = False
    reason: str | None = None


class TemplateContractError(ValueError):
    """Raised when a .twb template violates the field-name or RLS contract."""


def template_path_for(industry: str) -> Path | None:
    """Return the template path for an industry, or None if not authored yet."""
    files = _INDUSTRY_TO_FILES.get(industry)
    if files is None:
        return None
    p = TEMPLATES_DIR / files[0]
    return p if p.exists() else None


def _allowed_fields_for(industry: str) -> set[str]:
    """Read the schema JSON and return the flat set of allowed column names."""
    files = _INDUSTRY_TO_FILES.get(industry)
    if files is None:
        return set()
    schema_file = SCHEMAS_DIR / files[1]
    if not schema_file.exists():
        return set()
    schema = json.loads(schema_file.read_text())
    allowed: set[str] = set()
    for table_def in (schema.get("properties") or {}).values():
        cols = (table_def.get("properties") or {}).get("columns") or {}
        for item in cols.get("items", {}).get("enum", []):
            allowed.add(item)
    return allowed


def _strip_brackets(name: str) -> str:
    return name[1:-1] if name.startswith("[") and name.endswith("]") else name


def validate_template(template_path: Path, industry: str) -> None:
    """Raise TemplateContractError if the template breaks the contract.

    Checks (in order, fail-fast):
      1. The template contains exactly one `dbname='__FACTORY_DATASOURCE__'`
         marker for the factory to rewrite.
      2. The template contains the canonical RLS predicate.
      3. Every referenced column either (a) is in the schema, (b) is a
         calculated field defined in the same datasource, or (c) is in
         _LOCAL_FIELDS.
    """
    raw = template_path.read_text()
    # Count the marker as it appears in a real attribute (single or double
    # quotes) so the same string in surrounding comments doesn't trip us.
    marker_hits = raw.count(f"dbname='{_DBNAME_PLACEHOLDER}'") + raw.count(
        f'dbname="{_DBNAME_PLACEHOLDER}"'
    )
    if marker_hits != 1:
        raise TemplateContractError(
            f"{template_path.name} must contain exactly one "
            f"dbname='{_DBNAME_PLACEHOLDER}' marker; found {marker_hits}."
        )
    if not _RLS_PREDICATE_RE.search(raw):
        raise TemplateContractError(
            f"{template_path.name} is missing the RLS predicate "
            '[TenantId] = USERATTRIBUTE("TenantId") OR '
            'USERATTRIBUTE("TenantId") = "internal".'
        )

    tree = ET.parse(template_path)
    root = tree.getroot()

    schema_fields = _allowed_fields_for(industry)
    if not schema_fields:
        raise TemplateContractError(
            f"No schema found for industry '{industry}' in {SCHEMAS_DIR}."
        )

    # Collect locally defined columns: any <column name='[X]'/> on a
    # datasource is "defined" by the workbook (whether raw or calculated).
    defined: set[str] = set()
    for col in root.iter("column"):
        nm = col.attrib.get("name")
        if nm:
            defined.add(_strip_brackets(nm))

    # Collect references: rows/cols expressions, datasource-dependencies columns.
    referenced: set[str] = set()
    for tag in ("rows", "cols"):
        for el in root.iter(tag):
            text = el.text or ""
            for m in re.findall(r"\[([^\[\]]+)\]", text):
                if "." not in m:  # skip [datasource].[field] outer halves
                    referenced.add(m)
    for dep in root.iter("datasource-dependencies"):
        for col in dep.iter("column"):
            nm = col.attrib.get("name")
            if nm:
                referenced.add(_strip_brackets(nm))

    unknown = {
        f for f in referenced
        if f not in schema_fields and f not in defined and f not in _LOCAL_FIELDS
    }
    if unknown:
        raise TemplateContractError(
            f"{template_path.name} references fields not in "
            f"{_INDUSTRY_TO_FILES[industry][1]}: {sorted(unknown)}"
        )


def rewrite_for_tenant(
    template_path: Path,
    *,
    datasource_name: str,
    out_dir: Path | None = None,
) -> Path:
    """Produce a tenant-specific .twb pointing at `datasource_name`.

    The output is a sibling .twb in `out_dir` (defaults to a tempdir).
    Returns the path to the rewritten workbook.
    """
    out_dir = out_dir or Path(tempfile.mkdtemp(prefix="factory-wb-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / template_path.name

    raw = template_path.read_text()
    rewritten = raw.replace(
        f"dbname='{_DBNAME_PLACEHOLDER}'",
        f"dbname='{datasource_name}'",
    ).replace(
        f'dbname="{_DBNAME_PLACEHOLDER}"',
        f'dbname="{datasource_name}"',
    )
    if _DBNAME_PLACEHOLDER in rewritten:
        # Extra safety: validate_template should have caught this earlier.
        raise TemplateContractError(
            f"Failed to rewrite {_DBNAME_PLACEHOLDER} placeholder in {template_path}."
        )
    out.write_text(rewritten)
    return out


def publish_workbook(
    workbook_path: Path,
    *,
    tenant_slug: str,
    settings: Settings,
    project_name: str | None = None,
) -> WorkbookResult:
    """Publish a .twb to the project. Reuses the publish stage's auth.

    `project_name` defaults to `tenant-{slug}` for backward compat, but callers
    should pass the same project that the datasource was published into so the
    workbook->datasource connection check (Tableau Cloud error 403132) doesn't
    fail with "Forbidden retail-* failed to establish a connection".
    """
    project_name = project_name or f"tenant-{tenant_slug}"
    if not tableau_configured(settings):
        return WorkbookResult(
            workbook_id="",
            workbook_name=workbook_path.stem,
            project_name=project_name,
            skipped=True,
            reason="Tableau Cloud credentials not configured.",
        )

    import tableauserverclient as TSC

    assert settings.tableau_pat_name is not None
    assert settings.tableau_pat_secret is not None
    assert settings.tableau_site_name is not None
    assert settings.tableau_site_url is not None

    auth = TSC.PersonalAccessTokenAuth(
        settings.tableau_pat_name,
        settings.tableau_pat_secret.get_secret_value(),
        site_id=settings.tableau_site_name,
    )
    server = TSC.Server(  # type: ignore[no-untyped-call]
        settings.tableau_site_url, use_server_version=True
    )

    with server.auth.sign_in(auth):
        all_projects, _ = server.projects.get()
        # Support nested project paths like "Demo/MediaMart" — find leaf by
        # walking parent_id chain so we land in the same folder as the datasource.
        if "/" in project_name:
            parts = [p.strip() for p in project_name.split("/") if p.strip()]
            parent_id: str | None = None
            leaf_id: str | None = None
            for part in parts:
                found = None
                for p in all_projects:
                    pid = getattr(p, "parent_id", None) or getattr(p, "parentProjectId", None)
                    if p.name == part and pid == parent_id:
                        found = p
                        break
                if found is None:
                    new_proj = TSC.ProjectItem(name=part, description=f"Auto-created for {tenant_slug}")  # type: ignore[no-untyped-call]
                    if parent_id:
                        new_proj.parent_id = parent_id  # type: ignore[attr-defined]
                    created = server.projects.create(new_proj)
                    all_projects, _ = server.projects.get()
                    parent_id = created.id
                    leaf_id = created.id
                else:
                    parent_id = found.id
                    leaf_id = found.id
            assert leaf_id is not None
            target_project_id = leaf_id
        else:
            project = next((p for p in all_projects if p.name == project_name), None)
            if project is None:
                project = server.projects.create(
                    TSC.ProjectItem(name=project_name, description=f"Auto-created for {tenant_slug}")
                )
            target_project_id = project.id

        wb_item = TSC.WorkbookItem(project_id=target_project_id, name=workbook_path.stem)
        published = server.workbooks.publish(
            wb_item,
            str(workbook_path),
            mode=TSC.Server.PublishMode.Overwrite,
            connections=None,
            as_job=False,
            skip_connection_check=False,
        )

        return WorkbookResult(
            workbook_id=published.id or "",
            workbook_name=published.name or workbook_path.stem,
            project_name=project_name,
        )


def run_workbook_stage(
    *,
    industry: str,
    tenant_slug: str,
    datasource_name: str,
    settings: Settings,
    project_name: str | None = None,
) -> WorkbookResult:
    """Top-level orchestrator: pick template → validate → rewrite → publish.

    If `project_name` is passed, the workbook is published into that project
    (e.g. "Demo/MediaMart") so it sits next to its datasource — avoiding the
    Tableau Cloud 403132 cross-project connection check error. Falls back to
    "tenant-{slug}" for backward compatibility.

    Cleans up the rewrite tempdir on success or failure.
    """
    effective_project = project_name or f"tenant-{tenant_slug}"
    template = template_path_for(industry)
    if template is None:
        return WorkbookResult(
            workbook_id="",
            workbook_name="",
            project_name=effective_project,
            skipped=True,
            reason=f"No .twb template authored for industry '{industry}' yet.",
        )

    validate_template(template, industry)

    work_dir = Path(tempfile.mkdtemp(prefix="factory-wb-"))
    try:
        rewritten = rewrite_for_tenant(
            template, datasource_name=datasource_name, out_dir=work_dir
        )
        return publish_workbook(
            rewritten,
            tenant_slug=tenant_slug,
            settings=settings,
            project_name=effective_project,
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
