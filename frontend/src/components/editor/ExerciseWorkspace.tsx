"use client";

import { useId, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { draftsReducer, initDrafts, isDirty } from "@/lib/exerciseDrafts";

import CodeEditor from "./CodeEditor";
import RunPanel from "./RunPanel";
import { usePythonRunner } from "./usePythonRunner";

export type WorkspaceExercise = {
  slug: string;
  title: string;
  starter_code: string;
  visible_tests: string;
  // Rendered on the server (Markdown) and passed in as ready-made elements.
  instructions: ReactNode;
};

export const RESET_CONFIRM_MESSAGE =
  "Reset to the starter code? Your changes to this exercise will be lost.";

// The exercises of one lesson, each with its own code editor. Edits are kept
// per exercise while the lesson page stays open, including when switching
// between exercises. The parent gives this component key={lessonPath}, so
// drafts never leak from one lesson into another. (Next.js may also keep a
// recently left lesson alive in a hidden <Activity>; coming back then shows
// the same drafts. Nothing is saved across a reload: that is "Autosave".)
//
// Run executes the active exercise's current draft in a Python Web Worker
// (see lib/python). One runner serves the lesson; switching exercise stops a
// run in progress and clears the output.
export default function ExerciseWorkspace({
  lessonPath,
  exercises,
}: {
  lessonPath: string;
  exercises: WorkspaceExercise[];
}) {
  const [state, dispatch] = useReducer(draftsReducer, exercises, initDrafts);
  const [announcement, setAnnouncement] = useState("");
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { runner, snapshot } = usePythonRunner();

  const active = exercises.find((e) => e.slug === state.activeSlug);
  if (!active) return null;

  const activeIndex = exercises.indexOf(active);
  const dirty = isDirty(state, active.slug);
  const tabId = (slug: string) => `${baseId}-tab-${slug}`;
  const panelId = `${baseId}-panel`;
  const modelPathPrefix = `/exercises${lessonPath}/`;

  function select(index: number) {
    const exercise = exercises[index];
    if (exercise.slug !== state.activeSlug) runner.reset();
    dispatch({ type: "select", slug: exercise.slug });
    setAnnouncement("");
    tabRefs.current[index]?.focus();
  }

  // Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern).
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = exercises.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: activeIndex === last ? 0 : activeIndex + 1,
      ArrowLeft: activeIndex === 0 ? last : activeIndex - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]);
    }
  }

  function reset() {
    if (!dirty) return;
    if (!window.confirm(RESET_CONFIRM_MESSAGE)) return;
    dispatch({ type: "reset", slug: active!.slug });
    setAnnouncement("Starter code restored.");
  }

  const panel = (
    <div
      id={panelId}
      {...(exercises.length > 1 ? { role: "tabpanel", "aria-labelledby": tabId(active.slug) } : {})}
      className="rounded-lg border p-5"
    >
      <h2 className="text-xl font-semibold">Exercise: {active.title}</h2>
      <div className="mt-3">{active.instructions}</div>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-600">Your code</h3>
          <button
            type="button"
            onClick={reset}
            disabled={!dirty}
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset to starter code
          </button>
        </div>
        <CodeEditor
          modelPath={`${modelPathPrefix}${active.slug}.py`}
          modelPathPrefix={modelPathPrefix}
          value={state.drafts[active.slug]}
          label={`Code editor for exercise: ${active.title}`}
          onChange={(code) => {
            dispatch({ type: "edit", slug: active.slug, code });
            if (announcement) setAnnouncement("");
          }}
          onRun={(code) => runner.run(code)}
        />
        <p role="status" className="mt-1 min-h-5 text-sm text-green-700">{announcement}</p>
        <RunPanel
          snapshot={snapshot}
          onRun={() => runner.run(state.drafts[active.slug])}
          onStop={() => runner.stop()}
          onClear={() => runner.clearOutput()}
          onSubmitInput={(text) => runner.submitInput(text)}
        />
      </div>

      {active.visible_tests && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-600">Tests your code must pass</h3>
          <pre className="overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100">
            <code>{active.visible_tests}</code>
          </pre>
        </div>
      )}
      <p className="mt-3 text-sm text-gray-500">
        Your code runs in your browser and is not sent anywhere. Checking it against the tests is
        coming soon. Your edits are kept while this page is open.
      </p>
    </div>
  );

  if (exercises.length === 1) return <section className="mt-8">{panel}</section>;

  return (
    <section className="mt-8">
      <div role="tablist" aria-label="Exercises in this lesson" className="mb-3 flex flex-wrap gap-2">
        {exercises.map((exercise, index) => {
          const selected = exercise.slug === active.slug;
          const edited = isDirty(state, exercise.slug);
          return (
            <button
              key={exercise.slug}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={tabId(exercise.slug)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={onTabKeyDown}
              className={`rounded-full border px-4 py-1 text-sm ${
                selected ? "border-blue-600 bg-blue-600 text-white" : "hover:bg-gray-50"
              }`}
            >
              {index + 1}. {exercise.title}
              {edited && (
                <>
                  {" "}
                  <span aria-hidden="true">•</span>
                  <span className="sr-only">(edited)</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {panel}
    </section>
  );
}
