"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveProject, LiveDashboard } from "@/lib/tableau-rest";

interface ProjectNode {
  project: LiveProject;
  dashboards: LiveDashboard[];
  children: ProjectNode[];
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

function ProjectIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("sample")) return <>📋</>;
  if (n.includes("demo")) return <>🔬</>;
  if (n.includes("banking") || n.includes("financial")) return <>🏦</>;
  if (n.includes("retail")) return <>🛒</>;
  if (n.includes("sales")) return <>📈</>;
  if (n.includes("risk")) return <>⚠️</>;
  if (n.includes("digital")) return <>💻</>;
  if (n.includes("energy") || n.includes("evn")) return <>⚡</>;
  if (n.includes("gaming")) return <>🎮</>;
  if (n.includes("education")) return <>🎓</>;
  if (n.includes("health")) return <>🏥</>;
  if (n.includes("manufactur")) return <>🏭</>;
  if (n.includes("ride") || n.includes("transport")) return <>🚗</>;
  if (n.includes("operation")) return <>⚙️</>;
  if (n.includes("default")) return <>🏠</>;
  return <>📁</>;
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
  const [open, setOpen] = useState(depth === 0 && (hasChildren || hasDashboards));

  if (!hasChildren && !hasDashboards) return null;

  return (
    <div>
      {/* Project row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-meta font-medium text-white/70 transition-all duration-base ease-smooth hover:bg-white/[0.06] hover:text-white"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <svg
          className={`h-3 w-3 shrink-0 text-white/40 transition-transform duration-base ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[11px] leading-none" aria-hidden="true"><ProjectIcon name={node.project.name} /></span>
        <span className="flex-1 truncate">{node.project.name}</span>
        {node.dashboards.length > 0 && (
          <span className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[10px] font-semibold text-white/50 group-hover:text-white/70">
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
          ).map((d) => (
            <Link
              key={d.workbookSlug}
              href={`/t/${tenantSlug}/dashboards/${d.workbookSlug}`}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-meta text-white/55 transition-all duration-base ease-smooth hover:bg-white/[0.06] hover:text-white truncate"
              style={{ paddingLeft: `${24 + depth * 12}px` }}
              title={d.workbookName}
            >
              <svg className="h-3 w-3 shrink-0 text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="truncate">{d.workbookName}</span>
            </Link>
          ))}
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
