"use client";

import { type ReactElement, useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncItem, SyncPlan } from "@/lib/tenant-sync";

const ACTION_LABEL: Record<SyncItem["action"], string> = {
  archive: "Will hide",
  reactivate: "Will show",
  "keep-active": "Active",
  "keep-archived": "Archived",
  indeterminate: "Site unreachable",
};

const ACTION_CLASS: Record<SyncItem["action"], string> = {
  archive: "bg-amber-100 text-amber-800",
  reactivate: "bg-green-100 text-green-800",
  "keep-active": "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
  "keep-archived": "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
  indeterminate: "bg-red-100 text-red-800",
};

/**
 * "Sync with Tableau" control for the internal tenants admin page.
 * Runs a dry-run preview first; the SE reviews the plan and then applies it.
 * Only tenants with a pending change (archive / reactivate) are actionable.
 */
export function TenantSyncButton(): ReactElement {
  const router = useRouter();
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenants/sync?apply=${apply}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SyncPlan;
      setPlan(data);
      if (apply) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync failed");
    } finally {
      setBusy(false);
    }
  };

  const pendingChanges =
    (plan?.summary.archive ?? 0) + (plan?.summary.reactivate ?? 0);
  const changedItems = plan?.items.filter(
    (i) => i.action === "archive" || i.action === "reactivate",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => run(false)}
          disabled={busy}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-50"
        >
          {busy && !plan ? "Checking…" : "Sync with Tableau"}
        </button>
        {plan && !plan.applied && pendingChanges > 0 && (
          <button
            onClick={() => run(true)}
            disabled={busy}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Apply {pendingChanges} change{pendingChanges === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {plan && (
        <div className="rounded-lg border border-[hsl(var(--border))] p-3 text-sm">
          <p className="text-[hsl(var(--muted-foreground))]">
            {plan.applied ? "Applied — " : "Preview — "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {plan.summary.archive}
            </span>{" "}
            to hide,{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {plan.summary.reactivate}
            </span>{" "}
            to show, {plan.summary.unchanged} unchanged
            {plan.summary.indeterminate > 0 &&
              `, ${plan.summary.indeterminate} unreachable`}
            .
          </p>

          {plan.hasIndeterminate && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              Some tenants&apos; Tableau site returned no projects — likely a PAT
              or connection issue. Those were left untouched (not archived).
              Check the site config, then re-run.
            </p>
          )}

          {plan.applied && (
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Status updated. Refresh the portal home to see the new list.
            </p>
          )}

          {/* Only surface tenants with a pending change to keep the preview focused. */}
          {!plan.applied && changedItems && changedItems.length > 0 && (
            <ul className="mt-3 divide-y divide-[hsl(var(--border))]">
              {changedItems.map((i) => (
                <li key={i.slug} className="flex items-center gap-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${ACTION_CLASS[i.action]}`}
                  >
                    {ACTION_LABEL[i.action]}
                  </span>
                  <span className="font-medium">{i.name}</span>
                  <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                    {i.allowedProjects.join(", ") || "(no folder set)"}
                  </span>
                  <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
                    {i.matchedDashboards} dashboard{i.matchedDashboards === 1 ? "" : "s"} · {i.siteName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
