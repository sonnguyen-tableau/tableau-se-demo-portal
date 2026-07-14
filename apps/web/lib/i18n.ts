/**
 * Server-side i18n entry point. The message catalog + `translator()` live in
 * `lib/i18n-shared.ts` (client-safe, no `server-only`); this module re-exports
 * them and adds the cookie readers that only run on the server.
 *
 * Design choices:
 * - **Cookie-based, no URL prefix.** The locale lives in a `NEXT_LOCALE`
 *   cookie, NOT in the path. This preserves the `/t/[tenantSlug]/...` URL
 *   contract and needs NO routing middleware (composes with the auth gate in
 *   `middleware.ts` without fighting it).
 * - **Default is English**, overridable per deployment via
 *   `NEXT_PUBLIC_DEFAULT_LOCALE` (see `DEFAULT_LOCALE` in `lib/i18n-shared.ts`).
 *   The chosen locale is remembered in the `NEXT_LOCALE` cookie via the toggle.
 * - Server Components read the locale with `getLocale()` / `getT()`. Client
 *   Components receive the resolved `locale` as a prop and call `translator()`
 *   from `lib/i18n-shared.ts` directly.
 */
import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
  translator,
} from "@/lib/i18n-shared";

export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALES,
  translator,
  t,
  type Locale,
  type MessageKey,
} from "@/lib/i18n-shared";

/** Read the active locale from the `NEXT_LOCALE` cookie (defaults to DEFAULT_LOCALE). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Convenience for Server Components: resolve the cookie locale + a translator. */
export async function getT(): Promise<{
  locale: Locale;
  t: ReturnType<typeof translator>;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
