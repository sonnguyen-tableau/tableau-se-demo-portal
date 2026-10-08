"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PinnedItem, PinInput } from "@/lib/pins";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

interface PinsContextValue {
  pins: PinnedItem[];
  isPinned: (key: string) => boolean;
  toggle: (item: PinInput) => void;
  labels: { pin: string; unpin: string; pinned: string };
}

const PinsContext = createContext<PinsContextValue>({
  pins: [],
  isPinned: () => false,
  toggle: () => {},
  labels: { pin: "Pin", unpin: "Unpin", pinned: "Pinned" },
});

/** Pins state shared across the tenant shell (HL-03). Read via usePins(). */
export function usePins(): PinsContextValue {
  return useContext(PinsContext);
}

const MAX = 12;

/**
 * Loads the user's pins once (GET /api/pins) and exposes an optimistic toggle
 * that POSTs/DELETEs and reconciles with the server's authoritative list. Mount
 * once in the tenant layout so cards and the home "pinned" row share one source.
 */
export function PinsProvider({ locale = DEFAULT_LOCALE, children }: { locale?: Locale; children: ReactNode }) {
  const [pins, setPins] = useState<PinnedItem[]>([]);
  const t = translator(locale);

  useEffect(() => {
    let alive = true;
    fetch("/api/pins")
      .then((r) => (r.ok ? r.json() : { pins: [] }))
      .then((d) => {
        if (alive) setPins(Array.isArray(d.pins) ? d.pins : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const isPinned = useCallback((key: string) => pins.some((p) => p.key === key), [pins]);

  const toggle = useCallback(
    (item: PinInput) => {
      const already = pins.some((p) => p.key === item.key);
      if (already) {
        setPins((ps) => ps.filter((p) => p.key !== item.key)); // optimistic
        fetch(`/api/pins?key=${encodeURIComponent(item.key)}`, { method: "DELETE" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setPins(d.pins))
          .catch(() => {});
      } else {
        const optimistic: PinnedItem = { ...item, pinnedAt: Date.now() };
        setPins((ps) => [optimistic, ...ps.filter((p) => p.key !== item.key)].slice(0, MAX));
        fetch("/api/pins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setPins(d.pins))
          .catch(() => {});
      }
    },
    [pins],
  );

  return (
    <PinsContext.Provider
      value={{ pins, isPinned, toggle, labels: { pin: t("th.pin"), unpin: t("th.unpin"), pinned: t("th.pinned") } }}
    >
      {children}
    </PinsContext.Provider>
  );
}
