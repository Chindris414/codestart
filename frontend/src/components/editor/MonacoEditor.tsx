"use client";

// Mounts a Monaco editor into a div. CodeEditor only renders this once
// useMonacoStatus has loaded Monaco in the browser, so it never runs on the
// server.
//
// The editor is created in an effect and disposed in that effect's cleanup.
// Keeping the two symmetric matters: Next.js keeps recently visited pages in
// a hidden React <Activity>, which runs effect cleanups when the page is left
// and re-runs the effects when the learner comes back, while keeping React
// state. The editor is then simply rebuilt from that state.

import type { Monaco } from "@monaco-editor/loader";
import type { editor as MonacoEditorApi } from "monaco-editor";
import { useEffect, useLayoutEffect, useRef } from "react";

// Defaults chosen for beginners writing short Python programs.
export const EDITOR_OPTIONS: MonacoEditorApi.IStandaloneEditorConstructionOptions = {
  language: "python",
  theme: "vs-dark",
  automaticLayout: true, // follow the container's size (responsive)
  fontSize: 14,
  lineNumbers: "on",
  tabSize: 4,
  insertSpaces: true, // PEP 8: four spaces, never tabs
  detectIndentation: false,
  wordWrap: "on", // no sideways scrolling on narrow screens
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderWhitespace: "selection",
  padding: { top: 12, bottom: 12 },
  // Word-based suggestions guess from nearby text; for a beginner they are
  // noise rather than help, so keep autocompletion popups off.
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: "off",
  accessibilitySupport: "auto",
  fixedOverflowWidgets: true,
};

export type MonacoEditorProps = {
  monaco: Monaco;
  // One model per exercise, e.g. "/exercises/<lesson path>/<slug>.py", so
  // each keeps its own undo history while the learner switches exercises.
  modelPath: string;
  // Shared by every exercise of the lesson; those models are disposed together.
  modelPathPrefix: string;
  value: string;
  ariaLabel: string;
  onChange: (code: string) => void;
  // Ctrl+Enter (Cmd+Enter on a Mac), with the editor's current text.
  onRun?: (code: string) => void;
};

type ViewState = MonacoEditorApi.ICodeEditorViewState | null;

function modelFor(monaco: Monaco, path: string, value: string) {
  const uri = monaco.Uri.file(path);
  const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, "python", uri);
  // React state is the source of truth; never show stale model text.
  if (model.getValue() !== value) model.setValue(value);
  return model;
}

export default function MonacoEditor({
  monaco,
  modelPath,
  modelPathPrefix,
  value,
  ariaLabel,
  onChange,
  onRun,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const viewStates = useRef(new Map<string, ViewState>());
  // True while we apply a value ourselves (Reset), so that edit is not
  // reported back as if the learner had typed it.
  const applying = useRef(false);

  // The create effect below runs only on mount; it reads the newest props
  // from here instead of listing them as dependencies.
  const latest = useRef({ modelPath, value, ariaLabel, onChange, onRun });
  useLayoutEffect(() => {
    latest.current = { modelPath, value, ariaLabel, onChange, onRun };
  });

  // Create the editor; dispose it and this lesson's models on cleanup.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { modelPath: path, value: code, ariaLabel: label } = latest.current;
    const savedViews = viewStates.current;

    const editor = monaco.editor.create(container, {
      ...EDITOR_OPTIONS,
      ariaLabel: label,
      model: modelFor(monaco, path, code),
    });
    editor.restoreViewState(savedViews.get(path) ?? null);
    editorRef.current = editor;
    const subscription = editor.onDidChangeModelContent(() => {
      if (!applying.current) latest.current.onChange(editor.getValue());
    });
    const runAction = editor.addAction({
      id: "codestart.run",
      label: "Run code",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => latest.current.onRun?.(editor.getValue()),
    });

    return () => {
      const model = editor.getModel();
      if (model) savedViews.set(model.uri.path, editor.saveViewState());
      subscription.dispose();
      runAction.dispose();
      editor.dispose();
      editorRef.current = null;
      for (const m of monaco.editor.getModels()) {
        if (m.uri.path.startsWith(modelPathPrefix)) m.dispose();
      }
    };
  }, [monaco, modelPathPrefix]);

  // Switching exercise: swap in that exercise's model and restore its
  // cursor and scroll position.
  useEffect(() => {
    const editor = editorRef.current;
    const current = editor?.getModel();
    if (!editor || current?.uri.path === modelPath) return;
    if (current) viewStates.current.set(current.uri.path, editor.saveViewState());
    editor.setModel(modelFor(monaco, modelPath, latest.current.value));
    editor.restoreViewState(viewStates.current.get(modelPath) ?? null);
  }, [monaco, modelPath]);

  // A value that did not come from typing (Reset): apply it as one edit with
  // undo stops on both sides, so Ctrl+Z restores exactly the learner's code.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.uri.path !== modelPath || model.getValue() === value) return;
    applying.current = true;
    try {
      editor.pushUndoStop();
      editor.executeEdits("reset", [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
      editor.pushUndoStop();
    } finally {
      applying.current = false;
    }
  }, [modelPath, value]);

  useEffect(() => {
    editorRef.current?.updateOptions({ ariaLabel });
  }, [ariaLabel]);

  return <div ref={containerRef} className="h-full w-full" />;
}
