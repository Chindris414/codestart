"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { INPUT_MAX_CHARS } from "@/lib/python/protocol";
import type { OutputChunk, RunnerSnapshot, RunStatus } from "@/lib/python/PythonRunner";

const BUSY: RunStatus[] = ["loading", "running", "waiting-input", "stopping"];

export function statusMessage(snapshot: RunnerSnapshot): string {
  switch (snapshot.status) {
    case "idle":
      return "";
    case "loading":
      return "Loading Python… The first run takes a few seconds.";
    case "running":
      return "Running…";
    case "waiting-input":
      return "Your program is waiting for input.";
    case "stopping":
      return "Stopping…";
    case "success":
      return "Finished.";
    case "stopped":
      return "Stopped.";
    case "failed":
      return snapshot.failure ?? "Python could not run.";
    case "error": {
      if (snapshot.errorName === "SystemExit") return "Your program exited with an error code.";
      const where = snapshot.errorLine ? ` on line ${snapshot.errorLine}` : "";
      return `Your program stopped with ${snapshot.errorName ?? "an error"}${where}. See the details below.`;
    }
  }
}

const STATUS_STYLE: Partial<Record<RunStatus, string>> = {
  success: "text-green-700",
  error: "text-red-700",
  failed: "text-red-700",
  "waiting-input": "text-blue-700 font-medium",
};

const CHUNK_STYLE: Record<OutputChunk["stream"], string> = {
  stdout: "text-gray-100",
  stderr: "text-red-300",
  input: "text-emerald-300 font-semibold",
  notice: "text-amber-300 italic",
};

export type RunPanelProps = {
  snapshot: RunnerSnapshot;
  onRun: () => void;
  onStop: () => void;
  onClear: () => void;
  onSubmitInput: (text: string) => void;
};

export default function RunPanel({ snapshot, onRun, onStop, onClear, onSubmitInput }: RunPanelProps) {
  const { status, output } = snapshot;
  const busy = BUSY.includes(status);
  const canStop = status === "loading" || status === "running" || status === "waiting-input";
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const inputId = useId();
  const statusId = useId();

  // Keep the newest output in view, unless the learner scrolled up to read.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && followOutput.current) log.scrollTop = log.scrollHeight;
  }, [output]);

  // When the program asks for input, put the cursor in the answer box.
  useEffect(() => {
    if (status === "waiting-input") inputRef.current?.focus();
  }, [status]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmitInput(answer);
    setAnswer("");
    // The box goes away while the program continues; keep focus nearby.
    logRef.current?.focus();
  }

  const message = statusMessage(snapshot);
  const hasOutput = output.length > 0;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* aria-disabled rather than disabled, so keyboard focus stays on the
            button while it can't be used. */}
        <button
          type="button"
          onClick={() => !busy && onRun()}
          aria-disabled={busy}
          aria-describedby={statusId}
          className="rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-800 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          ▶ Run
        </button>
        <button
          type="button"
          onClick={() => canStop && onStop()}
          aria-disabled={!canStop}
          className="rounded border border-red-700 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          ■ Stop
        </button>
        <button
          type="button"
          onClick={() => hasOutput && onClear()}
          aria-disabled={!hasOutput}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          Clear output
        </button>
        <p
          id={statusId}
          role={status === "failed" ? "alert" : "status"}
          className={`min-h-5 basis-full text-sm sm:basis-auto ${STATUS_STYLE[status] ?? "text-gray-600"}`}
        >
          {message}
        </p>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-label="Program output"
        tabIndex={-1}
        onScroll={(e) => {
          const el = e.currentTarget;
          followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="mt-2 max-h-80 min-h-24 overflow-auto rounded border border-gray-700 bg-gray-950 p-3 font-mono text-sm focus:outline-2 focus:outline-blue-500"
      >
        {hasOutput ? (
          <pre className="whitespace-pre-wrap break-words">
            {output.map((chunk, index) => (
              <span key={index} className={CHUNK_STYLE[chunk.stream]}>
                {chunk.stream === "stderr" && <span className="sr-only">Error output: </span>}
                {chunk.stream === "input" && <span className="sr-only">You typed: </span>}
                {chunk.text}
              </span>
            ))}
          </pre>
        ) : (
          <p className="text-gray-500">
            {status === "idle" || status === "loading"
              ? "Press Run to see what your program prints."
              : "Your program printed nothing."}
          </p>
        )}
      </div>

      {status === "waiting-input" && (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
          <label htmlFor={inputId} className="basis-full text-sm font-medium text-blue-800">
            Type your answer and press Enter
          </label>
          <input
            id={inputId}
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={INPUT_MAX_CHARS}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-blue-600 px-3 py-1.5 font-mono text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
            Send
          </button>
        </form>
      )}
    </div>
  );
}
