"""Emit Tableau `<metadata-records>` for a self-contained federated-extract .tds.

WHY: our hand-authored extract .tds (VACS/SHB/VNPT/MediaMart technique) carries
only <relation> elements — no per-column metadata. The Tableau **Metadata
Catalog** indexes fields FROM metadata-records; without them it indexes 0 fields,
and Tableau **Pulse** (which resolves fields via the Catalog, not VizQL) returns
404 vcode 404904 on every field reference. Baking metadata-records in makes the
datasource Catalog-indexable — and therefore Pulse-eligible — with NO Desktop
round-trip.

Type-code mapping verified against a Desktop-published, Catalog-indexed extract
(nam-a-bank): pandas dtype → (local-type, remote-type, default aggregation).
"""
from __future__ import annotations

from xml.sax.saxutils import escape

import pandas as pd

# pandas dtype string → (local-type, remote-type code, default aggregation)
# remote-type codes are Tableau's OLEDB-ish type ids seen in real .tds files.
_DTYPE_MAP: dict[str, tuple[str, str, str]] = {
    "int64":  ("integer", "20", "Sum"),
    "int32":  ("integer", "3", "Sum"),
    "int16":  ("integer", "3", "Sum"),
    "int8":   ("integer", "3", "Sum"),
    "float64": ("real", "5", "Sum"),
    "float32": ("real", "5", "Sum"),
    "bool":   ("boolean", "11", "Count"),
    "object": ("string", "129", "Count"),
    "string": ("string", "129", "Count"),
    "str":    ("string", "129", "Count"),
}


def _resolve(dtype: str) -> tuple[str, str, str]:
    if dtype in _DTYPE_MAP:
        return _DTYPE_MAP[dtype]
    if "datetime" in dtype:
        return ("datetime", "135", "Year")
    if "date" in dtype:
        return ("date", "133", "Year")
    return ("string", "129", "Count")  # safe fallback


def build_metadata_records(tables: dict[str, pd.DataFrame]) -> str:
    """Return the full <metadata-records>…</metadata-records> XML string.

    One <metadata-record class='column'> per (table, column). local-name and
    parent-name use bare names; object-id ties the column to its relation so the
    Catalog groups fields under the right logical table.
    """
    parts: list[str] = ["<metadata-records>"]
    for table_name, df in tables.items():
        object_id = f"[{table_name}_{table_name}]"
        for ordinal, (col, dtype) in enumerate(df.dtypes.items()):
            local_type, remote_type, agg = _resolve(str(dtype))
            col_s = escape(str(col))
            rec = [
                "  <metadata-record class='column'>",
                f"    <remote-name>{col_s}</remote-name>",
                f"    <remote-type>{remote_type}</remote-type>",
                f"    <local-name>[{col_s}]</local-name>",
                f"    <parent-name>[{escape(table_name)}]</parent-name>",
                f"    <remote-alias>{col_s}</remote-alias>",
                f"    <ordinal>{ordinal}</ordinal>",
                f"    <local-type>{local_type}</local-type>",
                f"    <aggregation>{agg}</aggregation>",
                "    <contains-null>true</contains-null>",
            ]
            if local_type == "string":
                rec.append("    <collation flag='0' name='binary' />")
            rec.append(f"    <object-id>{object_id}</object-id>")
            rec.append("  </metadata-record>")
            parts.append("\n".join(rec))
    parts.append("</metadata-records>")
    return "\n".join(parts)


def build_column_defs(tables: dict[str, pd.DataFrame]) -> str:
    """Return top-level <column> elements (role/type) that pair with the records.

    Tableau expects a <column> per field alongside metadata-records so the
    Catalog and the field-picker agree on role (dimension/measure). We dedupe by
    field name across tables (first table wins) since the flattened datasource
    surfaces one field per name.
    """
    seen: set[str] = set()
    lines: list[str] = []
    for _table, df in tables.items():
        for col, dtype in df.dtypes.items():
            name = str(col)
            if name in seen:
                continue
            seen.add(name)
            local_type, _rt, _agg = _resolve(str(dtype))
            if local_type in ("integer", "real"):
                # numeric ids are dimensions; other numerics are measures.
                is_id = name.endswith("Id") or name in ("Latitude", "Longitude", "ChurnRiskScore")
                role, ctype = ("dimension", "ordinal") if is_id else ("measure", "quantitative")
                datatype = "integer" if local_type == "integer" else "real"
            elif local_type in ("datetime", "date"):
                role, ctype, datatype = "dimension", "ordinal", local_type
            elif local_type == "boolean":
                role, ctype, datatype = "dimension", "nominal", "boolean"
            else:
                role, ctype, datatype = "dimension", "nominal", "string"
            lines.append(
                f"  <column datatype='{datatype}' name='[{escape(name)}]' "
                f"role='{role}' type='{ctype}' />"
            )
    return "\n".join(lines)
