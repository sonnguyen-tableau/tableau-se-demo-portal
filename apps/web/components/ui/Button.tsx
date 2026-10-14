import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const VARIANT = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
} as const;

/** Button primitive over the §2.3 recipes (DS-04). Colors are brand-token-driven. */
export function Button({
  variant = "primary",
  type,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  children: ReactNode;
}) {
  // Default to type="button" so a Button inside a <form> doesn't submit it by
  // accident (DS-04 / FX-14); callers opt into "submit" explicitly.
  return (
    <button type={type ?? "button"} className={cn(VARIANT[variant], className)} {...rest}>
      {children}
    </button>
  );
}
