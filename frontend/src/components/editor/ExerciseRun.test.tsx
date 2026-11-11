import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { isStopRequested, waitForInputLine, type FromWorker, type ToWorker } from "@/lib/python/protocol";
import { LOAD_FAILED_MESSAGE, type WorkerLike } from "@/lib/python/PythonRunner";
import { cancelable, fakeMonaco, loader, resetFakeMonaco } from "@/test/fakeMonaco";

import ExerciseWorkspace, { type WorkspaceExercise } from "./ExerciseWorkspace";

vi.mock("@monaco-editor/loader", () => import("@/test/fakeMonaco"));

class FakePythonWorker implements WorkerLike {
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
    act(() => this.onmessage?.({ data: message } as MessageEvent<FromWorker>));
  }
  get init() {
    return this.posted.find((m) => m.type === "init") as Extract<ToWorker, { type: "init" }>;
  }
  get runs() {
    return this.posted.filter((m) => m.type === "run") as Extract<ToWorker, { type: "run" }>[];
  }
  get runId() {
    return this.runs.at(-1)!.runId;
  }
  // Helpers standing in for what the real worker does.
  print(text: string, stream: "stdout" | "stderr" = "stdout") {
    this.send({ type: "output", runId: this.runId, stream, text });
  }
  finish(outcome: Extract<FromWorker, { type: "done" }>["outcome"] = { kind: "success" }) {
    this.send({ type: "done", runId: this.runId, outcome });
  }
}

const workers: FakePythonWorker[] = [];
vi.mock("@/lib/python/createPythonWorker", () => ({
  createPythonWorker: () => {
    const worker = new FakePythonWorker();
    workers.push(worker);
    return worker;
  },
}));

const LESSON = "/tracks/python-basics/intro/practice";

function exercise(slug: string, starter: string): WorkspaceExercise {
  return { slug, title: `Title ${slug}`, starter_code: starter, visible_tests: "", instructions: <p>Do {slug}.</p> };
}
const ONE = [exercise("greet", "print('hi')\n")];
const TWO = [exercise("greet", "print('hi')\n"), exercise("count", "print(1)\n")];

const editor = async () => (await screen.findByTestId("monaco")) as HTMLTextAreaElement;
const runButton = () => screen.getByRole("button", { name: "▶ Run" });
const stopButton = () => screen.getByRole("button", { name: "■ Stop" });
const output = () => screen.getByRole("log", { name: "Program output" });

// Clicks Run and lets Python "load".
async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.click(runButton());
  const worker = workers.at(-1)!;
  if (worker.runs.length === 0) worker.send({ type: "ready" });
  return worker;
}

beforeEach(() => {
  resetFakeMonaco();
  workers.length = 0;
  Object.defineProperty(window, "crossOriginIsolated", { value: true, configurable: true });
});
afterEach(() => {
  Object.defineProperty(window, "crossOriginIsolated", { value: undefined, configurable: true });
});

describe("running code", () => {
  test("Run executes the learner's current draft, not the starter code, and shows the output", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    expect(workers).toHaveLength(0); // Python is only loaded when needed
    await user.type(await editor(), "print('mine')");

    await user.click(runButton());
    expect(screen.getByText(/Loading Python/)).toBeInTheDocument();
    workers[0].send({ type: "ready" });
    expect(workers[0].runs[0].code).toBe("print('hi')\nprint('mine')");
    expect(screen.getByText("Running…")).toBeInTheDocument();

    workers[0].print("hi\nmine\n");
    workers[0].finish();
    expect(output()).toHaveTextContent("hi mine");
    expect(screen.getByText("Finished.")).toBeInTheDocument();
  });

  test("Ctrl+Enter in the editor runs the editor's text", async () => {
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    act(() => fakeMonaco.editors[0].trigger("codestart.run"));
    workers[0].send({ type: "ready" });
    expect(workers[0].runs[0].code).toBe("print('hi')\n");
    expect(fakeMonaco.editors[0].actions.get("codestart.run")?.keybindings).toEqual([2048 | 3]);
  });

  test("Run is unavailable while a program runs, so runs never overlap", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    expect(stopButton()).toHaveAttribute("aria-disabled", "true");

    const worker = await run(user);
    expect(runButton()).toHaveAttribute("aria-disabled", "true");
    expect(stopButton()).toHaveAttribute("aria-disabled", "false");
    await user.click(runButton());
    act(() => fakeMonaco.editors[0].trigger("codestart.run"));
    expect(worker.runs).toHaveLength(1);

    worker.finish();
    expect(runButton()).toHaveAttribute("aria-disabled", "false");
    await user.click(runButton());
    expect(worker.runs).toHaveLength(2); // same worker, Python stays loaded
    expect(workers).toHaveLength(1);
  });

  test("a Python error shows the traceback and a summary with the line", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    worker.print("Traceback (most recent call last):\nNameError: name 'x' is not defined\n", "stderr");
    worker.finish({ kind: "error", name: "NameError", line: 3 });

    expect(screen.getByText("Your program stopped with NameError on line 3. See the details below.")).toBeInTheDocument();
    expect(output()).toHaveTextContent("Error output: Traceback (most recent call last):");
  });

  test("Clear output empties the output box", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    worker.print("hello\n");
    worker.finish();
    await user.click(screen.getByRole("button", { name: "Clear output" }));
    expect(output()).not.toHaveTextContent("hello");
  });
});

describe("input()", () => {
  test("asks for input in a labelled box, sends the answer and echoes it", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    worker.print("Name? ");
    worker.send({ type: "input-request", runId: worker.runId });

    expect(screen.getByText("Your program is waiting for input.")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "Type your answer and press Enter" });
    expect(box).toHaveFocus();
    await user.type(box, "Ada{Enter}");

    expect(waitForInputLine(worker.init.control!)).toBe("Ada");
    expect(output()).toHaveTextContent("Name? You typed: Ada");
    expect(screen.queryByRole("textbox", { name: /Type your answer/ })).toBeNull();
    expect(output()).toHaveFocus();
    expect(screen.getByText("Running…")).toBeInTheDocument();
  });

  test("an empty answer is a valid answer", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    worker.send({ type: "input-request", runId: worker.runId });
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(waitForInputLine(worker.init.control!)).toBe("");
  });
});

describe("stopping", () => {
  test("Stop interrupts the program and reports it", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    await user.click(stopButton());
    expect(screen.getByText("Stopping…")).toBeInTheDocument();
    expect(isStopRequested(worker.init.control!)).toBe(true);
    worker.finish({ kind: "stopped" });
    expect(screen.getByText("Stopped.")).toBeInTheDocument();
    expect(runButton()).toHaveAttribute("aria-disabled", "false");
  });

  test("Stop while waiting for input removes the input box", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    worker.send({ type: "input-request", runId: worker.runId });
    await user.click(stopButton());
    expect(screen.queryByRole("textbox", { name: /Type your answer/ })).toBeNull();
  });
});

describe("cleanup", () => {
  test("switching exercise stops the run and clears the output, keeping every draft", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    await user.type(await editor(), "x = 1");
    const worker = await run(user);
    worker.print("partial\n");

    await user.click(screen.getByRole("tab", { name: /Title count/ }));
    expect(isStopRequested(worker.init.control!)).toBe(true);
    expect(output()).not.toHaveTextContent("partial");
    worker.finish({ kind: "stopped" });
    expect(screen.queryByText("Stopped.")).toBeNull(); // back to a clean slate

    await user.click(screen.getByRole("tab", { name: /Title greet/ }));
    expect((await editor()).value).toBe("print('hi')\nx = 1");
  });

  test("leaving the lesson terminates the worker", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    const worker = await run(user);
    unmount();
    expect(worker.terminated).toBe(true);
  });

  test("a lesson hidden by Next.js (Activity) shuts Python down and works again when shown", async () => {
    const user = userEvent.setup();
    const page = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />
      </Activity>
    );
    const { rerender } = render(page("visible"));
    await user.type(await editor(), "y = 2");
    const first = await run(user);

    await act(async () => rerender(page("hidden")));
    expect(first.terminated).toBe(true);

    await act(async () => rerender(page("visible")));
    expect(screen.getByText("Stopped.")).toBeInTheDocument();
    const second = await run(user);
    expect(second).not.toBe(first);
    expect(second.runs[0].code).toBe("print('hi')\ny = 2");
  });

  test("Reset to starter code doesn't disturb the output", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await user.type(await editor(), "z = 3");
    const worker = await run(user);
    worker.print("out\n");
    worker.finish();
    await user.click(screen.getByRole("button", { name: "Reset to starter code" }));
    expect((await editor()).value).toBe("print('hi')\n");
    expect(output()).toHaveTextContent("out");
  });
});

describe("failure", () => {
  test("Python failing to load is announced, and Run tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    await editor();
    await user.click(runButton());
    workers[0].send({ type: "load-error", message: "404" });
    expect(screen.getByRole("alert")).toHaveTextContent(LOAD_FAILED_MESSAGE);

    await user.click(runButton());
    expect(workers).toHaveLength(2);
  });

  test("Ctrl+Enter works in the plain-text fallback editor too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loader.init.mockImplementation(() => cancelable(Promise.reject(new Error("blocked"))));
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={ONE} />);
    const box = await screen.findByRole("textbox", { name: /Code editor for exercise/ });
    await user.type(box, "# edit");
    await user.keyboard("{Control>}{Enter}{/Control}");
    workers[0].send({ type: "ready" });
    expect(workers[0].runs[0].code).toBe("print('hi')\n# edit");
  });
});
