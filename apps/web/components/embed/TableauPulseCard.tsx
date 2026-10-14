"use client";

import { type ReactElement, useEffect, useRef } from "react";

interface Props {
  src: string;
  token: string;
  name: string;
  height?: string;
}

export function TableauPulseCard({ src, token, name, height = "260px" }: Props): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let origin = "https://prod-apsoutheast-c.online.tableau.com";
    try { origin = new URL(src).origin; } catch { /* keep default */ }

    const existing = document.querySelector('script[data-tableau-embed]');
    const mount = () => {
      const pulse = document.createElement("tableau-pulse") as HTMLElement & Record<string, unknown>;
      pulse["src"] = src;
      pulse["token"] = token;
      (pulse as HTMLElement).style.cssText = `width:100%;height:${height};`;
      container.innerHTML = "";
      container.appendChild(pulse as HTMLElement);
    };

    if (existing) {
      void customElements.whenDefined("tableau-pulse").then(mount);
    } else {
      const s = document.createElement("script");
      s.type = "module";
      s.setAttribute("data-tableau-embed", "1");
      s.src = `${origin}/javascripts/api/tableau.embedding.3.latest.min.js`;
      s.onload = () => void customElements.whenDefined("tableau-pulse").then(mount);
      document.head.appendChild(s);
    }

    return () => { container.innerHTML = ""; };
  }, [src, token, height]);

  return (
    <div className="rounded-xl border border-sf-neutral-3 bg-white p-4 shadow-elev-1 transition-shadow duration-base ease-smooth hover:shadow-elev-2">
      <h4 className="mb-2 truncate text-body-sm font-semibold text-sf-neutral-9">{name}</h4>
      <div ref={containerRef} style={{ minHeight: height }} />
    </div>
  );
}
