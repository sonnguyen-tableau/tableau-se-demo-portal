"""Stage 6.5 — package a multi-table .hyper extract into a .tdsx.

Tableau Cloud rejects bare .hyper uploads with more than one table
("must contain exactly one fact table"). A .tdsx (Tableau Datasource Bundle)
is a zip containing:

  Data/Datasources/<name>.hyper
  <name>.tds                    # XML describing the data source + relationships

When uploaded, Tableau reads the .tds to learn the joins/relationships
between the multiple tables in the .hyper.

Per-industry .tds templates live in `app/templates/<industry>.tds` and use
the Tableau 2020.2+ Object Model (`_.fcp.ObjectModelEncapsulateLegacy.true`)
so the new-style relationships canvas renders the FK graph instead of the
legacy "Migrated Data" single-object view. The factory rewrites
`__FACTORY_DATASOURCE__` to the in-zip path of the .hyper at packaging time.

Industries without a hand-authored template fall back to the legacy flat
sibling-`<relation>` emitter (`build_tds_xml`); that path renders as
"Migrated Data" but still publishes successfully, which is good enough for
unfinished generators.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

from .models import Industry


@dataclass(frozen=True)
class Rel:
    """One foreign-key edge: child.col = parent.col."""

    child_table: str
    parent_table: str
    join_col: str  # same column name on both sides (the FK)


@dataclass(frozen=True)
class IndustryGraph:
    fact: str
    tables: tuple[str, ...]
    relationships: tuple[Rel, ...]


_INDUSTRY_GRAPHS: dict[Industry, IndustryGraph] = {
    Industry.banking: IndustryGraph(
        fact="Transactions",
        tables=("Transactions", "Accounts", "Customers", "Branches", "Products", "Loans"),
        relationships=(
            Rel("Transactions", "Accounts", "AccountId"),
            Rel("Accounts", "Customers", "CustomerId"),
            Rel("Accounts", "Products", "ProductId"),
            Rel("Accounts", "Branches", "BranchId"),
            Rel("Loans", "Customers", "CustomerId"),
            Rel("Loans", "Products", "ProductId"),
        ),
    ),
    Industry.retail: IndustryGraph(
        fact="OrderLines",
        tables=("OrderLines", "Orders", "Customers", "Stores", "Channels", "Products"),
        relationships=(
            Rel("OrderLines", "Orders", "OrderId"),
            Rel("OrderLines", "Products", "ProductId"),
            Rel("Orders", "Customers", "CustomerId"),
            Rel("Orders", "Stores", "StoreId"),
            Rel("Orders", "Channels", "ChannelId"),
        ),
    ),
    Industry.mediamart: IndustryGraph(
        # MediaMart Control Tower: same OrderLines spine as retail, plus a
        # current-snapshot Inventory table joined to Stores (and to Products
        # via Category, treated as a soft join — Tableau-side relationship
        # on Category is sufficient for the OOS scenario).
        fact="OrderLines",
        tables=(
            "OrderLines",
            "Orders",
            "Customers",
            "Stores",
            "Channels",
            "Products",
            "Inventory",
        ),
        relationships=(
            Rel("OrderLines", "Orders", "OrderId"),
            Rel("OrderLines", "Products", "ProductId"),
            Rel("Orders", "Customers", "CustomerId"),
            Rel("Orders", "Stores", "StoreId"),
            Rel("Orders", "Channels", "ChannelId"),
            Rel("Inventory", "Stores", "StoreId"),
        ),
    ),
    Industry.manufacturing: IndustryGraph(
        fact="ProductionRuns",
        tables=("ProductionRuns", "Lines", "Plants", "Products", "Defects", "Suppliers", "Shipments"),
        relationships=(
            Rel("ProductionRuns", "Lines", "LineId"),
            Rel("ProductionRuns", "Products", "ProductId"),
            Rel("Lines", "Plants", "PlantId"),
            Rel("Defects", "ProductionRuns", "RunId"),
            Rel("Shipments", "Plants", "PlantId"),
            Rel("Shipments", "Suppliers", "SupplierId"),
        ),
    ),
    Industry.healthcare: IndustryGraph(
        fact="Encounters",
        tables=("Encounters", "Patients", "Providers", "Departments", "Procedures", "Claims", "Beds"),
        relationships=(
            Rel("Encounters", "Patients", "PatientId"),
            Rel("Encounters", "Providers", "ProviderId"),
            Rel("Encounters", "Departments", "DepartmentId"),
            Rel("Encounters", "Procedures", "ProcedureId"),
            Rel("Providers", "Departments", "DepartmentId"),
            Rel("Beds", "Departments", "DepartmentId"),
            Rel("Claims", "Encounters", "EncounterId"),
        ),
    ),
    Industry.logistics: IndustryGraph(
        fact="Shipments",
        tables=("Shipments", "Lanes", "Customers", "Carriers", "Vehicles", "Hubs", "Routes"),
        relationships=(
            Rel("Shipments", "Lanes", "LaneId"),
            Rel("Shipments", "Customers", "CustomerId"),
            Rel("Shipments", "Carriers", "CarrierId"),
            Rel("Shipments", "Vehicles", "VehicleId"),
            Rel("Vehicles", "Carriers", "CarrierId"),
            Rel("Routes", "Vehicles", "VehicleId"),
        ),
    ),
}


# Industry → filename of the hand-authored .tds template (Object-Model 2020.2+).
# Industries missing here fall back to the programmatic flat-relation emitter.
_TEMPLATES_DIR = Path(__file__).parent / "templates"
_INDUSTRY_TO_TDS_TEMPLATE: dict[Industry, str] = {
    Industry.banking: "retail-banking.tds",
}

# Sentinel substituted by the factory at packaging time.
_DBNAME_PLACEHOLDER = "__FACTORY_DATASOURCE__"


def graph_for(industry: Industry) -> IndustryGraph | None:
    return _INDUSTRY_GRAPHS.get(industry)


def _load_tds_template(industry: Industry, *, hyper_filename: str) -> bytes | None:
    """Return the rendered .tds bytes for `industry`, or None if no template exists."""
    name = _INDUSTRY_TO_TDS_TEMPLATE.get(industry)
    if name is None:
        return None
    path = _TEMPLATES_DIR / name
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8")
    rendered = raw.replace(_DBNAME_PLACEHOLDER, f"Data/Datasources/{hyper_filename}")
    return rendered.encode("utf-8")


def build_tds_xml(*, datasource_name: str, hyper_filename: str, graph: IndustryGraph) -> bytes:
    """Fallback emitter — flat sibling-`<relation>` list (legacy view).

    Used only for industries whose hand-authored Object-Model template has not
    been written yet. Tableau renders this as a single "Migrated Data" object
    rather than the multi-table relationships canvas.
    """
    ds = Element(
        "datasource",
        attrib={
            "formatted-name": datasource_name,
            "inline": "true",
            "version": "18.1",
        },
    )
    conn = SubElement(ds, "connection", attrib={"class": "federated"})
    named_conns = SubElement(conn, "named-connections")
    nc = SubElement(
        named_conns,
        "named-connection",
        attrib={"caption": datasource_name, "name": "hyperconn"},
    )
    SubElement(
        nc,
        "connection",
        attrib={
            "class": "hyper",
            "authentication": "auth-none",
            "dbname": f"Data/Datasources/{hyper_filename}",
            "schema": "Extract",
            "server": "",
            "default-settings": "yes",
        },
    )

    for t in graph.tables:
        SubElement(
            conn,
            "relation",
            attrib={
                "connection": "hyperconn",
                "name": t,
                "table": f"[Extract].[{t}]",
                "type": "table",
            },
        )

    return b'<?xml version="1.0" encoding="utf-8" ?>\n' + tostring(ds, encoding="utf-8")


def package_tdsx(
    *,
    hyper_path: Path,
    datasource_name: str,
    industry: Industry,
    output_path: Path | None = None,
) -> Path:
    """Bundle a .hyper + per-industry .tds into a .tdsx zip ready for upload.

    Prefers the hand-authored Object-Model template (`templates/<industry>.tds`)
    so Tableau renders the multi-table relationships canvas; falls back to the
    programmatic flat-relation emitter for industries without a template yet.
    """
    if output_path is None:
        output_path = hyper_path.with_suffix(".tdsx")

    tds_xml = _load_tds_template(industry, hyper_filename=hyper_path.name)
    if tds_xml is None:
        graph = graph_for(industry)
        if graph is None:
            raise ValueError(f"No .tds template or relationship graph for industry {industry.value!r}")
        tds_xml = build_tds_xml(
            datasource_name=datasource_name,
            hyper_filename=hyper_path.name,
            graph=graph,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{datasource_name}.tds", tds_xml)
        zf.write(hyper_path, arcname=f"Data/Datasources/{hyper_path.name}")

    return output_path
