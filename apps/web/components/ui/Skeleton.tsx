import { cn } from "@/lib/cn";

/** Shimmer placeholder (DS-04). Size via className, e.g. `h-4 w-24`. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sf-neutral-2", className)} aria-hidden="true" />;
}
