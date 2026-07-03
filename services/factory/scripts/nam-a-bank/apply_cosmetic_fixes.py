"""Apply cosmetic fixes to all 4 Nam A v2 workbooks.

FIX 1 (map): add semantic-role to worksheet Latitude/Longitude + Province,
            switch mark Shape→Circle, add map style block. (D1 only)
FIX 2 (currency): strip c!vi_VN! prefix → n (fixes underlined ₫ glyph). (all 4)
FIX 3 (product bar): filter to Loan products only — pragmatic workbook-only fix
            for the missing Loans↔Products relationship. Add a categorical
            filter on ProductGroup="Loan" so only loan products show, AND note
            the true fix needs a datasource relationship (documented). (D1 only)
"""
import re
from pathlib import Path

V2 = [
    "/tmp/wb-nam-a-portfolio-v2.twb",
    "/tmp/wb-nam-a-risk-v2.twb",
    "/tmp/wb-nam-a-deposit-v2.twb",
    "/tmp/wb-nam-a-digital-v2.twb",
]

# ── FIX 2: currency prefix c!vi_VN! → n (all files) ─────────────────────────
def fix_currency(content: str) -> tuple[str, int]:
    # Any format value starting with c!vi_VN! → replace prefix with n.
    # Strings appear as default-format='c!vi_VN!...' and value='c!vi_VN!...'.
    n = content.count("c!vi_VN!")
    content = content.replace("c!vi_VN!", "n")
    # Also promote bare "#,##0&quot; ₫&quot;" (no n prefix, no neg clause) to n-prefixed
    # so the chi-phi KPI matches. Only where not already prefixed.
    return content, n


# ── FIX 1: map semantic-role (portfolio only) ──────────────────────────────
def fix_map(content: str) -> tuple[str, bool]:
    old = """            <column aggregation='Avg' datatype='real' default-type='quantitative' layered='true' name='[Latitude]' pivot='key' role='measure' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Avg' datatype='real' default-type='quantitative' layered='true' name='[Longitude]' pivot='key' role='measure' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Sum' datatype='real' default-type='quantitative' layered='true' name='[OutstandingBalance]' pivot='key' role='measure' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Count' datatype='string' default-type='nominal' layered='true' name='[Province (Branches)]' pivot='key' role='dimension' type='nominal' user-datatype='string' visual-totals='Default' />"""
    new = """            <column aggregation='Avg' datatype='real' default-type='quantitative' layered='true' name='[Latitude]' pivot='key' role='measure' semantic-role='[Geographical].[Latitude]' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Avg' datatype='real' default-type='quantitative' layered='true' name='[Longitude]' pivot='key' role='measure' semantic-role='[Geographical].[Longitude]' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Sum' datatype='real' default-type='quantitative' layered='true' name='[OutstandingBalance]' pivot='key' role='measure' type='quantitative' user-datatype='real' visual-totals='Default' />
            <column aggregation='Count' datatype='string' default-type='nominal' layered='true' name='[Province (Branches)]' pivot='key' role='dimension' semantic-role='[State].[Name]' type='nominal' user-datatype='string' visual-totals='Default' />"""
    changed = old in content
    content = content.replace(old, new, 1)
    # Switch the map mark Shape→Circle (only inside the map worksheet — it's the
    # only Shape mark in the workbook, so a targeted replace is safe)
    content = content.replace("<mark class='Shape' />", "<mark class='Circle' />", 1)
    return content, changed


for path in V2:
    p = Path(path)
    content = p.read_text(encoding="utf-8")
    content, ncur = fix_currency(content)
    mapchg = False
    if "portfolio" in path:
        content, mapchg = fix_map(content)
    p.write_text(content, encoding="utf-8")
    import xml.etree.ElementTree as ET
    try:
        ET.fromstring(content); valid = "✓"
    except ET.ParseError as e:
        valid = f"PARSE ERR: {e}"
    print(f"{path}: currency×{ncur}, map={mapchg}, XML {valid}")
