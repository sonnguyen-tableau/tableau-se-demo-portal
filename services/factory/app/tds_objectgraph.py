"""Reusable Tableau Object-Model ("relationship" / noodle) datasource emitter.

Generates the object-graph XML shape that Tableau Desktop produces for a related
multi-table datasource — from a declared FK graph — so tenants can get real
relationships WITHOUT a manual Desktop step. Ground truth: the hand-authored
templates app/templates/retail-banking.tds and retail-mediamart.tds (same shape).

What a Desktop relationship datasource contains (that the flat sibling-<relation>
emitter in packager.build_tds_xml does NOT):
  1. a <relation type='collection'> wrapping one <relation type='table'> per table
  2. a <cols> map (qualified keys for columns present in >1 table)
  3. <object-graph><objects> — one <object id='<Name> (Extract.<Name>)_<HEX>'> per table
  4. <relationships> — one <relationship> per FK edge (expression op='=' + endpoints)
  5. document-format-change-manifest object-model feature flags
  6. the `_.fcp.ObjectModelSharedDimensions.true...` element-name prefix on
     shared-dimension tables (leaf dims + secondary facts) — see _spine()/PFX.

Field-name qualification: a column present in >1 table is qualified `[Col (Table)]`
for EVERY occurrence (a consistent scheme — we don't need to match Desktop's exact
"keep one bare" choice; the <cols> map + FieldMap are the single source of truth so
cols keys, <column> names, relationship operands, and worksheet refs all agree).

STATUS: net-new; must be Cloud-validated (a hand-authored object-graph may still be
rejected — historically only Desktop-authored relationships passed strict-mode). The
fallback is the nam_a_lib.load_ds_block Desktop-seed pattern.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass


PFX = "_.fcp.ObjectModelSharedDimensions.true..."

# Object-model feature flags (workbook-level for an inline datasource; datasource-level
# for a standalone .tds). Matches retail-banking.tds.
OBJECT_MODEL_MANIFEST = """  <document-format-change-manifest>
    <ObjectModelEncapsulateLegacy />
    <ObjectModelExtractV2 />
    <_.fcp.ObjectModelSharedDimensions.true...ObjectModelSharedDimensions />
    <ObjectModelTableType />
    <SchemaViewerObjectModel />
    <_.fcp.VConnDownstreamExtractsWithWarnings.true...VConnDownstreamExtractsWithWarnings />
  </document-format-change-manifest>"""


@dataclass(frozen=True)
class Rel:
    """One foreign-key edge: child.child_col == parent.parent_col.

    join_col is used for both sides when child_col/parent_col are omitted (the
    common same-name FK case)."""
    child_table: str
    parent_table: str
    join_col: str
    child_col: str | None = None
    parent_col: str | None = None

    def cc(self) -> str:
        return self.child_col or self.join_col

    def pc(self) -> str:
        return self.parent_col or self.join_col


def _esc(s: str) -> str:
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


def object_id(table: str) -> str:
    """Stable object id `<Name> (Extract.<Name>)_<32HEX>` (hash of table name;
    Tableau only requires internal consistency, not a real GUID)."""
    h = hashlib.md5(table.encode("utf-8")).hexdigest().upper()
    return f"{table} (Extract.{table})_{h}"


def build_field_map(tables: dict[str, list[tuple[str, str, str]]]) -> dict[tuple[str, str], str]:
    """(table, col) -> local field name WITHOUT brackets. A col in >1 table is
    qualified `Col (Table)` for every occurrence; otherwise bare `Col`."""
    counts: dict[str, int] = {}
    for cols in tables.values():
        for c, _dt, _role in cols:
            counts[c] = counts.get(c, 0) + 1
    fm: dict[tuple[str, str], str] = {}
    for t, cols in tables.items():
        for c, _dt, _role in cols:
            fm[(t, c)] = c if counts[c] == 1 else f"{c} ({t})"
    return fm


def _spine(tables: list[str], rels: list[Rel], primary_fact: str) -> set[str]:
    """UNPREFIXED set: the primary fact + bridge tables reachable downward
    (child→parent) from it that THEMSELVES have onward FK edges. Everything else
    (leaf dimensions, secondary facts) is a shared dimension → prefixed."""
    has_out = {r.child_table for r in rels}
    parents: dict[str, list[str]] = {}
    for r in rels:
        parents.setdefault(r.child_table, []).append(r.parent_table)
    spine = {primary_fact}
    frontier = [primary_fact]
    while frontier:
        node = frontier.pop()
        for p in parents.get(node, []):
            if p not in spine and p in has_out:  # only bridges (parents with onward edges) join the spine
                spine.add(p)
                frontier.append(p)
    return spine


def _col_def(local: str, dt: str, role: str) -> str:
    """A <column> field definition using the qualified local name."""
    if role == "measure":
        datatype = "real" if dt == "real" else "integer"
        return (f"    <column aggregation='Sum' datatype='{datatype}' name='[{_esc(local)}]' "
                f"role='measure' type='quantitative' />")
    if dt == "datetime":
        return (f"    <column aggregation='Year' datatype='datetime' name='[{_esc(local)}]' "
                f"role='dimension' type='ordinal' />")
    if dt == "integer":
        return (f"    <column aggregation='Count' datatype='integer' name='[{_esc(local)}]' "
                f"role='dimension' type='ordinal' />")
    return (f"    <column aggregation='Count' datatype='string' name='[{_esc(local)}]' "
            f"role='dimension' type='nominal' />")


def object_graph_block(
    *,
    caption: str,
    ds_name: str,
    conn_name: str,
    hyper_dbname: str,
    tables: dict[str, list[tuple[str, str, str]]],
    rels: list[Rel],
    primary_fact: str,
    extra_columns: str = "",
    inline: bool = True,
) -> tuple[str, dict[tuple[str, str], str]]:
    """Return (datasource-block-xml, field_map). `inline=True` → the `<datasource
    caption inline name>` block for embedding in a .twb (manifest goes at workbook
    level via OBJECT_MODEL_MANIFEST). `extra_columns` = calc <column> defs to append."""
    fm = build_field_map(tables)
    table_names = list(tables.keys())
    spine = _spine(table_names, rels, primary_fact)

    def pfx(t: str) -> str:
        return "" if t in spine else PFX

    # <relation type='collection'>
    rel_lines = "\n".join(
        f"      <{pfx(t)}relation connection='{conn_name}' name='{_esc(t)}' "
        f"table='[Extract].[{_esc(t)}]' type='table' />"
        for t in table_names)

    # <cols> map (sorted for deterministic diff)
    col_maps = []
    for t in table_names:
        for c, _dt, _role in tables[t]:
            local = fm[(t, c)]
            col_maps.append(f"      <map key='[{_esc(local)}]' value='[{_esc(t)}].[{_esc(c)}]' />")
    cols_block = "\n".join(sorted(col_maps))

    # <column> field defs
    col_defs = "\n".join(
        _col_def(fm[(t, c)], dt, role)
        for t in table_names for c, dt, role in tables[t])

    # <object-graph><objects>
    obj_lines = []
    for t in table_names:
        p = pfx(t)
        obj_lines.append(
            f"      <{p}object caption='{_esc(t)}' id='{_esc(object_id(t))}'>\n"
            f"        <properties context=''>\n"
            f"          <relation connection='{conn_name}' name='{_esc(t)}' table='[Extract].[{_esc(t)}]' type='table' />\n"
            f"        </properties>\n"
            f"      </{p}object>")
    objects_block = "\n".join(obj_lines)

    # <relationships>
    rel_blocks = []
    for r in rels:
        child_local = fm[(r.child_table, r.cc())]
        parent_local = fm[(r.parent_table, r.pc())]
        # relationship is unprefixed only when BOTH endpoints are on the spine
        rp = "" if (r.child_table in spine and r.parent_table in spine) else PFX
        rel_blocks.append(
            f"      <{rp}relationship>\n"
            f"        <expression op='='>\n"
            f"          <expression op='[{_esc(child_local)}]' />\n"
            f"          <expression op='[{_esc(parent_local)}]' />\n"
            f"        </expression>\n"
            f"        <first-end-point object-id='{_esc(object_id(r.child_table))}' />\n"
            f"        <second-end-point object-id='{_esc(object_id(r.parent_table))}' />\n"
            f"      </{rp}relationship>")
    relationships_block = "\n".join(rel_blocks)

    open_tag = (f"  <datasource caption='{_esc(caption)}' inline='true' name='{_esc(ds_name)}' version='18.1'>"
                if inline else
                f"<datasource formatted-name='{_esc(ds_name)}' inline='true' source-platform='mac' version='18.1' "
                f"xmlns:user='http://www.tableausoftware.com/xml/user'>\n{OBJECT_MODEL_MANIFEST}")

    extra = ("\n" + extra_columns) if extra_columns else ""
    block = f"""{open_tag}
    <connection class='federated'>
      <named-connections>
        <named-connection caption='{_esc(caption)}' name='{conn_name}'>
          <connection class='hyper' authentication='auth-none' dbname='{hyper_dbname}' schema='Extract' server='' default-settings='yes' />
        </named-connection>
      </named-connections>
      <relation type='collection'>
{rel_lines}
      </relation>
      <cols>
{cols_block}
      </cols>
    </connection>
    <aliases enabled='yes' />
{col_defs}{extra}
    <object-graph>
      <objects>
{objects_block}
      </objects>
      <relationships>
{relationships_block}
      </relationships>
    </object-graph>
  </datasource>"""
    return block, fm
