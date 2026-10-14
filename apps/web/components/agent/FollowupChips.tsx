"use client";

/**
 * Follow-up question chips (AG-09), rendered only under the latest assistant
 * reply. Panel = light (docked ChatPanel); page = translucent-on-dark (full
 * Agent page), mirroring SuggestionList's variant styling. Clicking a chip
 * sends it as the next user message.
 */
export function FollowupChips({
  items,
  onPick,
  label,
  variant,
}: {
  items: string[];
  onPick: (q: string) => void;
  label: string;
  variant: "panel" | "page";
}) {
  if (items.length === 0) return null;

  const chip =
    variant === "page"
      ? "rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-caption text-white/80 transition-all duration-base ease-smooth hover:border-sf-blue-40/50 hover:bg-white/[0.08] hover:text-white"
      : "rounded-full border border-sf-neutral-3 bg-white px-3 py-1.5 text-caption text-sf-neutral-7 transition-all duration-base ease-smooth hover:-translate-y-px hover:border-brand/40 hover:bg-brand/5 hover:text-sf-neutral-9 hover:shadow-elev-1";
  const labelCls = variant === "page" ? "text-meta font-medium text-white/45" : "text-meta font-medium text-sf-neutral-5";

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((q, i) => (
          <button key={i} type="button" onClick={() => onPick(q)} className={chip}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
