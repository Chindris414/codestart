// Autosave behaviour of ExerciseWorkspace: restoring saved drafts, the
// debounced save, the saved/saving status line, and Reset discarding the
// stored draft. Server calls are mocked; a visitor's localStorage is real.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  deleteServerDraft,
  fetchServerDrafts,
  readLocalDrafts,
  saveServerDraft,
  writeLocalDraft,
  type StoredDraft,
} from "@/lib/draftSync";
import { fakeMonaco, resetFakeMonaco } from "@/test/fakeMonaco";

import ExerciseWorkspace, { type WorkspaceExercise } from "./ExerciseWorkspace";

vi.mock("@monaco-editor/loader", () => import("@/test/fakeMonaco"));
vi.mock("@/lib/draftSync", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/draftSync")>();
  return {
    ...real,
    fetchServerDrafts: vi.fn(),
    saveServerDraft: vi.fn(),
    deleteServerDraft: vi.fn(),
  };
});

const fetchDrafts = vi.mocked(fetchServerDrafts);
const saveDraft = vi.mocked(saveServerDraft);
const deleteDraft = vi.mocked(deleteServerDraft);

const LESSON = "/tracks/python-basics/intro/practice";
const SLUG_PATH = "python-basics/intro/practice";

const EXERCISES: WorkspaceExercise[] = [
  {
    slug: "greet",
    title: "Greet",
    starter_code: "# greet here\n",
    visible_tests: "",
    instructions: <p>Say hi.</p>,
  },
];

function workspace(isLoggedIn: boolean) {
  return <ExerciseWorkspace lessonPath={LESSON} exercises={EXERCISES} isLoggedIn={isLoggedIn} />;
}

async function editor() {
  return (await screen.findByTestId("monaco")) as HTMLTextAreaElement;
}

function typist() {
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

async function letAutosaveFire() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
}

beforeEach(() => {
  resetFakeMonaco();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchDrafts.mockReset().mockResolvedValue({});
  saveDraft.mockReset().mockResolvedValue(undefined);
  deleteDraft.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a logged-in learner", () => {
  test("gets their saved code back instead of the starter code", async () => {
    fetchDrafts.mockResolvedValue({
      greet: { code: "print('saved on the server')", saved_at: "2026-11-12T10:00:00Z" },
    });
    render(workspace(true));

    const box = await editor();
    await waitFor(() => expect(box.value).toBe("print('saved on the server')"));
    expect(fetchDrafts).toHaveBeenCalledWith(SLUG_PATH);
  });

  test("typing saves to the server after a pause, and shows Saving… then Saved", async () => {
    const user = typist();
    render(workspace(true));
    await user.type(await editor(), "x = 1");

    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(saveDraft).not.toHaveBeenCalled(); // debounced, not per keystroke

    await letAutosaveFire();
    expect(saveDraft).toHaveBeenCalledWith(SLUG_PATH, "greet", "# greet here\nx = 1", {
      keepalive: false,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  test("code typed while drafts are still loading wins over the stored draft", async () => {
    let resolveDrafts!: (drafts: Record<string, StoredDraft>) => void;
    fetchDrafts.mockReturnValue(new Promise((resolve) => (resolveDrafts = resolve)));
    const user = typist();
    render(workspace(true));
    await user.type(await editor(), "fresh");

    await act(async () => {
      resolveDrafts({ greet: { code: "stale stored code", saved_at: null } });
    });

    expect((await editor()).value).toBe("# greet here\nfresh");
    // ...and what they typed is treated as unsaved and written out.
    await letAutosaveFire();
    expect(saveDraft).toHaveBeenCalledWith(SLUG_PATH, "greet", "# greet here\nfresh", {
      keepalive: false,
    });
  });

  test("Reset also deletes the saved draft on the server", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = typist();
    render(workspace(true));
    await user.type(await editor(), "wrong turn");
    await letAutosaveFire();

    await user.click(screen.getByRole("button", { name: "Reset to starter code" }));

    expect(deleteDraft).toHaveBeenCalledWith(SLUG_PATH, "greet");
    expect((await editor()).value).toBe("# greet here\n");
    // Nothing left to autosave afterwards.
    saveDraft.mockClear();
    await letAutosaveFire();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  test("a failed save shows the error status and retries by itself", async () => {
    saveDraft.mockRejectedValue(new Error("down"));
    const user = typist();
    render(workspace(true));
    await user.type(await editor(), "x");

    await letAutosaveFire();
    expect(await screen.findByText("Couldn't save — will retry")).toBeInTheDocument();

    saveDraft.mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000); // the retry timer
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});

describe("a visitor on a sample lesson", () => {
  test("gets their browser-saved code back instead of the starter code", async () => {
    writeLocalDraft(SLUG_PATH, "greet", "print('kept in this browser')");
    render(workspace(false));

    const box = await editor();
    await waitFor(() => expect(box.value).toBe("print('kept in this browser')"));
    expect(fetchDrafts).not.toHaveBeenCalled();
  });

  test("typing saves to this browser and says so", async () => {
    const user = typist();
    render(workspace(false));
    await user.type(await editor(), "x = 1");

    await letAutosaveFire();
    expect(readLocalDrafts(SLUG_PATH).greet.code).toBe("# greet here\nx = 1");
    expect(await screen.findByText("Saved in this browser")).toBeInTheDocument();
    expect(saveDraft).not.toHaveBeenCalled();

    expect(
      screen.getByText(/saved in this browser; create a free account/i),
    ).toBeInTheDocument();
  });

  test("Reset also removes the browser copy", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = typist();
    render(workspace(false));
    await user.type(await editor(), "oops");
    await letAutosaveFire();
    expect(readLocalDrafts(SLUG_PATH).greet).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Reset to starter code" }));
    expect(readLocalDrafts(SLUG_PATH).greet).toBeUndefined();
    expect(deleteDraft).not.toHaveBeenCalled();
  });
});

describe("before any edit", () => {
  test("no save status is shown and nothing is saved", async () => {
    render(workspace(true));
    await editor();
    await letAutosaveFire();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByText("Saving…")).toBeNull();
    expect(fakeMonaco.editors).toHaveLength(1);
  });
});
