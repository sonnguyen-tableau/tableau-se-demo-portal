"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/i18n-actions";
// Import from the client-safe shared module (NOT @/lib/i18n, which is
// server-only via next/headers — importing a runtime value from it into this
// client component breaks the build).
import { LOCALES, type Locale } from "@/lib/i18n-shared";

interface Props {
  /** Current locale (resolved server-side and passed in). */
  locale: Locale;
  /**
   * Visual variant:
   * - "light": for dark surfaces (sign-in hero) — light text/borders.
   * - "dark": for light surfaces (top bar / admin hub) — neutral text.
   */
  variant?: "light" | "dark";
  className?: string;
}

// Derived from LOCALES so adding a language in `lib/i18n-shared.ts` surfaces it
// here automatically. Add a friendly label below when introducing a new locale;
// unlisted codes fall back to their uppercased code.
const LOCALE_LABELS: Partial<Record<Locale, string>> = { en: "EN", vi: "VI" };
const OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = LOCALES.map(
  (value) => ({ value, label: LOCALE_LABELS[value] ?? value.toUpperCase() }),
);

/**
 * Compact VI/EN segmented switch. Sets the NEXT_LOCALE cookie via a Server
 * Action, then refreshes so Server Components re-render translated. No URL
 * change — the `/t/[tenantSlug]/...` contract is untouched.
 */
export function LanguageToggle({ locale, variant = "dark", className = "" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pick = (next: Locale) => {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  const track =
    variant === "light"
      ? "border-white/20 bg-white/10"
      : "border-sf-neutral-3 bg-sf-neutral-1";

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-0.5 rounded-full border p-0.5 ${track} ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === locale;
        const activeCls =
          variant === "light"
            ? "bg-white text-sf-neutral-9 shadow-elev-1"
            : "bg-white text-sf-neutral-9 shadow-elev-1 ring-1 ring-sf-neutral-3";
        const idleCls =
          variant === "light"
            ? "text-white/70 hover:text-white"
            : "text-sf-neutral-5 hover:text-sf-neutral-8";
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={() => pick(opt.value)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              active ? activeCls : idleCls
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
