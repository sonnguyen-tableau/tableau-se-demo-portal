"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-1 mt-1 px-3 text-meta font-semibold uppercase tracking-[0.12em]"
      style={{ color: "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)" }}
    >
      {children}
    </p>
  );
}

interface NavLinkProps {
  href: string;
  icon: ReactNode;
  badge?: string;
  exact?: boolean;
  children: ReactNode;
}

export function NavLink({ href, icon, badge, exact, children }: NavLinkProps) {
  const pathname = usePathname() ?? "";
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-body-sm font-medium transition-all duration-base ease-smooth ${
        active
          ? "bg-[color-mix(in_srgb,var(--sidebar-text)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sidebar-text)_10%,transparent)]"
          : "hover:bg-[color-mix(in_srgb,var(--sidebar-text)_7%,transparent)]"
      }`}
      style={{
        color: active
          ? "var(--sidebar-text, #fff)"
          : "color-mix(in srgb, var(--sidebar-text, #fff) 65%, transparent)",
      }}
    >
      {/* Active indicator — 3px brand strip */}
      <span
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity duration-base ${
          active ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <svg
        className="h-[18px] w-[18px] shrink-0 transition-colors"
        style={{
          color: active
            ? "var(--sidebar-text, #fff)"
            : "color-mix(in srgb, var(--sidebar-text, #fff) 55%, transparent)",
        }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        {icon}
      </svg>
      <span className="flex-1 truncate">{children}</span>
      {badge && (
        <span className="rounded-full bg-brand px-1.5 py-px text-[10px] font-bold text-brand-on shadow-elev-1">
          {badge}
        </span>
      )}
    </Link>
  );
}
