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
  filters: Array<{ field: string; values: string[] }>;
  selectedMarks: Array<Record<string, string>>;
  parameters: Record<string, string>;
  ready: boolean;
}

const emptyState: VizContextState = {
  filters: [],
  selectedMarks: [],
  parameters: {},
  ready: false,
};

export interface AskAiRequest {
  /** Pre-filled chat input drafted from selected marks or quick action. */
  prompt: string;
  /** Optional source label for telemetry. */
  source?: "context-menu" | "user" | "preset";
}

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
  | { kind: "setParameter"; name: string; value: string };

export interface VizActionResult {
  ok: boolean;
  error?: string;
}

interface VizContextValue {
  state: VizContextState;
  /** Patch the bridge state. Unset keys are left untouched. */
  update: (patch: Partial<VizContextState>) => void;
  /** Send the current state to a snapshot — used by the chat panel per request. */
  snapshot: () => VizContextState;
  /** Subscribe to "Ask AI" requests from the viz (custom context menu, etc.). */
  onAskAi: (handler: (req: AskAiRequest) => void) => () => void;
  /** Fire an "Ask AI" request — typically from the viz custom context menu. */
  askAi: (req: AskAiRequest) => void;
  /** Dispatch a viz action; resolves with the executor's result. */
  applyVizAction: (action: VizAction) => Promise<VizActionResult>;
  /** Register the viz-side executor. Returns an unsubscribe. */
  registerVizExecutor: (
    exec: (action: VizAction) => Promise<VizActionResult>,
  ) => () => void;
}

const VizContextRef = createContext<VizContextValue | null>(null);

export function VizContextProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<VizContextState>(emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const handlersRef = useRef<Set<(req: AskAiRequest) => void>>(new Set());
  const executorRef = useRef<((action: VizAction) => Promise<VizActionResult>) | null>(null);

  const update = useCallback((patch: Partial<VizContextState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

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

  const applyVizAction = useCallback(async (action: VizAction): Promise<VizActionResult> => {
    const exec = executorRef.current;
    if (!exec) return { ok: false, error: "Viz is not mounted yet." };
    try {
      return await exec(action);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "viz action failed" };
    }
  }, []);

  const registerVizExecutor = useCallback(
    (exec: (action: VizAction) => Promise<VizActionResult>) => {
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
 * Convenience hook for the chat panel: returns a stable AbortController-bound
 * snapshot function and an Ask-AI subscription with optional auto-clear.
 */
export function useAskAiSubscription(handler: (req: AskAiRequest) => void): void {
  const { onAskAi } = useVizContext();
  useEffect(() => onAskAi(handler), [onAskAi, handler]);
}
