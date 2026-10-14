"use client";

import { Pin } from "lucide-react";
import { usePins } from "@/components/pins/PinsProvider";
import type { PinInput } from "@/lib/pins";

/**
 * Pin/unpin toggle (HL-03). Lives inside a card's <Link>, so it swallows the
 * click so toggling never navigates. Filled brand pin when pinned.
 */
export function PinButton({ item }: { item: PinInput }) {
  const { isPinned, toggle, labels } = usePins();
  const pinned = isPinned(item.key);
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? labels.unpin : labels.pin}
      title={pinned ? labels.unpin : labels.pin}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(item);
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full shadow-elev-1 backdrop-blur-sm transition-colors ${
        pinned
          ? "bg-white/90 text-brand"
          : "bg-white/70 text-sf-neutral-5 hover:bg-white/90 hover:text-brand"
      }`}
    >
      <Pin className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
