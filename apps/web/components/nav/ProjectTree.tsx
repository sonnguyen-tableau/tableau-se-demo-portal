"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { LiveProject, LiveDashboard } from "@/lib/tableau-rest";
import { projectIcon } from "@/lib/project-icon";

/**
 * `--sidebar-text` at N% opacity. Using the tenant's sidebar-text color (not a
 * hardcoded white) keeps the tree legible on light-sidebar themes too (SH-02).
 */
const sbText = (pct: number) => `color-mix(in srgb, var(--sidebar-text) ${pct}%, transparent)`;

interface ProjectNode {
  project: LiveProject;
  dashboards: LiveDashboard[];
  children: ProjectNode[];
}

/** True when the active workbook (from the URL) lives in this node's subtree,
 *  so its ancestor projects can start expanded (FX-08). */
function nodeHasActiveWorkbook(node: ProjectNode, activeWb: string): boolean {
  if (!activeWb) return false;
  if (node.dashboards.some((d) => d.workbookSlug === activeWb)) return true;
  return node.children.some((c) => nodeHasActiveWorkbook(c, activeWb));
}

function buildTree(projects: LiveProject[], dashboards: LiveDashboard[]): ProjectNode[] {
  const nodeMap = new Map<string, ProjectNode>();
  for (const p of projects) {
    nodeMap.set(p.id, { project: p, dashboards: [], children: [] });
  }
  for (const d of dashboards) {
    nodeMap.get(d.projectId)?.dashboards.push(d);
  }
  const roots: ProjectNode[] = [];
  for (const p of projects) {
    const node = nodeMap.get(p.id)!;
    if (p.parentProjectId && nodeMap.has(p.parentProjectId)) {
      nodeMap.get(p.parentProjectId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort alphabetically at each level
  const sort = (nodes: ProjectNode[]) => {
    nodes.sort((a, b) => a.project.name.localeCompare(b.project.name, "vi"));
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

function TreeNode({
  node,
  tenantSlug,
  depth,
}: {
  node: ProjectNode;
  tenantSlug: string;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  const hasDashboards = node.dashboards.length > 0;
  const pathname = usePathname() ?? "";
  const activeWb = pathname.match(/\/dashboards\/([^/]+)/)?.[1] ?? "";
  const [open, setOpen] = useState(
    (depth === 0 && (hasChildren || hasDashboards)) || nodeHasActiveWorkbook(node, activeWb),
  );
  const Icon = projectIcon(node.project.name);

  if (!hasChildren && !hasDashboards) return null;

  return (
    <div>
      {/* Project row */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug font-medium transition-all duration-base ease-smooth hover:bg-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)]"
        style={{ paddingLeft: `${8 + depth * 12}px`, color: sbText(72) }}
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-base ${open ? "rotate-90" : ""}`}
          style={{ color: sbText(45) }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <Icon className="h-4 w-4 shrink-0" style={{ color: sbText(62) }} strokeWidth={1.75} aria-hidden="true" />
        <span className="flex-1 truncate">{node.project.name}</span>
        {node.dashboards.length > 0 && (
          <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ backgroundColor: sbText(10), color: sbText(68) }}>
            {node.dashboards.length}
          </span>
        )}
      </button>

      {open && (
        <div>
          {/* Child projects */}
          {node.children.map((child) => (
            <TreeNode key={child.project.id} node={child} tenantSlug={tenantSlug} depth={depth + 1} />
          ))}
          {/* Workbooks in this project (deduplicated) */}
          {Array.from(
            new Map(node.dashboards.map((d) => [d.workbookSlug, d])).values()
          ).map((d) => {
            const href = `/t/${tenantSlug}/dashboards/${d.workbookSlug}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={d.workbookSlug}
                href={href}
                aria-current={active ? "page" : undefined}
                className="group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] leading-snug transition-all duration-base ease-smooth hover:bg-[color-mix(in_srgb,var(--sidebar-text)_8%,transparent)] truncate"
                style={{
                  paddingLeft: `${24 + depth * 12}px`,
                  color: active ? "var(--sidebar-text)" : sbText(68),
                  ...(active ? { backgroundColor: sbText(10) } : {}),
                }}
                title={d.workbookName}
              >
                {/* Active workbook indicator — 3px brand strip */}
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity duration-base ${active ? "opacity-100" : "opacity-0"}`}
                  aria-hidden="true"
                />
                <svg className="h-3 w-3 shrink-0" style={{ color: active ? "var(--sidebar-text)" : sbText(40) }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="truncate">{d.workbookName}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjectTree({
  projects,
  dashboards,
  tenantSlug,
}: {
  projects: LiveProject[];
  dashboards: LiveDashboard[];
  tenantSlug: string;
}) {
  const roots = buildTree(projects, dashboards);
  if (roots.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {roots.map((node) => (
        <TreeNode key={node.project.id} node={node} tenantSlug={tenantSlug} depth={0} />
      ))}
    </div>
  );
}
