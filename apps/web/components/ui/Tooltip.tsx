"use client";

import { type ReactNode, useState } from "react";

/** Lightweight hover/focus tooltip (DS-04). Wraps a single interactive child. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="pointer-events-none absolute -top-1 left-1/2 z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-sf-neutral-10 px-2 py-1 text-caption text-white shadow-elev-3"
        >
          {label}
        </span>
      )}
    </span>
  );
}
