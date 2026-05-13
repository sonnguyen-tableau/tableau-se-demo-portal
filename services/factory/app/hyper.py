"""Stage 6 — write a .hyper file from in-memory pandas DataFrames.

The Hyper API ships precompiled binaries; the module is heavy and may not be
present on every developer machine. We import lazily so the rest of the
service can be developed and tested without it. Stages that require Hyper
emit a `skipped` event when the library is unavailable.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

# Map pandas dtypes to Hyper SqlType helpers (constructed at runtime).
_TYPE_DISPATCH = {
    "int64": "big_int",
    "int32": "int",
    "int16": "small_int",
    "int8": "small_int",
    "float64": "double",
    "float32": "double",
    "bool": "bool",
    "object": "text",
    "string": "text",
}


def is_available() -> bool:
    try:
        import tableauhyperapi  # noqa: F401
    except Exception:
        return False
    return True


def write_hyper(
    tables: dict[str, pd.DataFrame], output_path: Path
) -> Path:
    if not is_available():
        raise RuntimeError(
            "tableauhyperapi is not installed in this environment. "
            "Install services/factory with the optional Hyper extra to enable publishing."
        )

    # Imports deferred to keep tests fast when the binary isn't installed.
    from tableauhyperapi import (
        NULLABLE,
        Connection,
        CreateMode,
        HyperProcess,
        Inserter,
        SqlType,
        TableDefinition,
        TableName,
        Telemetry,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with HyperProcess(telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hyper:
        with Connection(
            endpoint=hyper.endpoint,
            database=str(output_path),
            create_mode=CreateMode.CREATE_AND_REPLACE,
        ) as connection:
            connection.catalog.create_schema("Extract")

            for table_name, df in tables.items():
                tdef = _to_table_def(
                    TableName("Extract", table_name),
                    df,
                    SqlType=SqlType,
                    TableDefinition=TableDefinition,
                    NULLABLE=NULLABLE,
                )
                connection.catalog.create_table(table_definition=tdef)
                # itertuples preserves per-column dtype (int stays int, float
                # stays float) which Hyper requires. `df.values.tolist()`
                # would coerce everything to the loosest common dtype.
                with Inserter(connection, tdef) as inserter:
                    inserter.add_rows(list(df.itertuples(index=False, name=None)))
                    inserter.execute()

    return output_path


def _to_table_def(
    table_name: Any,
    df: pd.DataFrame,
    *,
    SqlType: Any,
    TableDefinition: Any,
    NULLABLE: Any,
) -> Any:
    columns: list[Any] = []
    for col_name, dtype in df.dtypes.items():
        kind = _TYPE_DISPATCH.get(str(dtype))
        if kind is None:
            if "datetime64" in str(dtype):
                sql_type = SqlType.timestamp()
            else:
                sql_type = SqlType.text()
        else:
            sql_type = getattr(SqlType, kind)()
        columns.append(
            TableDefinition.Column(name=str(col_name), type=sql_type, nullability=NULLABLE)
        )
    return TableDefinition(table_name=table_name, columns=columns)
