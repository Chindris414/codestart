import Link from "next/link";

import type { LessonSummary } from "@/lib/learning";

const TYPE_LABELS: Record<LessonSummary["lesson_type"], string> = {
  concept: "Concept",
  exercise: "Exercise",
  quiz: "Quiz",
  project: "Project",
};

// One row per lesson, used on the track and module pages. A locked lesson
// still links to its page, which shows the sign-up prompt.
export default function LessonList({
  trackSlug,
  moduleSlug,
  lessons,
}: {
  trackSlug: string;
  moduleSlug: string;
  lessons: LessonSummary[];
}) {
  if (lessons.length === 0) {
    return <p className="text-sm text-gray-500">No lessons here yet.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {lessons.map((lesson) => (
        <li key={lesson.slug}>
          <Link
            href={`/tracks/${trackSlug}/${moduleSlug}/${lesson.slug}`}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              {lesson.locked && <span aria-label="Locked" title="Log in to read this lesson">🔒</span>}
              <span className={lesson.locked ? "text-gray-500" : "font-medium"}>{lesson.title}</span>
              {lesson.state === "completed" && (
                <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-white">
                  ✓ Completed
                </span>
              )}
              {lesson.state === "in_progress" && (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  In progress
                </span>
              )}
              {lesson.is_sample && (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  Free
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-gray-500">
              {TYPE_LABELS[lesson.lesson_type]} · {lesson.estimated_minutes} min
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
