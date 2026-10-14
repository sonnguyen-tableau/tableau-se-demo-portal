"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export interface VizContextState {
  workbook?: string;
  activeSheet?: string;
  /** `source: "ai"` marks a filter applied by an agent viz action (FilterChips styling, RV-03). */
  filters: Array<{ field: string; values: string[]; source?: "ai" | "user" }>;
  selectedMarks: Array<Record<string, string>>;
  parameters: Record<string, string>;
  datasources: Array<{ name: string; id?: string }>;
  ready: boolean;
}

const emptyState: VizContextState = {
  filters: [],
  selectedMarks: [],
  parameters: {},
  datasources: [],
  ready: false,
};

export interface AskAiRequest {
  /** Pre-filled chat input drafted from selected marks or quick action. */
  prompt: string;
  /** Optional source label for telemetry. */
  source?: "context-menu" | "user" | "preset";
}

/**
 * Window event the layout-level command palette fires to send a prompt to the
 * current view's chat (the palette lives above VizContextProvider, so it can't
 * call askAi directly) — detail: `{ prompt: string }`. The provider listens and
 * forwards to askAi (FX-10).
 */
export const ASK_AI_EVENT = "portal:ask-ai";

/**
 * Actions the agent can drive on the embedded viz. The bridge dispatches
 * these to the viz shell, which calls the corresponding Embedding API.
 */
export type VizAction =
  | { kind: "applyFilter"; field: string; values: string[]; updateType?: "REPLACE" | "ADD" | "REMOVE" }
  | { kind: "clearFilter"; field: string }
  | { kind: "selectMarks"; field: string; values: string[] }
  | { kind: "clearSelectedMarks" }
  | { kind: "switchTab"; sheetName: string }
  | { kind: "setParameter"; name: string; value: string }
  | { kind: "revertAll" } // reset all filters/params to the workbook defaults (RV-02)
  | { kind: "refreshData" }; // refresh the active sheet's data sources (RV-02)

export interface VizActionResult {
  ok: boolean;
  error?: string;
  /** Present on a successful, reversible action — restores the prior viz state (AG-05). */
  undo?: () => Promise<void>;
}

/** Who initiated an action — "user" (toolbar/tabs/chips) suppresses the AI flash (FX-02). */
export type VizActionOrigin = "agent" | "user";
export interface VizActionOpts {
  origin?: VizActionOrigin;
}

interface VizContextValue {
  state: VizContextState;
  /** Patch the bridge state. Unset keys are left untouched. Pass a function to
   *  merge from the latest state (race-safe for rapid events like filterchanged). */
  update: (patch: Partial<VizContextState> | ((prev: VizContextState) => Partial<VizContextState>)) => void;
  /** Send the current state to a snapshot — used by the chat panel per request. */
  snapshot: () => VizContextState;
  /** Subscribe to "Ask AI" requests from the viz (custom context menu, etc.). */
  onAskAi: (handler: (req: AskAiRequest) => void) => () => void;
  /** Fire an "Ask AI" request — typically from the viz custom context menu. */
  askAi: (req: AskAiRequest) => void;
  /** Dispatch a viz action; resolves with the executor's result. */
  applyVizAction: (action: VizAction, opts?: VizActionOpts) => Promise<VizActionResult>;
  /** Register the viz-side executor. Returns an unsubscribe. */
  registerVizExecutor: (
    exec: (action: VizAction, opts?: VizActionOpts) => Promise<VizActionResult>,
  ) => () => void;
}

const VizContextRef = createContext<VizContextValue | null>(null);

export function VizContextProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<VizContextState>(emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const handlersRef = useRef<Set<(req: AskAiRequest) => void>>(new Set());
  const executorRef = useRef<((action: VizAction, opts?: VizActionOpts) => Promise<VizActionResult>) | null>(null);

  const update = useCallback(
    (patch: Partial<VizContextState> | ((prev: VizContextState) => Partial<VizContextState>)) => {
      setState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
    },
    [],
  );

  const snapshot = useCallback((): VizContextState => stateRef.current, []);

  const onAskAi = useCallback((handler: (req: AskAiRequest) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const askAi = useCallback((req: AskAiRequest) => {
    for (const h of handlersRef.current) h(req);
  }, []);

  // Bridge the layout-level command palette → this view's chat (FX-10).
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt) askAi({ prompt, source: "preset" });
    };
    window.addEventListener(ASK_AI_EVENT, handler);
    return () => window.removeEventListener(ASK_AI_EVENT, handler);
  }, [askAi]);

  const applyVizAction = useCallback(async (action: VizAction, opts?: VizActionOpts): Promise<VizActionResult> => {
    const exec = executorRef.current;
    if (!exec) return { ok: false, error: "Viz is not mounted yet." };
    try {
      return await exec(action, opts);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "viz action failed" };
    }
  }, []);

  const registerVizExecutor = useCallback(
    (exec: (action: VizAction, opts?: VizActionOpts) => Promise<VizActionResult>) => {
      executorRef.current = exec;
      return () => {
        if (executorRef.current === exec) executorRef.current = null;
      };
    },
    [],
  );

  const value = useMemo<VizContextValue>(
    () => ({
      state,
      update,
      snapshot,
      onAskAi,
      askAi,
      applyVizAction,
      registerVizExecutor,
    }),
    [state, update, snapshot, onAskAi, askAi, applyVizAction, registerVizExecutor],
  );

  return <VizContextRef.Provider value={value}>{children}</VizContextRef.Provider>;
}

export function useVizContext(): VizContextValue {
  const v = useContext(VizContextRef);
  if (!v) throw new Error("useVizContext must be used inside <VizContextProvider>");
  return v;
}

/**
 * Non-throwing accessor — returns null when used outside a VizContextProvider
 * (e.g. the full Agent page, which embeds no viz). The unified chat engine
 * (AG-01) uses this to dispatch viz actions only when a viz is present.
 */
export function useOptionalVizContext(): VizContextValue | null {
  return useContext(VizContextRef);
}

/**
 * Convenience hook for the chat panel: returns a stable AbortController-bound
 * snapshot function and an Ask-AI subscription with optional auto-clear.
 */
export function useAskAiSubscription(handler: (req: AskAiRequest) => void): void {
  const { onAskAi } = useVizContext();
  useEffect(() => onAskAi(handler), [onAskAi, handler]);
}
