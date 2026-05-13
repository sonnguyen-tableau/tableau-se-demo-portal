import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  VizContextProvider,
  useAskAiSubscription,
  useVizContext,
} from "./VizContextProvider";

function wrap(children: ReactNode) {
  return <VizContextProvider>{children}</VizContextProvider>;
}

describe("VizContextProvider", () => {
  it("starts empty and not-ready", () => {
    const { result } = renderHook(() => useVizContext(), {
      wrapper: ({ children }) => wrap(children),
    });
    expect(result.current.state.ready).toBe(false);
    expect(result.current.state.filters).toEqual([]);
    expect(result.current.state.selectedMarks).toEqual([]);
  });

  it("update() merges patches", () => {
    const { result } = renderHook(() => useVizContext(), {
      wrapper: ({ children }) => wrap(children),
    });
    act(() => {
      result.current.update({ workbook: "Sales", activeSheet: "Overview", ready: true });
    });
    expect(result.current.state.workbook).toBe("Sales");
    expect(result.current.state.activeSheet).toBe("Overview");
    expect(result.current.state.ready).toBe(true);

    act(() => {
      result.current.update({ filters: [{ field: "Region", values: ["EMEA"] }] });
    });
    expect(result.current.state.filters).toEqual([{ field: "Region", values: ["EMEA"] }]);
    expect(result.current.state.workbook).toBe("Sales");
  });

  it("snapshot() returns the current state", () => {
    const { result } = renderHook(() => useVizContext(), {
      wrapper: ({ children }) => wrap(children),
    });
    act(() => result.current.update({ ready: true, workbook: "W" }));
    const snap = result.current.snapshot();
    expect(snap.ready).toBe(true);
    expect(snap.workbook).toBe("W");
  });

  it("askAi() delivers to onAskAi subscribers", () => {
    const calls: string[] = [];
    const { result } = renderHook(() => {
      const ctx = useVizContext();
      useAskAiSubscription((req) => calls.push(req.prompt));
      return ctx;
    }, { wrapper: ({ children }) => wrap(children) });
    act(() => result.current.askAi({ prompt: "hello", source: "context-menu" }));
    expect(calls).toEqual(["hello"]);
  });
});
