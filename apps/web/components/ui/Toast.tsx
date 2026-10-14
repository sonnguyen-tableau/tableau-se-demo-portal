"use client";

import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
}

const ToastCtx = createContext<(message: string) => void>(() => {});

/** Show a transient bottom-center toast. No-op outside a ToastProvider. */
export function useToast() {
  return useContext(ToastCtx);
}

/**
 * Toast host (DS-04, DESIGN §4.12): bottom-center, dark surface, auto-dismiss
 * after 3s, role="status". Mount once (e.g. the tenant layout); call useToast()
 * anywhere below to show copy-link / pin / undo confirmations.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string) => {
    const id = (idRef.current += 1);
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="rounded-lg bg-sf-neutral-10 px-3.5 py-2 text-body-sm text-white shadow-elev-3 motion-safe:animate-slide-up"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
