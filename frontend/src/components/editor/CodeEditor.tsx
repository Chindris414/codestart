"use client";

import { useId } from "react";

import MonacoEditor from "./MonacoEditor";
import { useMonacoStatus } from "./useMonacoStatus";

// Same height for the preview, the editor and the fallback, so nothing jumps
// when Monaco appears. Grows with the viewport, within sensible limits.
const BOX = "h-[clamp(16rem,50vh,28rem)] w-full overflow-hidden rounded border border-gray-700";

// Shown while Monaco loads (and during SSR): the code itself, read-only, so
// the learner can already read it and the page doesn't shift on load.
function Preview({ code }: { code: string }) {
  return (
    <pre className={`${BOX} overflow-auto bg-[#1e1e1e] p-3 font-mono text-sm text-gray-100`}>
      <code>{code}</code>
    </pre>
  );
}

export type CodeEditorProps = {
  // Unique per exercise, e.g. "/exercises/<track>/<module>/<lesson>/<slug>.py"
  modelPath: string;
  // Shared by every exercise of the lesson; used to clean up Monaco models.
  modelPathPrefix: string;
  value: string;
  label: string;
  onChange: (code: string) => void;
  onRun?: (code: string) => void;
};

export default function CodeEditor({ modelPath, modelPathPrefix, value, label, onChange, onRun }: CodeEditorProps) {
  const { status, monaco } = useMonacoStatus();
  const hintId = useId();

  return (
    <div>
      {status === "loading" && (
        <>
          <p role="status" className="mb-2 text-sm text-gray-500">Loading the code editor…</p>
          <Preview code={value} />
        </>
      )}

      {status === "ready" && (
        <div className={BOX}>
          <MonacoEditor
            monaco={monaco}
            modelPath={modelPath}
            modelPathPrefix={modelPathPrefix}
            value={value}
            ariaLabel={label}
            onChange={onChange}
            onRun={onRun}
          />
        </div>
      )}

      {status === "failed" && (
        <>
          <p role="alert" className="mb-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The code editor could not load, so here is a plain text box instead. Your code works the
            same way. Reloading the page may bring the full editor back.
          </p>
          <textarea
            aria-label={label}
            aria-describedby={hintId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onRun?.(e.currentTarget.value);
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className={`${BOX} resize-y bg-[#1e1e1e] p-3 font-mono text-sm text-gray-100`}
          />
        </>
      )}

      <p id={hintId} className="mt-2 text-xs text-gray-500">
        {status === "failed"
          ? "Ctrl+Enter runs your code. Tab moves to the next control in this text box; indent with spaces."
          : "Ctrl+Enter (Cmd+Enter on a Mac) runs your code. Tab indents with four spaces. Press Ctrl+M (Ctrl+Shift+M on a Mac) to make Tab move focus out of the editor, and Alt+F1 for accessibility help."}
      </p>
    </div>
  );
}
