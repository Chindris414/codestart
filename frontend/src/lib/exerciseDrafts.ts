// In-memory drafts of the learner's code, one per exercise in a lesson.
//
// This state is the single source of truth: the Monaco editor (or the plain
// textarea fallback) only displays it. Drafts live as long as the lesson page
// is open, so switching between a lesson's exercises keeps every edit.
// Autosave (useDraftAutosave) hydrates saved code into this state on load and
// writes changes back out; see lib/draftSync for where saved drafts live.

export type StarterExercise = { slug: string; starter_code: string };

export type DraftState = {
  activeSlug: string | null;
  starters: Record<string, string>;
  drafts: Record<string, string>;
};

export type DraftAction =
  | { type: "select"; slug: string }
  | { type: "edit"; slug: string; code: string }
  | { type: "reset"; slug: string }
  | { type: "hydrate"; drafts: Record<string, string> };

// Content written on Windows may arrive with CRLF line endings. Monaco reports
// its text with "\n", so without normalising, untouched starter code would
// already count as "edited".
export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").replace(/\r\n?/g, "\n");
}

export function initDrafts(exercises: StarterExercise[]): DraftState {
  const starters: Record<string, string> = {};
  for (const exercise of exercises) {
    starters[exercise.slug] = normalizeCode(exercise.starter_code);
  }
  return {
    activeSlug: exercises[0]?.slug ?? null,
    starters,
    drafts: { ...starters },
  };
}

function knows(state: DraftState, slug: string): boolean {
  return Object.hasOwn(state.starters, slug);
}

export function draftsReducer(state: DraftState, action: DraftAction): DraftState {
  // Saved code arriving from the server or localStorage fills in exercises
  // the learner has not touched yet; anything already typed on this page is
  // newer than any stored draft and wins.
  if (action.type === "hydrate") {
    const drafts = { ...state.drafts };
    let changed = false;
    for (const [slug, code] of Object.entries(action.drafts)) {
      if (!knows(state, slug)) continue;
      if (drafts[slug] !== state.starters[slug]) continue;
      const normalized = normalizeCode(code);
      if (drafts[slug] === normalized) continue;
      drafts[slug] = normalized;
      changed = true;
    }
    return changed ? { ...state, drafts } : state;
  }

  // Actions for an exercise that is not in this lesson are ignored rather
  // than creating a stray draft.
  if (!knows(state, action.slug)) return state;

  switch (action.type) {
    case "select":
      return action.slug === state.activeSlug ? state : { ...state, activeSlug: action.slug };
    case "edit": {
      const code = normalizeCode(action.code);
      if (state.drafts[action.slug] === code) return state;
      return { ...state, drafts: { ...state.drafts, [action.slug]: code } };
    }
    case "reset":
      return { ...state, drafts: { ...state.drafts, [action.slug]: state.starters[action.slug] } };
  }
}

export function isDirty(state: DraftState, slug: string): boolean {
  if (!knows(state, slug)) return false;
  return normalizeCode(state.drafts[slug]) !== state.starters[slug];
}
