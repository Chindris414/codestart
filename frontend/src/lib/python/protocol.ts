// Messages and shared memory between the page (PythonRunner) and the Python
// Web Worker (python.worker.ts). Learner code only ever travels between these
// two, inside the browser: it is never sent to the CodeStart backend.

export type ToWorker =
  | { type: "init"; control: SharedArrayBuffer | null; interrupt: SharedArrayBuffer | null }
  | { type: "run"; runId: number; code: string };

export type RunOutcome =
  | { kind: "success" }
  | { kind: "error"; name: string; line: number | null }
  | { kind: "stopped" };

export type FromWorker =
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "output"; runId: number; stream: "stdout" | "stderr"; text: string }
  | { type: "output-truncated"; runId: number }
  | { type: "input-request"; runId: number }
  | { type: "done"; runId: number; outcome: RunOutcome }
  | { type: "crash"; runId: number; message: string };

// Where Pyodide's files are served from (copied into public/ by
// scripts/copy-vendor.mjs), so nothing is fetched from a CDN.
export const PYODIDE_INDEX_URL = "/pyodide/";

// The worker stops forwarding output after this many characters, so a
// runaway `while True: print(...)` can't flood the page.
export const OUTPUT_LIMIT_CHARS = 100_000;

// The worker sends output at most this often while a program runs.
export const OUTPUT_FLUSH_MS = 50;

// ---------------------------------------------------------------------------
// Input channel: one SharedArrayBuffer, written by the page and read by the
// worker, which waits on it with Atomics.wait while Python is in input().
//
//   Int32 [0]  state: IDLE, then the page sets LINE (text ready) or CANCEL
//   Int32 [1]  length in bytes of the UTF-8 text
//   Int32 [2]  stop requested (1) for the current run
//   bytes [12…] the text itself
// ---------------------------------------------------------------------------

export const INPUT_IDLE = 0;
export const INPUT_LINE = 1;
export const INPUT_CANCEL = 2;

const HEADER_BYTES = 12;
export const INPUT_MAX_BYTES = 16 * 1024;
export const CONTROL_BYTES = HEADER_BYTES + INPUT_MAX_BYTES;

// Longest input the field accepts. Kept well below INPUT_MAX_BYTES, since one
// character can take up to 4 bytes in UTF-8.
export const INPUT_MAX_CHARS = 4000;

export function controlViews(buffer: SharedArrayBuffer) {
  return {
    header: new Int32Array(buffer, 0, 3),
    data: new Uint8Array(buffer, HEADER_BYTES, INPUT_MAX_BYTES),
  };
}

// Page side: hand a line of input to the waiting worker.
export function writeInputLine(buffer: SharedArrayBuffer, text: string) {
  const { header, data } = controlViews(buffer);
  const encoded = new TextEncoder().encode(text);
  // Never cut a multi-byte character in half.
  let length = Math.min(encoded.length, INPUT_MAX_BYTES);
  while (length > 0 && length < encoded.length && (encoded[length] & 0xc0) === 0x80) length--;
  data.set(encoded.subarray(0, length));
  Atomics.store(header, 1, length);
  Atomics.store(header, 0, INPUT_LINE);
  Atomics.notify(header, 0);
}

// Page side: wake a worker that is waiting for input, without a line.
export function cancelInput(buffer: SharedArrayBuffer) {
  const { header } = controlViews(buffer);
  Atomics.store(header, 0, INPUT_CANCEL);
  Atomics.notify(header, 0);
}

// Worker side: block until the page answers. Returns the text, or null when
// the run is being stopped.
export function waitForInputLine(buffer: SharedArrayBuffer): string | null {
  const { header, data } = controlViews(buffer);
  while (Atomics.load(header, 0) === INPUT_IDLE) {
    Atomics.wait(header, 0, INPUT_IDLE);
  }
  const state = Atomics.load(header, 0);
  const length = Atomics.load(header, 1);
  // TextDecoder refuses views on shared memory, so copy the bytes out first.
  const text = new TextDecoder().decode(data.slice(0, length));
  Atomics.store(header, 0, INPUT_IDLE);
  return state === INPUT_LINE ? text : null;
}

export function setStopRequested(buffer: SharedArrayBuffer, stop: boolean) {
  Atomics.store(controlViews(buffer).header, 2, stop ? 1 : 0);
}

export function isStopRequested(buffer: SharedArrayBuffer): boolean {
  return Atomics.load(controlViews(buffer).header, 2) === 1;
}

// Pyodide's interrupt buffer: writing 2 (SIGINT) makes Python raise
// KeyboardInterrupt at the next bytecode, which ends even `while True: pass`.
export const SIGINT = 2;
