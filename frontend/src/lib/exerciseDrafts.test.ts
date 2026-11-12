import { describe, expect, test } from "vitest";

import { draftsReducer, initDrafts, isDirty } from "./exerciseDrafts";

const STATE = initDrafts([
  { slug: "greet", starter_code: "# greet\n" },
  { slug: "count", starter_code: "# count\n" },
]);

describe("hydrating saved drafts", () => {
  test("fills exercises the learner has not touched", () => {
    const state = draftsReducer(STATE, {
      type: "hydrate",
      drafts: { greet: "print('saved')" },
    });
    expect(state.drafts.greet).toBe("print('saved')");
    expect(state.drafts.count).toBe("# count\n");
    expect(isDirty(state, "greet")).toBe(true);
  });

  test("never overwrites code already typed on this page", () => {
    const edited = draftsReducer(STATE, { type: "edit", slug: "greet", code: "my fresh code" });
    const state = draftsReducer(edited, {
      type: "hydrate",
      drafts: { greet: "stale stored code", count: "stored count" },
    });
    expect(state.drafts.greet).toBe("my fresh code");
    expect(state.drafts.count).toBe("stored count");
  });

  test("ignores drafts for exercises not in this lesson", () => {
    const state = draftsReducer(STATE, { type: "hydrate", drafts: { stray: "x" } });
    expect(state).toBe(STATE); // unchanged, same object
  });

  test("normalises Windows line endings from storage", () => {
    const state = draftsReducer(STATE, { type: "hydrate", drafts: { greet: "a = 1\r\n" } });
    expect(state.drafts.greet).toBe("a = 1\n");
  });

  test("returns the same state when nothing changes", () => {
    const state = draftsReducer(STATE, { type: "hydrate", drafts: { greet: "# greet\n" } });
    expect(state).toBe(STATE);
  });
});
