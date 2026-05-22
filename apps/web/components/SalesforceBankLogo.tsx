import type { ReactElement } from "react";

interface Props {
  size?: number;
  className?: string;
}

export function SalesforceBankIcon({ size = 36, className }: Props): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      aria-label="Salesforce Bank"
    >
      <rect width="36" height="36" rx="9" fill="#0176D3" />
      {/* Pediment roof — gold accent */}
      <path d="M7 16L18 7L29 16" stroke="#F5A623" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      {/* Three columns */}
      <rect x="9" y="16" width="3" height="11" rx="1" fill="white" />
      <rect x="16.5" y="16" width="3" height="11" rx="1" fill="white" />
      <rect x="24" y="16" width="3" height="11" rx="1" fill="white" />
      {/* Base */}
      <rect x="7" y="27" width="22" height="2.5" rx="1" fill="white" />
    </svg>
  );
}

export function SalesforceBankLogoFull({ className }: { className?: string }): ReactElement {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <SalesforceBankIcon size={40} />
      <div className="flex flex-col leading-tight">
        <span className="text-base font-bold tracking-tight text-white">Salesforce Bank</span>
        <span className="text-[11px] font-medium tracking-wide text-blue-300 uppercase">Analytics Portal</span>
      </div>
    </div>
  );
}
