"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { createPythonWorker } from "@/lib/python/createPythonWorker";
import { PythonRunner, type PythonRunnerOptions } from "@/lib/python/PythonRunner";

// One PythonRunner for the component's lifetime. Its worker is shut down
// whenever the component's effects are cleaned up: on unmount, and when
// Next.js hides a left page in <Activity>. The next Run starts a new one.
export function usePythonRunner(options?: Partial<PythonRunnerOptions>) {
  const [runner] = useState(
    () =>
      new PythonRunner({
        createWorker: createPythonWorker,
        crossOriginIsolated: typeof window !== "undefined" && window.crossOriginIsolated === true,
        ...options,
      }),
  );
  useEffect(() => () => runner.shutdown(), [runner]);
  const snapshot = useSyncExternalStore(runner.subscribe, runner.getSnapshot, runner.getSnapshot);
  return { runner, snapshot };
}
