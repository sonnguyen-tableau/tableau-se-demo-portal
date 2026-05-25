"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  dashboards: "Dashboards",
  agent: "AI Agent",
  admin: "Admin",
  theme: "Giao diện",
  users: "Người dùng",
  factory: "Demo Factory",
  impressions: "Impressions",
  tenants: "Tenants",
};

interface Props {
  tenantSlug: string;
  tenantName: string;
}

export function Breadcrumb({ tenantSlug, tenantName }: Props) {
  const pathname = usePathname() ?? "";
  const tenantPrefix = `/t/${tenantSlug}`;

  if (!pathname.startsWith(tenantPrefix)) {
    return <span className="text-body-sm text-sf-neutral-6 truncate">{tenantName}</span>;
  }

  const rest = pathname.slice(tenantPrefix.length).split("/").filter(Boolean);
  const segments = [
    { label: tenantName, href: tenantPrefix, isFirst: true },
    ...rest.map((seg, i) => ({
      label: LABELS[seg] ?? decodeURIComponent(seg),
      href: `${tenantPrefix}/${rest.slice(0, i + 1).join("/")}`,
      isFirst: false,
    })),
  ];

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
              <span className="text-body-sm font-semibold text-sf-neutral-9 truncate">{s.label}</span>
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
