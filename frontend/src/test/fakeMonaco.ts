// Test double for @monaco-editor/loader and the part of the Monaco API that
// MonacoEditor uses. Monaco needs a real browser, so editor.create() puts a
// <textarea data-testid="monaco"> in the container instead, wired to the
// same model / setModel / executeEdits / dispose calls.
//
// Use in a test file:
//   vi.mock("@monaco-editor/loader", () => import("@/test/fakeMonaco"));

import { vi } from "vitest";

type Listener = () => void;

export class FakeModel {
  disposed = false;
  constructor(
    public value: string,
    public languageId: string,
    public uri: { path: string },
  ) {}
  getValue() {
    return this.value;
  }
  setValue(value: string) {
    this.value = value;
  }
  getFullModelRange() {
    return { full: true };
  }
  dispose = vi.fn(() => {
    this.disposed = true;
    fakeMonaco.models.delete(this.uri.path);
  });
}

export class FakeEditor {
  textarea: HTMLTextAreaElement;
  listeners: Listener[] = [];
  calls: string[] = []; // order of pushUndoStop / executeEdits, for undo checks
  disposed = false;
  restoredViewStates: unknown[] = [];
  actions = new Map<string, { keybindings?: number[]; run: () => void }>();

  constructor(
    container: HTMLElement,
    public options: Record<string, unknown>,
    public model: FakeModel | null,
  ) {
    this.textarea = document.createElement("textarea");
    this.textarea.dataset.testid = "monaco";
    this.textarea.setAttribute("aria-label", String(options.ariaLabel ?? ""));
    this.textarea.value = model?.value ?? "";
    // Typing in the textarea plays the role of typing in Monaco.
    this.textarea.addEventListener("input", () => {
      if (!this.model) return;
      this.model.value = this.textarea.value;
      this.fire();
    });
    container.appendChild(this.textarea);
  }
  private fire() {
    for (const listener of this.listeners) listener();
  }
  getModel() {
    return this.model;
  }
  getValue() {
    return this.model?.value ?? "";
  }
  setModel(model: FakeModel | null) {
    this.model = model;
    this.textarea.value = model?.value ?? "";
    this.textarea.dataset.path = model?.uri.path ?? "";
  }
  onDidChangeModelContent(listener: Listener) {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }
  pushUndoStop() {
    this.calls.push("pushUndoStop");
  }
  executeEdits(_source: string, edits: { text: string }[]) {
    this.calls.push("executeEdits");
    if (!this.model) return;
    this.model.value = edits[0].text;
    this.textarea.value = this.model.value;
    this.fire();
  }
  saveViewState() {
    return { cursorFor: this.model?.uri.path };
  }
  restoreViewState(state: unknown) {
    this.restoredViewStates.push(state);
  }
  updateOptions(options: Record<string, unknown>) {
    Object.assign(this.options, options);
    if ("ariaLabel" in options) this.textarea.setAttribute("aria-label", String(options.ariaLabel));
  }
  addAction(action: { id: string; keybindings?: number[]; run: () => void }) {
    this.actions.set(action.id, action);
    return { dispose: () => this.actions.delete(action.id) };
  }
  // Stands in for pressing an action's key binding in Monaco.
  trigger(id: string) {
    this.actions.get(id)?.run();
  }
  dispose() {
    this.disposed = true;
    this.textarea.remove();
  }
}

export const fakeMonaco = {
  models: new Map<string, FakeModel>(),
  editors: [] as FakeEditor[],
  Uri: { file: (path: string) => ({ path }) },
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { Enter: 3 },
  editor: {
    create(container: HTMLElement, options: Record<string, unknown> & { model?: FakeModel }) {
      const editor = new FakeEditor(container, options, options.model ?? null);
      editor.setModel(options.model ?? null);
      fakeMonaco.editors.push(editor);
      return editor;
    },
    getModel: (uri: { path: string }) => fakeMonaco.models.get(uri.path) ?? null,
    createModel(value: string, languageId: string, uri: { path: string }) {
      const model = new FakeModel(value, languageId, uri);
      fakeMonaco.models.set(uri.path, model);
      return model;
    },
    getModels: () => [...fakeMonaco.models.values()],
  },
};

type CancelablePromise<T> = Promise<T> & { cancel: () => void };

// Wraps a promise the way @monaco-editor/loader does: cancel() makes it
// reject with { type: "cancelation" }.
export function cancelable<T>(promise: Promise<T>): CancelablePromise<T> {
  let cancelled = false;
  const wrapped = new Promise<T>((resolve, reject) => {
    promise.then(
      (value) => (cancelled ? reject({ type: "cancelation" }) : resolve(value)),
      (error) => reject(cancelled ? { type: "cancelation" } : error),
    );
  }) as CancelablePromise<T>;
  wrapped.cancel = () => {
    cancelled = true;
  };
  return wrapped;
}

const loader = {
  config: vi.fn(),
  init: vi.fn((): CancelablePromise<unknown> => cancelable(Promise.resolve(fakeMonaco))),
};
export default loader;
export { loader };

export function resetFakeMonaco() {
  fakeMonaco.models.clear();
  fakeMonaco.editors = [];
  loader.config.mockClear();
  loader.init.mockReset();
  loader.init.mockImplementation(() => cancelable(Promise.resolve(fakeMonaco)));
}
