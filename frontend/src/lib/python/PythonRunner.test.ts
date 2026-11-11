// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { isStopRequested, waitForInputLine, type FromWorker, type ToWorker } from "./protocol";
import { CRASH_MESSAGE, LOAD_FAILED_MESSAGE, PythonRunner, TRUNCATED_NOTICE, type WorkerLike } from "./PythonRunner";

class FakeWorker implements WorkerLike {
  posted: ToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage(message: ToWorker) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  send(message: FromWorker) {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }
  get init() {
    return this.posted.find((m) => m.type === "init") as Extract<ToWorker, { type: "init" }>;
  }
  get lastRun() {
    return this.posted.filter((m) => m.type === "run").at(-1) as Extract<ToWorker, { type: "run" }>;
  }
}

let workers: FakeWorker[];

function makeRunner(options: { isolated?: boolean } = {}) {
  workers = [];
  const runner = new PythonRunner({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    crossOriginIsolated: options.isolated ?? true,
    loadTimeoutMs: 5000,
    stopGraceMs: 1000,
  });
  return runner;
}

const status = (runner: PythonRunner) => runner.getSnapshot().status;
const outputText = (runner: PythonRunner) => runner.getSnapshot().output.map((c) => c.text).join("");

// Starts a run on a ready worker and returns that worker and the run id.
function startRun(runner: PythonRunner, code = "print('hi')") {
  runner.run(code);
  const worker = workers.at(-1)!;
  if (!worker.posted.some((m) => m.type === "run")) worker.send({ type: "ready" });
  return { worker, runId: worker.lastRun.runId };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("loading and running", () => {
  test("does nothing until the first Run, then loads Python and runs the code", () => {
    const runner = makeRunner();
    expect(workers).toHaveLength(0);
    expect(status(runner)).toBe("idle");

    expect(runner.run("print('hi')")).toBe(true);
    expect(status(runner)).toBe("loading");
    expect(workers).toHaveLength(1);
    expect(workers[0].init.control).toBeInstanceOf(SharedArrayBuffer);

    workers[0].send({ type: "ready" });
    expect(status(runner)).toBe("running");
    expect(workers[0].lastRun.code).toBe("print('hi')");
  });

  test("collects stdout and stderr, then reports success", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "output", runId, stream: "stdout", text: "a" });
    worker.send({ type: "output", runId, stream: "stdout", text: "b\n" });
    worker.send({ type: "output", runId, stream: "stderr", text: "warn\n" });
    worker.send({ type: "done", runId, outcome: { kind: "success" } });

    expect(status(runner)).toBe("success");
    expect(runner.getSnapshot().output).toEqual([
      { stream: "stdout", text: "ab\n" }, // merged
      { stream: "stderr", text: "warn\n" },
    ]);
  });

  test("reports a Python error with its name and line", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "done", runId, outcome: { kind: "error", name: "NameError", line: 3 } });
    expect(runner.getSnapshot()).toMatchObject({ status: "error", errorName: "NameError", errorLine: 3 });
  });

  test("repeated runs reuse the loaded worker and start with empty output", () => {
    const runner = makeRunner();
    const first = startRun(runner);
    first.worker.send({ type: "output", runId: first.runId, stream: "stdout", text: "one\n" });
    first.worker.send({ type: "done", runId: first.runId, outcome: { kind: "success" } });

    expect(runner.run("print('two')")).toBe(true);
    expect(workers).toHaveLength(1);
    expect(outputText(runner)).toBe("");
    const second = first.worker.lastRun;
    expect(second.runId).toBe(first.runId + 1);
    first.worker.send({ type: "output", runId: second.runId, stream: "stdout", text: "two\n" });
    expect(outputText(runner)).toBe("two\n");
  });

  test("refuses to start a run while one is in progress", () => {
    const runner = makeRunner();
    runner.run("a");
    expect(runner.run("b")).toBe(false); // while loading
    workers[0].send({ type: "ready" });
    expect(runner.run("c")).toBe(false); // while running
    expect(workers[0].posted.filter((m) => m.type === "run")).toHaveLength(1);
    expect(workers[0].lastRun.code).toBe("a");
  });

  test("a truncated output adds one notice", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "output", runId, stream: "stdout", text: "x" });
    worker.send({ type: "output-truncated", runId });
    expect(outputText(runner)).toBe(`x${TRUNCATED_NOTICE}`);
  });

  test("notifies subscribers with a new snapshot on each change", () => {
    const runner = makeRunner();
    const seen: string[] = [];
    runner.subscribe(() => seen.push(status(runner)));
    const before = runner.getSnapshot();
    startRun(runner);
    expect(runner.getSnapshot()).not.toBe(before);
    expect(seen).toContain("loading");
    expect(seen.at(-1)).toBe("running");
  });
});

describe("input()", () => {
  test("waits for the learner, echoes the answer and hands it to the worker", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "output", runId, stream: "stdout", text: "Name? " });
    worker.send({ type: "input-request", runId });
    expect(status(runner)).toBe("waiting-input");

    expect(runner.submitInput("Ada")).toBe(true);
    expect(status(runner)).toBe("running");
    expect(runner.getSnapshot().output.at(-1)).toEqual({ stream: "input", text: "Ada\n" });
    // What the worker reads from shared memory:
    expect(waitForInputLine(worker.init.control!)).toBe("Ada");
  });

  test("ignores input when nothing is waiting for it", () => {
    const runner = makeRunner();
    startRun(runner);
    expect(runner.submitInput("early")).toBe(false);
    expect(outputText(runner)).toBe("");
  });

  test("without cross-origin isolation, there is no shared memory and input is unsupported", () => {
    const runner = makeRunner({ isolated: false });
    expect(runner.getSnapshot().inputSupported).toBeNull(); // not known before the first Run
    runner.run("x");
    expect(runner.getSnapshot().inputSupported).toBe(false);
    expect(workers[0].init.control).toBeNull();
    expect(workers[0].init.interrupt).toBeNull();
  });
});

describe("stop", () => {
  test("interrupts gently first and keeps the worker when the program ends", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner, "while True: pass");
    runner.stop();
    expect(status(runner)).toBe("stopping");
    expect(new Int32Array(worker.init.interrupt!)[0]).toBe(2);
    expect(isStopRequested(worker.init.control!)).toBe(true);

    // Output produced while stopping is not shown.
    worker.send({ type: "output", runId, stream: "stdout", text: "late\n" });
    worker.send({ type: "done", runId, outcome: { kind: "stopped" } });
    expect(status(runner)).toBe("stopped");
    expect(outputText(runner)).toBe("");
    expect(worker.terminated).toBe(false);

    // The next run clears the stop flag and reuses the worker.
    expect(runner.run("print(1)")).toBe(true);
    expect(isStopRequested(worker.init.control!)).toBe(false);
    expect(workers).toHaveLength(1);
  });

  test("terminates the worker if the program doesn't stop in time, and starts a fresh one next run", () => {
    const runner = makeRunner();
    const { worker } = startRun(runner);
    runner.stop();
    vi.advanceTimersByTime(999);
    expect(worker.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(worker.terminated).toBe(true);
    expect(status(runner)).toBe("stopped");

    runner.run("print(2)");
    expect(workers).toHaveLength(2);
    expect(status(runner)).toBe("loading");
  });

  // Regression: found in the real browser. The new worker shares the
  // interrupt buffer, and a leftover SIGINT broke Pyodide's start-up.
  test("after a hard stop, the next worker starts with a cleared interrupt and stop flag", () => {
    const runner = makeRunner();
    const { worker } = startRun(runner);
    runner.stop();
    vi.advanceTimersByTime(1000);
    expect(new Int32Array(worker.init.interrupt!)[0]).toBe(2); // left behind by the stop

    runner.run("print(2)");
    const fresh = workers[1];
    expect(fresh.init.interrupt).toBe(worker.init.interrupt);
    expect(new Int32Array(fresh.init.interrupt!)[0]).toBe(0);
    expect(isStopRequested(fresh.init.control!)).toBe(false);
  });

  test("a late 'done' from a terminated worker is ignored", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    runner.stop();
    vi.advanceTimersByTime(1000);
    runner.run("next");
    worker.send({ type: "done", runId, outcome: { kind: "success" } });
    expect(status(runner)).toBe("loading");
  });

  test("stopping while waiting for input wakes the worker", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "input-request", runId });
    runner.stop();
    expect(waitForInputLine(worker.init.control!)).toBeNull(); // cancelled, not a line
  });

  test("without shared memory, Stop terminates the worker straight away", () => {
    const runner = makeRunner({ isolated: false });
    const { worker } = startRun(runner);
    runner.stop();
    expect(worker.terminated).toBe(true);
    expect(status(runner)).toBe("stopped");
  });

  test("stopping during loading cancels the load and the pending run", () => {
    const runner = makeRunner();
    runner.run("print(1)");
    runner.stop();
    expect(workers[0].terminated).toBe(true);
    expect(status(runner)).toBe("stopped");
    workers[0].send({ type: "ready" });
    expect(workers[0].posted.some((m) => m.type === "run")).toBe(false);
  });

  test("Stop does nothing when nothing is running", () => {
    const runner = makeRunner();
    runner.stop();
    expect(status(runner)).toBe("idle");
    const { worker, runId } = startRun(runner);
    worker.send({ type: "done", runId, outcome: { kind: "success" } });
    runner.stop();
    expect(status(runner)).toBe("success");
  });
});

describe("failures", () => {
  test("Pyodide failing to load is reported, and Run tries again with a new worker", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const runner = makeRunner();
    runner.run("x");
    workers[0].send({ type: "load-error", message: "404" });
    expect(runner.getSnapshot()).toMatchObject({ status: "failed", failure: LOAD_FAILED_MESSAGE });
    expect(workers[0].terminated).toBe(true);

    runner.run("x");
    expect(workers).toHaveLength(2);
  });

  test("a load that never finishes times out", () => {
    const runner = makeRunner();
    runner.run("x");
    vi.advanceTimersByTime(5000);
    expect(runner.getSnapshot()).toMatchObject({ status: "failed", failure: LOAD_FAILED_MESSAGE });
  });

  test("a worker script error during a run is a crash", () => {
    const runner = makeRunner();
    const { worker } = startRun(runner);
    worker.onerror?.(new Event("error"));
    expect(runner.getSnapshot()).toMatchObject({ status: "failed", failure: CRASH_MESSAGE });
    expect(worker.terminated).toBe(true);
  });

  test("a crash message replaces the worker", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "crash", runId, message: "memory access out of bounds" });
    expect(status(runner)).toBe("failed");
    expect(worker.terminated).toBe(true);
  });
});

describe("cleanup", () => {
  test("reset stops the run and returns to idle with no output", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "output", runId, stream: "stdout", text: "x" });
    runner.reset();
    expect(outputText(runner)).toBe("");
    worker.send({ type: "done", runId, outcome: { kind: "stopped" } });
    expect(status(runner)).toBe("idle");
  });

  test("reset when idle or finished just clears", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "output", runId, stream: "stdout", text: "x" });
    worker.send({ type: "done", runId, outcome: { kind: "success" } });
    runner.reset();
    expect(runner.getSnapshot()).toMatchObject({ status: "idle", output: [] });
  });

  test("shutdown terminates the worker, ignores it afterwards, and the next Run starts a new one", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    runner.shutdown();
    expect(worker.terminated).toBe(true);
    expect(status(runner)).toBe("stopped");
    worker.send({ type: "output", runId, stream: "stdout", text: "x" });
    expect(outputText(runner)).toBe("");

    expect(runner.run("again")).toBe(true);
    expect(workers).toHaveLength(2);
    // Shared memory is kept, so input() keeps working with the new worker.
    expect(workers[1].init.control).toBe(workers[0].init.control);
  });

  test("shutdown when nothing runs keeps the last result", () => {
    const runner = makeRunner();
    const { worker, runId } = startRun(runner);
    worker.send({ type: "done", runId, outcome: { kind: "success" } });
    runner.shutdown();
    expect(status(runner)).toBe("success");
  });

  test("shutdown during loading clears the load timer", () => {
    const runner = makeRunner();
    runner.run("x");
    runner.shutdown();
    vi.advanceTimersByTime(10_000);
    expect(workers[0].terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
