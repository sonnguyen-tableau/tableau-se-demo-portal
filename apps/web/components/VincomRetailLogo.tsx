import type { ReactElement } from "react";

interface Props {
  size?: number;
  className?: string;
}

export function VincomRetailIcon({ size = 36, className }: Props): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      aria-label="Vincom Retail"
    >
      <rect width="36" height="36" rx="9" fill="#1B2A4A" />
      {/* V mark */}
      <path d="M8 10L14 26H18L24 10" stroke="#E30613" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M14 26L18 20L22 26" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* dot accent */}
      <circle cx="27" cy="10" r="2.5" fill="#E30613" />
    </svg>
  );
}
