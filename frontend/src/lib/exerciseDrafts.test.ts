import { describe, expect, test } from "vitest";

import { draftsReducer, initDrafts, isDirty, normalizeCode } from "./exerciseDrafts";

const exercises = [
  { slug: "first", starter_code: "# first\n" },
  { slug: "second", starter_code: "# second\n" },
];

describe("starter code loading", () => {
  test("every exercise starts from its starter code, first one active", () => {
    const state = initDrafts(exercises);
    expect(state.activeSlug).toBe("first");
    expect(state.drafts).toEqual({ first: "# first\n", second: "# second\n" });
    expect(isDirty(state, "first")).toBe(false);
  });

  test("a lesson without exercises has no active exercise", () => {
    expect(initDrafts([]).activeSlug).toBeNull();
  });

  test("missing starter code becomes an empty editor", () => {
    const state = initDrafts([{ slug: "blank", starter_code: null as unknown as string }]);
    expect(state.drafts.blank).toBe("");
    expect(isDirty(state, "blank")).toBe(false);
  });

  test("Windows line endings in starter code do not count as edits", () => {
    const state = initDrafts([{ slug: "crlf", starter_code: "a = 1\r\nb = 2\r\n" }]);
    expect(state.drafts.crlf).toBe("a = 1\nb = 2\n");
    expect(isDirty(state, "crlf")).toBe(false);
    expect(normalizeCode("x\ry")).toBe("x\ny");
  });
});

describe("edit preservation", () => {
  test("edits survive switching to another exercise and back", () => {
    let state = initDrafts(exercises);
    state = draftsReducer(state, { type: "edit", slug: "first", code: "print('hi')\n" });
    state = draftsReducer(state, { type: "select", slug: "second" });
    expect(state.activeSlug).toBe("second");
    expect(state.drafts.second).toBe("# second\n");

    state = draftsReducer(state, { type: "select", slug: "first" });
    expect(state.drafts.first).toBe("print('hi')\n");
    expect(isDirty(state, "first")).toBe(true);
    expect(isDirty(state, "second")).toBe(false);
  });

  test("typing the starter code back by hand is no longer an edit", () => {
    let state = initDrafts(exercises);
    state = draftsReducer(state, { type: "edit", slug: "first", code: "changed" });
    state = draftsReducer(state, { type: "edit", slug: "first", code: "# first\r\n" });
    expect(isDirty(state, "first")).toBe(false);
  });

  test("an edit identical to the current draft returns the same state", () => {
    const state = initDrafts(exercises);
    expect(draftsReducer(state, { type: "edit", slug: "first", code: "# first\n" })).toBe(state);
  });

  test("actions for an exercise outside this lesson are ignored", () => {
    const state = initDrafts(exercises);
    expect(draftsReducer(state, { type: "select", slug: "nope" })).toBe(state);
    expect(draftsReducer(state, { type: "edit", slug: "nope", code: "x" })).toBe(state);
    expect(draftsReducer(state, { type: "reset", slug: "nope" })).toBe(state);
    expect(isDirty(state, "nope")).toBe(false);
    // Object prototype keys are not exercises either.
    expect(draftsReducer(state, { type: "edit", slug: "toString", code: "x" })).toBe(state);
  });
});

describe("reset", () => {
  test("restores only the given exercise's starter code", () => {
    let state = initDrafts(exercises);
    state = draftsReducer(state, { type: "edit", slug: "first", code: "one" });
    state = draftsReducer(state, { type: "edit", slug: "second", code: "two" });
    state = draftsReducer(state, { type: "reset", slug: "first" });
    expect(state.drafts).toEqual({ first: "# first\n", second: "two" });
    expect(isDirty(state, "first")).toBe(false);
  });
});
