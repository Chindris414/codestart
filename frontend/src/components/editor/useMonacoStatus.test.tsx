import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { cancelable, fakeMonaco, loader, resetFakeMonaco } from "@/test/fakeMonaco";

import { MONACO_VS_PATH, useMonacoStatus } from "./useMonacoStatus";

vi.mock("@monaco-editor/loader", () => import("@/test/fakeMonaco"));

beforeEach(() => {
  resetFakeMonaco();
});

describe("useMonacoStatus", () => {
  test("starts loading, then becomes ready, using the self-hosted files", async () => {
    const { result } = renderHook(() => useMonacoStatus());
    expect(result.current).toEqual({ status: "loading", monaco: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.monaco).toBe(fakeMonaco);
    expect(loader.config).toHaveBeenCalledWith({ paths: { vs: MONACO_VS_PATH } });
  });

  test("a load error becomes 'failed'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loader.init.mockImplementation(() => cancelable(Promise.reject(new Error("404 loader.js"))));
    const { result } = renderHook(() => useMonacoStatus());
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(console.error).toHaveBeenCalled();
  });

  test("a load that never finishes times out to 'failed'", () => {
    vi.useFakeTimers();
    try {
      loader.init.mockImplementation(() => cancelable(new Promise(() => {})));
      const { result } = renderHook(() => useMonacoStatus(1000));
      act(() => vi.advanceTimersByTime(999));
      expect(result.current.status).toBe("loading");
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.status).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  test("unmounting while loading cancels quietly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let finish = () => {};
    loader.init.mockImplementation(() =>
      cancelable(
        new Promise<never>((resolve) => {
          finish = () => resolve(undefined as never);
        }),
      ),
    );

    const { unmount } = renderHook(() => useMonacoStatus());
    unmount();
    await act(async () => finish());

    expect(error).not.toHaveBeenCalled();
  });
});
