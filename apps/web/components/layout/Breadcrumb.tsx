"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  tenantSlug: string;
  tenantName: string;
  /**
   * Human names for dynamic path segments, keyed by the tenant-relative path,
   * e.g. `"dashboards/<workbookSlug>" → workbookName` and
   * `"dashboards/<workbookSlug>/<viewSlug>" → viewName`. Built server-side in the
   * layout from the user catalog so a raw slug is never shown (SH-03).
   */
  names?: Record<string, string>;
  /** i18n labels for static segments, keyed by segment, e.g. `dashboards`, `agent`. */
  labels?: Record<string, string>;
}

/** Turn a slug into a readable last-resort label so a raw slug never surfaces. */
export function deSlugify(seg: string): string {
  return decodeURIComponent(seg)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Pure breadcrumb builder (SH-03). Resolves each path segment to, in priority:
 * a real name (workbook/view, from `names`) → an i18n static label (`labels`) →
 * a de-slugified fallback — so a raw slug is never rendered. Returns null when
 * the path is outside the tenant (caller shows the tenant name alone).
 */
export function buildBreadcrumbs(
  pathname: string,
  { tenantSlug, tenantName, names = {}, labels = {} }: Props,
): Crumb[] | null {
  const tenantPrefix = `/t/${tenantSlug}`;
  if (!pathname.startsWith(tenantPrefix)) return null;

  const rest = pathname.slice(tenantPrefix.length).split("/").filter(Boolean);
  return [
    { label: tenantName, href: tenantPrefix },
    ...rest.map((seg, i) => {
      const relPath = rest.slice(0, i + 1).join("/");
      return {
        label: names[relPath] ?? labels[seg] ?? deSlugify(seg),
        href: `${tenantPrefix}/${relPath}`,
      };
    }),
  ];
}

export function Breadcrumb({ tenantSlug, tenantName, names = {}, labels = {} }: Props) {
  const pathname = usePathname() ?? "";

  const segments = buildBreadcrumbs(pathname, { tenantSlug, tenantName, names, labels });
  if (segments === null) {
    return <span className="text-body-sm text-sf-neutral-6 truncate">{tenantName}</span>;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 truncate">
      {segments.map((s, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={s.href} className="flex items-center gap-1.5 truncate">
            {i > 0 && (
              <svg className="h-3 w-3 shrink-0 text-sf-neutral-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isLast ? (
              <span className="text-body-sm font-semibold text-sf-neutral-9 truncate" aria-current="page">{s.label}</span>
            ) : (
              <Link
                href={s.href}
                className="text-body-sm text-sf-neutral-6 transition-colors hover:text-sf-neutral-9 truncate"
              >
                {s.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
