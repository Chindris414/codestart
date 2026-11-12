"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { postJson } from "@/lib/auth";
import type { LessonState } from "@/lib/learning";

// Progress for the lesson the learner is reading: it reports "opened" once
// (so the lesson counts as in progress), and offers the complete /
// un-complete button.
//
// "Mark lesson complete" is deliberately manual for now: grading does not
// exist yet, so nothing can decide on the learner's behalf. When server
// grading lands (Phase 3), exercise lessons will complete on a passing
// submit instead.
export default function LessonProgressPanel({
  trackSlug,
  moduleSlug,
  lessonSlug,
  initialState,
}: {
  trackSlug: string;
  moduleSlug: string;
  lessonSlug: string;
  initialState: LessonState;
}) {
  const router = useRouter();
  const [state, setState] = useState<LessonState>(initialState);
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);

  const url =
    `/api/tracks/${encodeURIComponent(trackSlug)}/modules/${encodeURIComponent(moduleSlug)}` +
    `/lessons/${encodeURIComponent(lessonSlug)}/progress/`;

  // Mark the lesson as started, once per visit. A failure is not worth
  // telling the learner about: reading the lesson still works.
  useEffect(() => {
    if (opened.current || initialState !== "not_started") return;
    opened.current = true;
    postJson(url, { action: "open" })
      .then((res) => {
        if (res.ok) setState("in_progress");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per lesson
  }, []);

  async function toggle() {
    const completing = state !== "completed";
    setBusy(true);
    const res = await postJson(url, { action: completing ? "complete" : "uncomplete" });
    setBusy(false);
    if (!res.ok) return;
    setState(completing ? "completed" : "in_progress");
    router.refresh(); // dashboard percentages and lesson badges follow
  }

  const completed = state === "completed";

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border bg-gray-50 p-4">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          completed ? "border bg-white" : "bg-green-700 text-white"
        }`}
      >
        {completed ? "Mark as not finished" : "Mark lesson complete"}
      </button>
      <p role="status" className="text-sm text-gray-600">
        {completed ? "✓ You finished this lesson." : "Finished reading and practising? Mark it complete."}
      </p>
    </div>
  );
}
