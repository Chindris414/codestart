import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { cancelable, fakeMonaco, FakeModel, loader, resetFakeMonaco } from "@/test/fakeMonaco";

import ExerciseWorkspace, { RESET_CONFIRM_MESSAGE, type WorkspaceExercise } from "./ExerciseWorkspace";

vi.mock("@monaco-editor/loader", () => import("@/test/fakeMonaco"));

const LESSON = "/python-basics/intro/practice";

function exercise(slug: string, starter: string, extra: Partial<WorkspaceExercise> = {}): WorkspaceExercise {
  return {
    slug,
    title: `Title ${slug}`,
    starter_code: starter,
    visible_tests: "",
    instructions: <p>Do {slug}.</p>,
    ...extra,
  };
}

const TWO = [exercise("greet", "# greet here\n"), exercise("count", "# count here\n")];

async function editor() {
  return (await screen.findByTestId("monaco")) as HTMLTextAreaElement;
}

function resetButton() {
  return screen.getByRole("button", { name: "Reset to starter code" });
}

beforeEach(() => {
  resetFakeMonaco();
});

describe("starter code loading", () => {
  test("loads the starter code into a Python editor with its own model path", async () => {
    render(
      <ExerciseWorkspace
        lessonPath={LESSON}
        exercises={[exercise("greet", "# greet here\n", { visible_tests: "def test_x(): ..." })]}
      />,
    );

    const box = await editor();
    expect(box.value).toBe("# greet here\n");
    expect(box.dataset.path).toBe("/exercises/python-basics/intro/practice/greet.py");
    expect(fakeMonaco.models.get(box.dataset.path!)?.languageId).toBe("python");
    const options = fakeMonaco.editors[0].options;
    expect(options).toMatchObject({ language: "python", lineNumbers: "on", tabSize: 4, insertSpaces: true });
    expect(box).toHaveAccessibleName("Code editor for exercise: Title greet");
    expect(screen.getByRole("heading", { name: "Exercise: Title greet" })).toBeTruthy();
    expect(screen.getByText("def test_x(): ...")).toBeTruthy();
    // One exercise: no tabs to choose from.
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  test("shows the starter code read-only while the editor is still loading", () => {
    loader.init.mockImplementation(() => cancelable(new Promise(() => {})));
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);

    expect(screen.getByText("Loading the code editor…")).toBeTruthy();
    expect(screen.getByText("# greet here")).toBeTruthy();
    expect(screen.queryByTestId("monaco")).toBeNull();
  });

  test("Windows line endings in starter code do not enable Reset", async () => {
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={[exercise("crlf", "a = 1\r\n")]} />);
    expect((await editor()).value).toBe("a = 1\n");
    expect(resetButton()).toBeDisabled();
  });

  test("an exercise without starter code opens an empty editor", async () => {
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={[exercise("blank", "")]} />);
    expect((await editor()).value).toBe("");
    expect(resetButton()).toBeDisabled();
  });

  test("renders nothing for a lesson without exercises", () => {
    const { container } = render(<ExerciseWorkspace lessonPath={LESSON} exercises={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("edit preservation", () => {
  test("edits survive switching to another exercise and back", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);

    await user.type(await editor(), "print('hi')");
    expect((await editor()).value).toBe("# greet here\nprint('hi')");

    await user.click(screen.getByRole("tab", { name: /Title count/ }));
    expect((await editor()).value).toBe("# count here\n");
    expect((await editor()).dataset.path).toMatch(/\/count\.py$/);
    // The edited exercise is marked in its tab.
    expect(screen.getByRole("tab", { name: "1. Title greet (edited)" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /Title greet/ }));
    expect((await editor()).value).toBe("# greet here\nprint('hi')");
  });

  test("tabs follow the ARIA pattern and arrow keys switch exercises", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    await editor();

    const [first, second] = screen.getAllByRole("tab");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(/Title greet/);

    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveFocus();
    expect((await editor()).value).toBe("# count here\n");

    await user.keyboard("{ArrowRight}"); // wraps around
    expect(first).toHaveFocus();
    await user.keyboard("{End}");
    expect(second).toHaveFocus();
  });
});

describe("reset to starter code", () => {
  test("is disabled until the code is edited", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    expect(resetButton()).toBeDisabled();
    await user.type(await editor(), "x");
    expect(resetButton()).toBeEnabled();
  });

  test("asks first, and keeps the edits when the learner cancels", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);

    await user.type(await editor(), "x = 1");
    await user.click(resetButton());

    expect(confirm).toHaveBeenCalledWith(RESET_CONFIRM_MESSAGE);
    expect((await editor()).value).toBe("# greet here\nx = 1");
  });

  test("restores the starter code of this exercise only, and announces it", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);

    await user.click(screen.getByRole("tab", { name: /Title count/ }));
    await user.type(await editor(), "n = 3");
    await user.click(screen.getByRole("tab", { name: /Title greet/ }));
    await user.type(await editor(), "x = 1");

    await user.click(resetButton());

    expect((await editor()).value).toBe("# greet here\n");
    expect(resetButton()).toBeDisabled();
    expect(screen.getByText("Starter code restored.")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /Title count/ }));
    expect((await editor()).value).toBe("# count here\nn = 3");
  });

  test("does not ask when there is nothing to lose", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    await user.click(resetButton()); // disabled: the click does nothing
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("editor failure", () => {
  test("falls back to a labelled text box that keeps working", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    loader.init.mockImplementation(() => cancelable(Promise.reject(new Error("blocked"))));
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("could not load");
    const box = screen.getByRole("textbox", { name: "Code editor for exercise: Title greet" });
    expect(box).toHaveValue("# greet here\n");
    expect(screen.queryByTestId("monaco")).toBeNull();

    await user.type(box, "y = 2");
    await user.click(screen.getByRole("tab", { name: /Title count/ }));
    await user.click(screen.getByRole("tab", { name: /Title greet/ }));
    expect(screen.getByRole("textbox", { name: /Title greet/ })).toHaveValue("# greet here\ny = 2");

    await user.click(resetButton());
    expect(screen.getByRole("textbox", { name: /Title greet/ })).toHaveValue("# greet here\n");
  });
});

describe("Monaco editor lifecycle", () => {
  const GREET_PATH = "/exercises/python-basics/intro/practice/greet.py";

  test("reset is wrapped in undo stops, so Ctrl+Z gives back exactly the learner's code", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);

    await user.type(await editor(), "x = 1");
    const monacoEditor = fakeMonaco.editors[0];
    monacoEditor.calls = [];
    await user.click(resetButton());

    expect(monacoEditor.calls).toEqual(["pushUndoStop", "executeEdits", "pushUndoStop"]);
  });

  test("switching exercises swaps models and restores each one's cursor position", async () => {
    const user = userEvent.setup();
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    await editor();

    await user.click(screen.getByRole("tab", { name: /Title count/ }));
    await user.click(screen.getByRole("tab", { name: /Title greet/ }));

    // One editor for the whole lesson, one model per exercise.
    expect(fakeMonaco.editors).toHaveLength(1);
    expect([...fakeMonaco.models.keys()].sort()).toEqual([
      "/exercises/python-basics/intro/practice/count.py",
      GREET_PATH,
    ]);
    expect(fakeMonaco.editors[0].restoredViewStates.at(-1)).toEqual({ cursorFor: GREET_PATH });
  });

  test("unmounting disposes the editor and this lesson's models, and leaves others alone", async () => {
    const other = fakeMonaco.editor.createModel("x", "python", { path: "/exercises/other/lesson/greet.py" });
    const { unmount } = render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    await editor();
    const mine = fakeMonaco.models.get(GREET_PATH) as FakeModel;

    unmount();

    expect(fakeMonaco.editors[0].disposed).toBe(true);
    expect(mine.dispose).toHaveBeenCalledOnce();
    expect(other.dispose).not.toHaveBeenCalled();
  });

  test("a stale model left in Monaco never overrides the starter code", async () => {
    fakeMonaco.editor.createModel("old text", "python", { path: GREET_PATH });
    render(<ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />);
    expect((await editor()).value).toBe("# greet here\n");
  });

  // Next.js keeps recently visited pages in a hidden <Activity>: leaving runs
  // effect cleanups (disposing the editor) but keeps React state. Coming back
  // must rebuild a working editor from that state. (This crashed with
  // @monaco-editor/react, which reused its disposed editor.)
  test("survives being hidden and shown again, keeping the learner's edits", async () => {
    const user = userEvent.setup();
    const page = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ExerciseWorkspace lessonPath={LESSON} exercises={TWO} />
      </Activity>
    );
    const { rerender } = render(page("visible"));
    await user.type(await editor(), "kept = True");

    await act(async () => rerender(page("hidden")));
    expect(fakeMonaco.editors[0].disposed).toBe(true);
    expect(fakeMonaco.models.size).toBe(0);

    await act(async () => rerender(page("visible")));
    const live = fakeMonaco.editors.filter((e) => !e.disposed);
    expect(live).toHaveLength(1);
    expect((await editor()).value).toBe("# greet here\nkept = True");

    // And it still works after coming back.
    await user.type(await editor(), "!");
    expect((await editor()).value).toBe("# greet here\nkept = True!");
  });
});
