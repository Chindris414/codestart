# Running Python in the browser

How the **Run** button on an exercise works. Learner code runs in the learner's own browser with [Pyodide](https://pyodide.org) (CPython compiled to WebAssembly) inside a Web Worker. It is never sent to the CodeStart backend. Grading on the server (Submit) is a separate, later feature.

## Pieces

| File | Runs in | Job |
| --- | --- | --- |
| `frontend/src/components/editor/RunPanel.tsx` | page | Run / Stop / Clear buttons, status line, output, input box |
| `frontend/src/components/editor/usePythonRunner.ts` | page | One `PythonRunner` per lesson; shuts its worker down when the lesson is left |
| `frontend/src/lib/python/PythonRunner.ts` | page | Starts and stops the worker, tracks the run state, passes input |
| `frontend/src/lib/python/protocol.ts` | both | Messages, and the shared memory used for `input()` and Stop |
| `frontend/src/lib/python/python.worker.ts` | worker | Loads Pyodide, runs code, sends output back |
| `frontend/src/lib/python/runnerCore.ts` | worker | The Python harness: output batching, tracebacks, `input()` |

Pyodide is loaded only when the learner first presses Run. The first run downloads about 12 MB (cached by the browser afterwards) and takes a few seconds; later runs reuse the loaded Python and start in milliseconds. Each run gets a fresh set of variables.

## Run states

`idle` → `loading` (first run only) → `running` ⇄ `waiting-input` → one of `success`, `error` (a Python exception, with its name and line), `stopped`, or `failed` (Python could not start or crashed). `stopping` is shown briefly between pressing Stop and the program ending. Run is unavailable while a program is loading, running, waiting for input or stopping, so runs never overlap.

## input()

Python runs synchronously in the worker, so `input()` has to block there until the learner answers. The worker waits on a `SharedArrayBuffer` with `Atomics.wait`; the page writes the answer into it and wakes the worker. Only the worker blocks, never the page.

`SharedArrayBuffer` needs a **cross-origin isolated** page, so `next.config.ts` sends these headers on every path:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`require-corp` blocks cross-origin resources that don't opt in. Everything CodeStart loads (scripts, fonts, Monaco, Pyodide) is same-origin, so nothing is affected today, but a future third-party image, embed or script will need a `Cross-Origin-Resource-Policy` header (or `crossorigin` attribute). Any proxy in front of Next.js (e.g. Caddy) must pass these headers through.

Without isolation (headers stripped, unusual browsers), Run still works; `input()` raises a clear `RuntimeError`, and Stop always terminates the worker.

## Stop

1. **Gently:** the page writes SIGINT into Pyodide's interrupt buffer, so Python raises `KeyboardInterrupt` at the next bytecode. This ends `while True: pass` in milliseconds and keeps Python loaded.
2. **Forcefully:** if the program hasn't ended within 1 second (for example a long computation inside C code, like `sum(range(10**12))`), the worker is terminated. The next Run starts a new worker, which takes a couple of seconds.

Leaving the lesson page, or the page being hidden by Next.js's navigation cache, also terminates the worker. Switching to another exercise in the same lesson stops the run and clears the output.

## Output

Output is batched in the worker and sent at most every 50 ms, and capped at 100,000 characters per run, so `while True: print(...)` cannot flood or freeze the page. Tracebacks are trimmed to the learner's own code (`File "main.py", line N`), with source lines shown.

## Building

Two scripts run before `npm run dev` and `npm run build` (or run `npm run assets`):

- `scripts/copy-vendor.mjs` copies Monaco and Pyodide from `node_modules` into `public/monaco` and `public/pyodide`, so nothing is loaded from a CDN.
- `scripts/build-python-worker.mjs` bundles the worker with esbuild into `public/python/worker.mjs`. Next.js can't bundle it: Turbopack starts workers as classic workers, and Pyodide only runs in module workers. **When you change files in `src/lib/python/` during `npm run dev`, run `npm run assets` again** and reload.

All three folders are gitignored.

## Tests

- `runnerCore.test.ts` runs the real harness in real Pyodide (in Node): print, stdout/stderr order, unicode, tracebacks, syntax errors, `sys.exit`, `input()`, stopping, output cap.
- `PythonRunner.test.ts` checks the state machine with a scripted fake worker: loading, overlapping runs, input, gentle and forced Stop, crashes, timeouts, cleanup.
- `ExerciseRun.test.tsx` checks the UI: Run uses the current draft, Ctrl+Enter, input box and focus, error summary, Stop, switching exercises, leaving the page.

A real-browser check (headless Chrome against the production build) covered: print, `input()`, exceptions and tracebacks, stopping an infinite loop, a print flood and a C-level computation, repeated runs, no requests carrying learner code, and the worker ending when the page is left.

## Known limitations

- **Not a security sandbox.** Learner code runs on the CodeStart origin. The worker removes `fetch`, `XMLHttpRequest`, `WebSocket` and similar APIs after Pyodide loads, which blocks the obvious ways for pasted code to make requests with the learner's session, but determined JavaScript (e.g. via `js.eval` and dynamic `import()`) could still get around it. The spec's strict Content Security Policy for the worker, or running it on a separate origin, is still to do. This matters only for code the learner chooses to run in their own browser; grading will run on the server sandbox.
- No automatic time limit for Run: the learner presses Stop. (The 5-second limit in the spec applies to Submit.)
- Only the Python standard library is available; packages such as `numpy` are not loaded.
- After a forced Stop the next Run reloads Python (about 2–3 s).
- Errors are shown as standard Python tracebacks; plain-language explanations are a separate roadmap item.
- Code is not saved across reloads (that is the Autosave item).
- Checked in Chrome only; Firefox and Safari support the same APIs but were not tested.
