import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Icon-only button (DS-04). `label` is REQUIRED and used for both aria-label and
 * the native tooltip, so an icon button always has an accessible name.
 */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("btn-icon", className)} {...rest}>
      {children}
    </button>
  );
}
