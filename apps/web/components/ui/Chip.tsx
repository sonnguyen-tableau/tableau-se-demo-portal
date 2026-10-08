import { type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/** Chip primitive (DS-04, §2.3). `ai` adds a leading sparkle (AI-applied). */
export function Chip({
  variant = "default",
  className,
  children,
}: {
  variant?: "default" | "brand" | "ai";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "chip",
        (variant === "brand" || variant === "ai") && "chip-brand",
        variant === "ai" && "chip-ai",
        className,
      )}
    >
      {variant === "ai" && <Sparkles className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </span>
  );
}
