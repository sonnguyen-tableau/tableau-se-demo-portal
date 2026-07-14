"""Legacy seed-block helper — extract the `sqlproxy.<hash>` datasource name and
the `<datasources>` XML block from a published seed workbook.

WHEN YOU NEED THIS: only for the *legacy federated live-connection* path, where
a tenant's hand-authored workbook binds to a published `sqlproxy.<hash>`
datasource (the name Tableau Cloud assigns per-site, e.g. nam-a-bank / meygroup).
That name can't be predicted, so historically you opened the published
datasource in Tableau Desktop, published a 1-sheet `_seed_desktop` workbook,
downloaded it, and hand-copied the `<datasources>` block + the hash. This script
automates the download-and-extract half of that ritual.

PREFER THE SELF-CONTAINED PATH INSTEAD: new tenants should use
`extract_publish.publish_extract_tenant` (VACS/ACB pattern) — a self-contained
extract workbook that renders with `skip_connection_check=True` and needs NO
sqlproxy hash at all. Reach for this probe only when you specifically need the
live federated datasource shape.

Usage:
  uv run python -m app.seed_probe --workbook _seed_desktop [--project "Demo/Acme"] \\
      [--out /tmp/acme-seed-block.xml]

Credentials are read from the factory .env via Settings; pass --site-name etc.
to override for a one-off different site.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from .config import Settings, get_settings, resolve_tableau
from .models import TableauTarget


def _extract_from_twb_bytes(twb_xml: str) -> tuple[str | None, str | None]:
    """Return (sqlproxy_name, datasources_block) from a .twb XML string.

    sqlproxy_name is the first `sqlproxy.<hash>` datasource `name=`; the block is
    the entire `<datasources>...</datasources>` element (verbatim) ready to save.
    """
    block_match = re.search(r"<datasources>.*?</datasources>", twb_xml, re.DOTALL)
    block = block_match.group(0) if block_match else None

    name_match = re.search(r'name=[\'"](sqlproxy\.[0-9a-z]+)[\'"]', twb_xml)
    name = name_match.group(1) if name_match else None
    return name, block


def _read_twb_from_download(path: Path) -> str:
    """Read the .twb XML whether the download is a bare .twb or a .twbx zip."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            twb_name = next((n for n in zf.namelist() if n.endswith(".twb")), None)
            if twb_name is None:
                raise ValueError("no .twb found inside the downloaded .twbx")
            return zf.read(twb_name).decode("utf-8", errors="replace")
    return path.read_text(encoding="utf-8", errors="replace")


def fetch_seed_block(
    *, workbook_name: str, project_name: str | None, settings: Settings
) -> tuple[str | None, str | None]:
    """Download `workbook_name` from Tableau Cloud and extract (name, block)."""
    import tableauserverclient as TSC

    if settings.tableau_pat_name is None or settings.tableau_pat_secret is None:
        raise SystemExit("Tableau credentials not configured (TABLEAU_PAT_NAME/SECRET).")

    auth = TSC.PersonalAccessTokenAuth(
        settings.tableau_pat_name,
        settings.tableau_pat_secret.get_secret_value(),
        site_id=settings.tableau_site_name,
    )
    server = TSC.Server(settings.tableau_site_url, use_server_version=True)  # type: ignore[no-untyped-call]

    with server.auth.sign_in(auth):
        leaf = (project_name or "").rstrip("/").split("/")[-1]
        matches = [
            wb
            for wb in TSC.Pager(server.workbooks)
            if wb.name == workbook_name and (not leaf or wb.project_name == leaf)
        ]
        if not matches:
            raise SystemExit(
                f"workbook {workbook_name!r} not found"
                + (f" in project {project_name!r}" if project_name else "")
            )
        wb = matches[0]
        if wb.id is None:
            raise SystemExit(f"workbook {workbook_name!r} has no id")
        with tempfile.TemporaryDirectory() as tmp:
            dest = server.workbooks.download(wb.id, filepath=tmp, include_extract=False)
            twb_xml = _read_twb_from_download(Path(dest))
    return _extract_from_twb_bytes(twb_xml)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Extract sqlproxy hash + <datasources> block from a seed workbook.")
    ap.add_argument("--workbook", required=True, help="Published seed workbook name (e.g. _seed_desktop)")
    ap.add_argument("--project", default=None, help='Project path to disambiguate (e.g. "Demo/Acme")')
    ap.add_argument("--out", default=None, help="Write the <datasources> block to this file")
    ap.add_argument("--site-url", default=None, help="Override TABLEAU_SITE_URL for this run")
    ap.add_argument("--site-name", default=None, help="Override TABLEAU_SITE_NAME for this run")
    ap.add_argument("--pat-name", default=None, help="Override TABLEAU_PAT_NAME for this run")
    ap.add_argument("--pat-secret", default=None, help="Override TABLEAU_PAT_SECRET for this run")
    args = ap.parse_args(argv)

    target = TableauTarget(
        site_url=args.site_url,
        site_name=args.site_name,
        pat_name=args.pat_name,
        pat_secret=args.pat_secret,
    )
    settings = resolve_tableau(get_settings(), target)

    name, block = fetch_seed_block(
        workbook_name=args.workbook, project_name=args.project, settings=settings
    )

    if name is None:
        print("WARNING: no sqlproxy.<hash> datasource found in the workbook.", file=sys.stderr)
    else:
        print(f'DS_NAME = "{name}"')

    if block is None:
        print("WARNING: no <datasources> block found in the workbook.", file=sys.stderr)
        return 1

    if args.out:
        Path(args.out).write_text(block, encoding="utf-8")
        print(f"wrote <datasources> block -> {args.out}  ({len(block):,} bytes)", file=sys.stderr)
    else:
        print(block)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
