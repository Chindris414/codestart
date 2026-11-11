import type { WorkerLike } from "./PythonRunner";

// Where scripts/build-python-worker.mjs puts the bundled python.worker.ts.
export const PYTHON_WORKER_URL = "/python/worker.mjs";

// Starts the Python worker as a module worker, which Pyodide requires. It is
// built separately (not by Next.js, whose workers are "classic"), so it is
// referenced by URL. Tests pass a fake factory instead.
export function createPythonWorker(): WorkerLike {
  return new Worker(PYTHON_WORKER_URL, { type: "module", name: "codestart-python" }) as unknown as WorkerLike;
}
