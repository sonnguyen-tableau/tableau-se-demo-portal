"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  siteId: string;
  label: string;
}

export function DeleteSiteButton({ siteId, label }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/admin/sites");
      router.refresh();
    } catch {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Xoá &quot;{label}&quot;?</span>
        <button
          onClick={doDelete}
          disabled={busy}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
    >
      Delete site
    </button>
  );
}
