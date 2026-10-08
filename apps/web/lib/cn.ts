/** Join class names, dropping falsy values. Tiny local helper (no clsx dep). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
