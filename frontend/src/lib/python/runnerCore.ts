// Runs learner code inside an already loaded Pyodide. Used by the Web Worker
// in the browser, and directly (with real Pyodide in Node) by the tests.
// Nothing here touches the DOM or the network.

import type { PyodideAPI } from "pyodide";

import { OUTPUT_FLUSH_MS, OUTPUT_LIMIT_CHARS, type RunOutcome } from "./protocol";

export type Stream = "stdout" | "stderr";

export type RunnerHooks = {
  // Receives output in batches (see OutputBatcher).
  emit: (stream: Stream, text: string) => void;
  // Called once per run when output goes over OUTPUT_LIMIT_CHARS.
  onTruncated: () => void;
  // Blocks until the learner answers; returns the line, or null when the run
  // is being stopped. Null means input() is not available in this browser.
  readInput: (() => string | null) | null;
  // True once the learner pressed Stop for the current run.
  stopRequested: () => boolean;
  now?: () => number;
  outputLimit?: number;
};

export const INPUT_UNAVAILABLE_MESSAGE =
  "input() is not available in this browser window. Reload the page and try again; " +
  "if that does not help, try an up-to-date Chrome, Edge, Firefox or Safari.";

// Collects output and hands it on at most every OUTPUT_FLUSH_MS, in order,
// and stops after the output limit. Python runs synchronously in the worker,
// so the time check happens on each write rather than on a timer.
export class OutputBatcher {
  private stream: Stream | null = null;
  private pending = "";
  private lastFlush: number;
  private sent = 0;
  private truncated = false;

  constructor(
    private hooks: Pick<RunnerHooks, "emit" | "onTruncated">,
    private now: () => number,
    private limit: number,
  ) {
    this.lastFlush = now();
  }

  write(stream: Stream, text: string) {
    if (this.truncated || text === "") return;
    if (this.stream !== null && this.stream !== stream) this.flush();
    this.stream = stream;

    const room = this.limit - this.sent - this.pending.length;
    if (text.length > room) {
      this.pending += text.slice(0, Math.max(room, 0));
      this.flush();
      this.truncated = true;
      this.hooks.onTruncated();
      return;
    }
    this.pending += text;
    if (this.now() - this.lastFlush >= OUTPUT_FLUSH_MS || this.pending.length >= 8192) this.flush();
  }

  flush() {
    if (this.pending && this.stream) {
      this.hooks.emit(this.stream, this.pending);
      this.sent += this.pending.length;
    }
    this.pending = "";
    this.lastFlush = this.now();
  }
}

// The Python side of a run. `main.py` is the file name learners see in
// tracebacks; frames from this harness are cut off so they only see their
// own code.
const HARNESS = String.raw`
import builtins, json, linecache, sys, traceback

# Remember the real input() once, even if this harness is loaded again.
if not hasattr(builtins, "_codestart_original_input"):
    builtins._codestart_original_input = builtins.input

def _codestart_no_input(prompt=""):
    raise RuntimeError(_codestart_input_unavailable)

def _codestart_last_line(tb):
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == "main.py":
            line = tb.tb_lineno
        tb = tb.tb_next
    return line

def _codestart_run(code, input_supported, stop_requested):
    builtins.input = builtins._codestart_original_input if input_supported else _codestart_no_input
    # Lets tracebacks show the learner's source lines.
    linecache.cache["main.py"] = (len(code), None, code.splitlines(True), "main.py")
    namespace = {"__name__": "__main__", "__builtins__": builtins}
    try:
        exec(compile(code, "main.py", "exec"), namespace)
        return json.dumps({"kind": "success"})
    except BaseException as error:
        if stop_requested():
            return json.dumps({"kind": "stopped"})
        sys.stdout.flush()
        if isinstance(error, SystemExit):
            if error.code is None or error.code == 0:
                return json.dumps({"kind": "success"})
            if not isinstance(error.code, int):
                sys.stderr.write(str(error.code) + "\n")
            else:
                sys.stderr.write(f"SystemExit: {error.code}\n")
            return json.dumps({"kind": "error", "name": "SystemExit", "line": None})
        tb = error.__traceback__
        report = traceback.TracebackException(type(error), error, tb)
        # Show only the learner's own frames, not this harness.
        report.stack = traceback.StackSummary.from_list(
            [frame for frame in report.stack if frame.filename == "main.py"]
        )
        sys.stderr.write("".join(report.format()))
        if isinstance(error, SyntaxError) and error.filename == "main.py":
            line = error.lineno
        else:
            line = _codestart_last_line(tb)
        return json.dumps({"kind": "error", "name": type(error).__name__, "line": line})
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        namespace.clear()
`;

export type PythonRunnerCore = {
  run: (code: string) => RunOutcome;
};

export function createRunnerCore(pyodide: PyodideAPI, hooks: RunnerHooks): PythonRunnerCore {
  const now = hooks.now ?? (() => Date.now());
  let batcher = new OutputBatcher(hooks, now, hooks.outputLimit ?? OUTPUT_LIMIT_CHARS);

  const writer = (stream: Stream) => {
    const decoder = new TextDecoder();
    return {
      // Line-buffered like a terminal, so output appears as each line is
      // printed, and stdout and stderr stay in order.
      isatty: true,
      write(bytes: Uint8Array) {
        batcher.write(stream, decoder.decode(bytes, { stream: true }));
        return bytes.length;
      },
    };
  };
  pyodide.setStdout(writer("stdout"));
  pyodide.setStderr(writer("stderr"));
  pyodide.setStdin({
    stdin: () => {
      // The prompt is already written; send it before waiting.
      batcher.flush();
      return hooks.readInput?.() ?? null;
    },
    autoEOF: true,
  });

  pyodide.globals.set("_codestart_input_unavailable", INPUT_UNAVAILABLE_MESSAGE);
  pyodide.runPython(HARNESS);
  const harnessRun = pyodide.globals.get("_codestart_run");

  return {
    run(code: string): RunOutcome {
      batcher = new OutputBatcher(hooks, now, hooks.outputLimit ?? OUTPUT_LIMIT_CHARS);
      try {
        const result = harnessRun(code.replace(/\r\n?/g, "\n"), hooks.readInput !== null, hooks.stopRequested);
        return JSON.parse(result) as RunOutcome;
      } finally {
        batcher.flush();
      }
    },
  };
}
