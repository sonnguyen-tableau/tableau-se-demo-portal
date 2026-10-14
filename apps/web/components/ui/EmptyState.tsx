import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

const TONE = {
  neutral: "bg-sf-neutral-2 text-sf-neutral-5",
  warning: "bg-amber-50 text-amber-600",
  error: "bg-red-50 text-red-600",
} as const;

/** Centered empty/error state with a 40px icon tile (DS-04, DESIGN §4.11). */
export function EmptyState({
  tone = "neutral",
  icon,
  title,
  body,
  action,
}: {
  tone?: keyof typeof TONE;
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", TONE[tone])}>{icon}</span>}
      <p className="text-body-sm font-semibold text-sf-neutral-9">{title}</p>
      {body && <p className="max-w-xs text-caption text-sf-neutral-6">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
