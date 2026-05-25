"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-1 px-3 text-meta font-semibold uppercase tracking-[0.12em] text-white/40">
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
          ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          : "text-white/65 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {/* Active indicator */}
      <span
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sf-blue-40 to-sf-blue-60 transition-opacity duration-base ${
          active ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <svg
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-sf-blue-40" : "text-white/55 group-hover:text-white/85"}`}
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
        <span className="rounded-full bg-gradient-to-br from-sf-blue-40 to-sf-blue-60 px-1.5 py-px text-[10px] font-bold text-white shadow-elev-1">
          {badge}
        </span>
      )}
    </Link>
  );
}
