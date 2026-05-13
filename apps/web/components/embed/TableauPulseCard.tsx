"use client";

import { type ReactElement } from "react";
import { TableauPulse } from "@tableau/embedding-api-react";

interface Props {
  src: string;
  token: string;
  name: string;
  height?: string;
}

export function TableauPulseCard({ src, token, name, height = "260px" }: Props): ReactElement {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
      <h4 className="mb-2 text-sm font-medium">{name}</h4>
      <div style={{ minHeight: height }}>
        <TableauPulse src={src} token={token} height={height} />
      </div>
    </div>
  );
}
