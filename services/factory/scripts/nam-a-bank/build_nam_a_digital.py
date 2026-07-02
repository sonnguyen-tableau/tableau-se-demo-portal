"""D4 — Kênh số & Mạng lưới ONEBANK — Nam A Bank

Builds the D4 Digital dashboard workbook using the shared nam_a_lib helper
module (seed_desktop datasources block with 16 calc fields injected).

Dashboard: "Kênh số & Mạng lưới ONEBANK"

5 KPI strip:
    MAU Digital (94000001)
    Số ONEBANK (94000003)
    Chi phí/GD (94000002)
    Số chi nhánh (91000005)
    Số khách (91000004)

6 charts (2 rows x 3 cols):
  1. Mix Kênh Giao dịch — donut, color=Channel(DigitalEvents), angle=CNT(EventId)
  2. Bản đồ ONEBANK — symbol map, AVG(Latitude)/AVG(Longitude), color=BranchType,
     detail=BranchName
  3. Chi phí/GD theo Kênh — bar, rows=Channel(DigitalEvents), cols=AVG(ChannelCost),
     color=Channel
  4. Phân bố Loại Giao dịch — bar, rows=EventType, cols=CNT(EventId)
  5. eKYC Outcome — bar, rows=EventType, cols=CNT(EventId), color=Outcome
  6. MAU Digital theo tháng — line, cols=MONTH(EventDate), rows=CNTD(CustomerId(DigitalEvents))
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, "/tmp")

from nam_a_lib import (  # type: ignore
    DS_NAME,
    calc_name,
    calc_col_ref,
    raw_col,
    inst_dim,
    inst_agg,
    inst_month,
    inst_calc_usr,
    kpi_sheet,
    chart_sheet,
    dashboard_zone,
    dashboard_xml,
    workbook_xml,
)


DS = DS_NAME


# ---------------------------------------------------------------------------
# Field-reference helpers (bind to DS_NAME)
# ---------------------------------------------------------------------------

def ref_calc(cid: int, kind: str = "qk") -> str:
    return f"[{DS}].[usr:{calc_name(cid)}:{kind}]"


def ref_dim(field: str) -> str:
    return f"[{DS}].[none:{field}:nk]"


def ref_agg(field: str, agg: str) -> str:
    return f"[{DS}].[{agg.lower()}:{field}:qk]"


def ref_month(field: str) -> str:
    return f"[{DS}].[md:{field}:mn]"


# ---------------------------------------------------------------------------
# Build sheets
# ---------------------------------------------------------------------------

def build_sheets() -> tuple[list[str], list[str]]:
    sheets: list[str] = []

    # ── 5 KPI cards ─────────────────────────────────────────────────────
    sheets.append(kpi_sheet(
        "KPI MAU Digital", 94000001,
        caption="MAU Digital",
        title_vn="MAU Digital",
        fmt="n#,##0",
    ))
    sheets.append(kpi_sheet(
        "KPI So ONEBANK", 94000003,
        caption="Số điểm ONEBANK",
        title_vn="Số ONEBANK",
        fmt="n#,##0",
    ))
    sheets.append(kpi_sheet(
        "KPI Chi phi GD", 94000002,
        caption="Chi phí/GD kênh",
        title_vn="Chi phí/GD",
        fmt='n#,##0" ₫"',
    ))
    sheets.append(kpi_sheet(
        "KPI So chi nhanh", 91000005,
        caption="Số chi nhánh",
        title_vn="Số chi nhánh",
        fmt="n#,##0",
    ))
    sheets.append(kpi_sheet(
        "KPI So khach", 91000004,
        caption="Số khách hàng bán lẻ",
        title_vn="Số khách",
        fmt="n#,##0",
    ))

    # ── Chart 1: Mix Kênh Giao dịch (donut / pie) ──────────────────────
    ch_field = "Channel (DigitalEvents)"
    sheets.append(chart_sheet(
        name="Mix Kenh Giao dich",
        title_vn="Mix Kênh Giao dịch",
        deps=[
            raw_col(ch_field, aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
            raw_col("EventId", aggregation="Count", dt="integer",
                    role="dimension", ct="ordinal"),
        ],
        insts=[
            inst_dim(ch_field),
            f"            <column-instance column='[EventId]' derivation='Count' "
            f"name='[cnt:EventId:qk]' pivot='key' type='quantitative' />",
        ],
        rows="",
        cols="",
        mark="Pie",
        encodings=[
            f"<color column='{ref_dim(ch_field)}' />",
            f"<angle column='[{DS}].[cnt:EventId:qk]' />",
        ],
    ))

    # ── Chart 2: Bản đồ ONEBANK ────────────────────────────────────────
    sheets.append(chart_sheet(
        name="Ban do ONEBANK",
        title_vn="Bản đồ ONEBANK",
        deps=[
            raw_col("Latitude", aggregation="Avg", dt="real"),
            raw_col("Longitude", aggregation="Avg", dt="real"),
            raw_col("BranchType", aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
            raw_col("BranchName", aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
        ],
        insts=[
            inst_agg("Latitude", "Avg"),
            inst_agg("Longitude", "Avg"),
            inst_dim("BranchType"),
            inst_dim("BranchName"),
        ],
        rows=ref_agg("Latitude", "avg"),
        cols=ref_agg("Longitude", "avg"),
        mark="Circle",
        encodings=[
            f"<color column='{ref_dim('BranchType')}' />",
            f"<detail column='{ref_dim('BranchName')}' />",
        ],
    ))

    # ── Chart 3: Chi phí/GD theo Kênh (bar) ───────────────────────────
    sheets.append(chart_sheet(
        name="Chi phi theo Kenh",
        title_vn="Chi phí/GD theo Kênh",
        deps=[
            raw_col(ch_field, aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
            raw_col("ChannelCost", aggregation="Avg", dt="integer",
                    role="measure", ct="quantitative"),
        ],
        insts=[
            inst_dim(ch_field),
            inst_agg("ChannelCost", "Avg"),
        ],
        rows=ref_dim(ch_field),
        cols=ref_agg("ChannelCost", "avg"),
        mark="Bar",
        encodings=[
            f"<color column='{ref_dim(ch_field)}' />",
        ],
    ))

    # ── Chart 4: Phân bố Loại Giao dịch (bar) ─────────────────────────
    sheets.append(chart_sheet(
        name="Phan bo Loai GD",
        title_vn="Phân bố Loại Giao dịch",
        deps=[
            raw_col("EventType", aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
            raw_col("EventId", aggregation="Count", dt="integer",
                    role="dimension", ct="ordinal"),
        ],
        insts=[
            inst_dim("EventType"),
            f"            <column-instance column='[EventId]' derivation='Count' "
            f"name='[cnt:EventId:qk]' pivot='key' type='quantitative' />",
        ],
        rows=ref_dim("EventType"),
        cols=f"[{DS}].[cnt:EventId:qk]",
        mark="Bar",
    ))

    # ── Chart 5: eKYC Outcome (bar) ───────────────────────────────────
    sheets.append(chart_sheet(
        name="eKYC Outcome",
        title_vn="eKYC Outcome",
        deps=[
            raw_col("EventType", aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
            raw_col("EventId", aggregation="Count", dt="integer",
                    role="dimension", ct="ordinal"),
            raw_col("Outcome", aggregation="Count", dt="string",
                    role="dimension", ct="nominal"),
        ],
        insts=[
            inst_dim("EventType"),
            inst_dim("Outcome"),
            f"            <column-instance column='[EventId]' derivation='Count' "
            f"name='[cnt:EventId:qk]' pivot='key' type='quantitative' />",
        ],
        rows=ref_dim("EventType"),
        cols=f"[{DS}].[cnt:EventId:qk]",
        mark="Bar",
        encodings=[
            f"<color column='{ref_dim('Outcome')}' />",
        ],
    ))

    # ── Chart 6: MAU Digital theo tháng (line) ────────────────────────
    cust_field = "CustomerId (DigitalEvents)"
    sheets.append(chart_sheet(
        name="MAU Digital theo thang",
        title_vn="MAU Digital theo tháng",
        deps=[
            raw_col("EventDate", aggregation="Year", dt="datetime",
                    role="dimension", ct="ordinal"),
            raw_col(cust_field, aggregation="Count", dt="integer",
                    role="dimension", ct="ordinal"),
        ],
        insts=[
            inst_month("EventDate"),
            f"            <column-instance column='[{cust_field}]' derivation='Cntd' "
            f"name='[ctd:{cust_field}:qk]' pivot='key' type='quantitative' />",
        ],
        rows=f"[{DS}].[ctd:{cust_field}:qk]",
        cols=ref_month("EventDate"),
        mark="Line",
    ))

    sheet_names = [
        "KPI MAU Digital", "KPI So ONEBANK", "KPI Chi phi GD",
        "KPI So chi nhanh", "KPI So khach",
        "Mix Kenh Giao dich", "Ban do ONEBANK", "Chi phi theo Kenh",
        "Phan bo Loai GD", "eKYC Outcome", "MAU Digital theo thang",
    ]
    return sheets, sheet_names


# ---------------------------------------------------------------------------
# Build dashboard
# ---------------------------------------------------------------------------

def build_dashboard() -> str:
    """Layout: 5 KPI strip (top), 6 charts in 2×3 grid below.

    Height totals 100000; width totals 100000 (Tableau relative units).
    KPI strip: y=0..16000. Row 2: y=16000..58000. Row 3: y=58000..100000.
    5 KPI at 20000 wide each. 3 charts per row at 33333 wide.
    """
    zid = 1000
    zones = []
    kpi = [
        "KPI MAU Digital", "KPI So ONEBANK", "KPI Chi phi GD",
        "KPI So chi nhanh", "KPI So khach",
    ]
    for i, name in enumerate(kpi):
        zid += 1
        zones.append(dashboard_zone(zid, name, x=i * 20000, y=0,
                                    w=20000, h=16000))

    row2 = ["Mix Kenh Giao dich", "Ban do ONEBANK", "Chi phi theo Kenh"]
    for i, name in enumerate(row2):
        zid += 1
        w = 33334 if i == 0 else 33333
        x = 0 if i == 0 else (33334 + (i - 1) * 33333)
        zones.append(dashboard_zone(zid, name, x=x, y=16000, w=w, h=42000))

    row3 = ["Phan bo Loai GD", "eKYC Outcome", "MAU Digital theo thang"]
    for i, name in enumerate(row3):
        zid += 1
        w = 33334 if i == 0 else 33333
        x = 0 if i == 0 else (33334 + (i - 1) * 33333)
        zones.append(dashboard_zone(zid, name, x=x, y=58000, w=w, h=42000))

    return dashboard_xml("Kênh số & Mạng lưới ONEBANK", zones)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sheets, sheet_names = build_sheets()
    dash = build_dashboard()
    dash_names = ["Kênh số & Mạng lưới ONEBANK"]

    xml = workbook_xml(sheets, sheet_names, dash, dash_names)
    out = Path("/tmp/wb-nam-a-digital.twb")
    out.write_text(xml, encoding="utf-8")

    print(f"Built {out} ({len(xml):,} bytes)")
    print(f"  Sheets: {len(sheet_names)} ({sum(1 for n in sheet_names if n.startswith('KPI'))} KPI + "
          f"{len(sheet_names) - sum(1 for n in sheet_names if n.startswith('KPI'))} charts)")
    print(f"  Dashboard: {dash_names[0]}")

    # ---- Basic verification ----
    # 1. Every referenced calc id is defined on the datasource.
    for cid in (91000004, 91000005, 94000001, 94000002, 94000003):
        marker = f"[{calc_name(cid)}]"
        if marker not in xml:
            raise SystemExit(f"FAIL: calc {marker} missing from workbook.")
    # 2. Every sheet name appears exactly once in a <worksheet name=..> tag.
    for n in sheet_names:
        needle = f"<worksheet name='{n}'>"
        if xml.count(needle) != 1:
            raise SystemExit(f"FAIL: worksheet '{n}' appears "
                             f"{xml.count(needle)} times (expected 1).")
    # 3. Dashboard references every sheet.
    for n in sheet_names:
        if f"name='{n}'" not in xml:
            raise SystemExit(f"FAIL: sheet '{n}' not referenced by dashboard.")
    # 4. XML well-formedness sanity — parse the file.
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(xml)
    except ET.ParseError as e:
        raise SystemExit(f"FAIL: XML parse error: {e}")
    print("  Verification: OK (calcs present, sheets unique, XML well-formed)")


if __name__ == "__main__":
    main()
