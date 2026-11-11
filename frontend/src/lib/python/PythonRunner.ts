// Runs learner Python in a Web Worker and tracks what is happening, for the
// Run panel. One PythonRunner serves a whole lesson; it starts its worker
// (and downloads Pyodide) only on the first Run.
//
// Learner code goes from here to the worker and nowhere else: it is never
// sent to the CodeStart backend.

import {
  cancelInput,
  CONTROL_BYTES,
  INPUT_IDLE,
  SIGINT,
  controlViews,
  setStopRequested,
  writeInputLine,
  type FromWorker,
  type RunOutcome,
  type ToWorker,
} from "./protocol";

export type RunStatus =
  | "idle" // nothing run yet (or output cleared by switching exercise)
  | "loading" // starting Python; the first time downloads Pyodide
  | "running"
  | "waiting-input" // the program is in input() and waits for the learner
  | "stopping"
  | "success"
  | "error" // the program ended with a Python exception
  | "stopped"
  | "failed"; // Python itself could not start or crashed

export type OutputChunk = { stream: "stdout" | "stderr" | "input" | "notice"; text: string };

export type RunnerSnapshot = {
  status: RunStatus;
  output: OutputChunk[];
  errorName: string | null;
  errorLine: number | null;
  failure: string | null;
  // Known after the first Run: false when the page isn't cross-origin
  // isolated, so input() can't be used.
  inputSupported: boolean | null;
};

export type WorkerLike = {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};

export type PythonRunnerOptions = {
  createWorker: () => WorkerLike;
  // Shared memory (and with it input() and gentle Stop) needs a
  // cross-origin isolated page; see next.config.ts.
  crossOriginIsolated?: boolean;
  loadTimeoutMs?: number;
  stopGraceMs?: number;
};

export const LOAD_FAILED_MESSAGE =
  "Python could not be loaded. Check your internet connection, then press Run to try again.";
export const CRASH_MESSAGE =
  "Python stopped working unexpectedly. Press Run to start it again; your code is still here.";
export const TRUNCATED_NOTICE = "\n[Output limit reached: the rest of the output is not shown.]\n";

const BUSY: RunStatus[] = ["loading", "running", "waiting-input", "stopping"];

export class PythonRunner {
  private worker: WorkerLike | null = null;
  private ready = false;
  private pendingCode: string | null = null;
  private runId = 0;
  private stopping = false;
  private quietStop = false;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  // Shared memory for input() and gentle Stop. Created on the first Run, in
  // the browser, so creating a runner (also during SSR) costs nothing.
  private control: SharedArrayBuffer | null = null;
  private interrupt: SharedArrayBuffer | null = null;
  private sharedMemoryChecked = false;
  private readonly listeners = new Set<() => void>();
  private snapshot: RunnerSnapshot = {
    status: "idle",
    output: [],
    errorName: null,
    errorLine: null,
    failure: null,
    inputSupported: null,
  };

  constructor(private options: PythonRunnerOptions) {}

  // -- for React (useSyncExternalStore) ----------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private update(changes: Partial<RunnerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) listener();
  }

  private append(chunk: OutputChunk) {
    const output = this.snapshot.output;
    const last = output[output.length - 1];
    // Merge with the previous chunk of the same kind to keep the list short.
    const next =
      last && last.stream === chunk.stream && chunk.stream !== "input"
        ? [...output.slice(0, -1), { stream: chunk.stream, text: last.text + chunk.text }]
        : [...output, chunk];
    this.update({ output: next });
  }

  isBusy() {
    return BUSY.includes(this.snapshot.status);
  }

  // -- actions -------------------------------------------------------------

  // Runs `code`. Returns false (and does nothing) while a run is in progress.
  run(code: string): boolean {
    if (this.isBusy()) return false;
    this.update({ output: [], errorName: null, errorLine: null, failure: null });
    if (this.worker && this.ready) {
      this.start(code);
    } else {
      this.pendingCode = code;
      this.update({ status: "loading" });
      if (!this.worker) this.spawn();
    }
    return true;
  }

  // Answers the input() the program is waiting for.
  submitInput(text: string): boolean {
    if (this.snapshot.status !== "waiting-input" || !this.control) return false;
    this.append({ stream: "input", text: `${text}\n` });
    this.update({ status: "running" });
    writeInputLine(this.control, text);
    return true;
  }

  // Stops the current run. Tries a KeyboardInterrupt first, which keeps
  // Python loaded for the next run; if the program doesn't end quickly (or
  // there is no shared memory), the worker is terminated, which always works.
  stop() {
    const status = this.snapshot.status;
    if (status === "loading") {
      this.discardWorker();
      this.finishStop();
      return;
    }
    if ((status !== "running" && status !== "waiting-input") || this.stopping) return;

    this.stopping = true;
    this.update({ status: "stopping" });
    if (!this.control || !this.interrupt) {
      this.discardWorker();
      this.finishStop();
      return;
    }
    setStopRequested(this.control, true);
    Atomics.store(new Int32Array(this.interrupt), 0, SIGINT);
    if (status === "waiting-input") cancelInput(this.control);
    this.stopTimer = setTimeout(() => {
      this.discardWorker();
      this.finishStop();
    }, this.options.stopGraceMs ?? 1000);
  }

  // Used when the learner switches exercise: stop anything running and
  // forget the output, ending in "idle" rather than "stopped".
  reset() {
    if (this.isBusy()) {
      this.quietStop = true;
      this.stop();
    }
    if (!this.stopping) this.update({ status: "idle" });
    this.update({ output: [], errorName: null, errorLine: null, failure: null });
  }

  clearOutput() {
    this.update({ output: [] });
  }

  // Ends the worker and any run, e.g. when the lesson page is left. The
  // runner stays usable: the next Run starts a new worker.
  shutdown() {
    const wasBusy = this.isBusy();
    this.discardWorker();
    this.stopping = false;
    this.quietStop = false;
    this.pendingCode = null;
    if (wasBusy) this.update({ status: "stopped" });
  }

  // -- internals -----------------------------------------------------------

  private spawn() {
    if (!this.sharedMemoryChecked) {
      this.sharedMemoryChecked = true;
      const shared = (this.options.crossOriginIsolated ?? false) && typeof SharedArrayBuffer !== "undefined";
      this.control = shared ? new SharedArrayBuffer(CONTROL_BYTES) : null;
      this.interrupt = shared ? new SharedArrayBuffer(4) : null;
      this.update({ inputSupported: shared });
    }
    // A worker terminated by Stop leaves SIGINT in the shared interrupt
    // buffer; clear it, or the new worker's start-up would be interrupted.
    if (this.control && this.interrupt) {
      Atomics.store(new Int32Array(this.interrupt), 0, 0);
      setStopRequested(this.control, false);
      Atomics.store(controlViews(this.control).header, 0, INPUT_IDLE);
    }
    let worker: WorkerLike;
    try {
      worker = this.options.createWorker();
    } catch {
      this.fail(LOAD_FAILED_MESSAGE);
      return;
    }
    this.worker = worker;
    this.ready = false;
    worker.onmessage = (event) => {
      if (this.worker === worker) this.handle(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (this.worker === worker) this.fail(this.ready ? CRASH_MESSAGE : LOAD_FAILED_MESSAGE);
    };
    worker.onmessageerror = () => {
      if (this.worker === worker) this.fail(CRASH_MESSAGE);
    };
    worker.postMessage({ type: "init", control: this.control, interrupt: this.interrupt });
    this.loadTimer = setTimeout(() => this.fail(LOAD_FAILED_MESSAGE), this.options.loadTimeoutMs ?? 60_000);
  }

  private start(code: string) {
    this.runId += 1;
    this.stopping = false;
    this.quietStop = false;
    if (this.control) {
      setStopRequested(this.control, false);
      Atomics.store(controlViews(this.control).header, 0, INPUT_IDLE);
    }
    this.update({ status: "running" });
    this.worker!.postMessage({ type: "run", runId: this.runId, code });
  }

  private handle(message: FromWorker) {
    switch (message.type) {
      case "ready": {
        this.ready = true;
        this.clearTimer("load");
        const code = this.pendingCode;
        this.pendingCode = null;
        if (code !== null && this.snapshot.status === "loading") this.start(code);
        return;
      }
      case "load-error":
        console.error("Python failed to load:", message.message);
        this.fail(LOAD_FAILED_MESSAGE);
        return;
    }

    // Everything else belongs to a run; drop leftovers of earlier runs.
    if (message.runId !== this.runId) return;
    switch (message.type) {
      case "output":
        if (!this.stopping) this.append({ stream: message.stream, text: message.text });
        return;
      case "output-truncated":
        if (!this.stopping) this.append({ stream: "notice", text: TRUNCATED_NOTICE });
        return;
      case "input-request":
        if (!this.stopping) this.update({ status: "waiting-input" });
        return;
      case "done":
        if (this.stopping) this.finishStop();
        else this.finish(message.outcome);
        return;
      case "crash":
        console.error("Python crashed:", message.message);
        this.fail(CRASH_MESSAGE);
        return;
    }
  }

  private finish(outcome: RunOutcome) {
    if (outcome.kind === "error") {
      this.update({ status: "error", errorName: outcome.name, errorLine: outcome.line });
    } else {
      this.update({ status: outcome.kind === "stopped" ? "stopped" : "success" });
    }
  }

  private finishStop() {
    this.clearTimer("stop");
    this.stopping = false;
    this.pendingCode = null;
    this.update({ status: this.quietStop ? "idle" : "stopped" });
    this.quietStop = false;
  }

  private fail(message: string) {
    this.discardWorker();
    this.stopping = false;
    this.pendingCode = null;
    this.update({ status: "failed", failure: message });
  }

  private discardWorker() {
    this.clearTimer("load");
    this.clearTimer("stop");
    if (this.worker) {
      const worker = this.worker;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    this.worker = null;
    this.ready = false;
  }

  private clearTimer(which: "load" | "stop") {
    const timer = which === "load" ? this.loadTimer : this.stopTimer;
    if (timer !== null) clearTimeout(timer);
    if (which === "load") this.loadTimer = null;
    else this.stopTimer = null;
  }
}
