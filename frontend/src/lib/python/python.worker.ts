// The Web Worker that runs learner code with Pyodide. Python runs here, off
// the page's main thread, so a long or endless program never freezes the UI,
// and the page can always end it with worker.terminate().
//
// Bundled into public/python/worker.mjs by scripts/build-python-worker.mjs,
// and started by createPythonWorker() as a module worker.

import type { PyodideAPI } from "pyodide";

import {
  isStopRequested,
  PYODIDE_INDEX_URL,
  waitForInputLine,
  type FromWorker,
  type RunOutcome,
  type ToWorker,
} from "./protocol";
import { createRunnerCore, type PythonRunnerCore } from "./runnerCore";

// The DOM and WebWorker type libraries can't be loaded together, so describe
// the few worker globals this file uses.
const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

// Network APIs are removed once Pyodide's own files have loaded, so code run
// here can't simply call fetch() with the learner's session cookies, e.g.
// from a "paste this code" scam. This is a speed bump, not a sandbox: see
// "Known limitations" in docs/python-in-the-browser.md.
const NETWORK_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebTransport",
  "EventSource",
  "importScripts",
  "Worker",
];

function removeNetworkAccess() {
  for (const name of NETWORK_GLOBALS) {
    try {
      Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false });
    } catch {
      // Not present in this browser; nothing to remove.
    }
  }
}

let core: PythonRunnerCore | null = null;
let control: SharedArrayBuffer | null = null;
let interrupt: Int32Array | null = null;
let currentRun = 0;

const post = (message: FromWorker) => scope.postMessage(message);

async function init(message: Extract<ToWorker, { type: "init" }>) {
  control = message.control;
  interrupt = message.interrupt ? new Int32Array(message.interrupt) : null;
  try {
    // Loaded at run time from our own site, not bundled.
    const url = `${PYODIDE_INDEX_URL}pyodide.mjs`;
    const { loadPyodide } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as {
      loadPyodide: (options: { indexURL: string }) => Promise<PyodideAPI>;
    };
    const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    if (interrupt) {
      interrupt[0] = 0; // never start with a pending interrupt
      pyodide.setInterruptBuffer(interrupt);
    }
    removeNetworkAccess();

    core = createRunnerCore(pyodide, {
      emit: (stream, text) => post({ type: "output", runId: currentRun, stream, text }),
      onTruncated: () => post({ type: "output-truncated", runId: currentRun }),
      readInput: control
        ? () => {
            post({ type: "input-request", runId: currentRun });
            return waitForInputLine(control!);
          }
        : null,
      stopRequested: () => (control ? isStopRequested(control) : false),
    });
    post({ type: "ready" });
  } catch (error) {
    post({ type: "load-error", message: error instanceof Error ? error.message : String(error) });
  }
}

function run(message: Extract<ToWorker, { type: "run" }>) {
  currentRun = message.runId;
  if (!core) {
    post({ type: "crash", runId: currentRun, message: "Python is not loaded yet." });
    return;
  }
  if (interrupt) interrupt[0] = 0;
  let outcome: RunOutcome;
  try {
    outcome = core.run(message.code);
  } catch (error) {
    // Only a fault in Pyodide itself ends up here (Python errors are handled
    // by the harness). The page throws this worker away and starts a new one.
    post({ type: "crash", runId: currentRun, message: error instanceof Error ? error.message : String(error) });
    return;
  }
  post({ type: "done", runId: currentRun, outcome });
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") void init(message);
  else if (message.type === "run") run(message);
};
