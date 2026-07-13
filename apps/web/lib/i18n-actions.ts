"use server";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

/**
 * Persist the chosen UI locale in the `NEXT_LOCALE` cookie. Called by the
 * client-side LanguageToggle; the component then `router.refresh()`es so
 * Server Components re-render in the new language. 1-year, lax, path=/.
 */
export async function setLocale(next: string): Promise<Locale> {
  const locale: Locale = isLocale(next) ? next : DEFAULT_LOCALE;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return locale;
}
