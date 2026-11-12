import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Drafts autosaved during a test (e.g. by the unmount flush in cleanup())
  // must never hydrate into the next test's editor. Some suites run in a
  // plain Node environment, which has no localStorage.
  if (typeof localStorage !== "undefined") localStorage.clear();
});
