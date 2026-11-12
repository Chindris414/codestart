// Server-side helpers for the learner-facing learning API.
// Every call forwards the visitor's cookies to Django, so the backend
// decides what this visitor may read; the pages only display the result.

import { cookies } from "next/headers";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export type TrackSummary = {
  slug: string;
  title: string;
  description: string;
  module_count: number;
  lesson_count: number;
};

export type TrackData = { slug: string; title: string; description: string };

export type ModuleData = {
  slug: string;
  title: string;
  description: string;
  order: number;
};

// The three lesson states of the spec. A visitor sees "not_started"
// everywhere; "completed" is currently set by the learner pressing "Mark
// lesson complete" (server grading arrives in Phase 3).
export type LessonState = "not_started" | "in_progress" | "completed";

export type LessonSummary = {
  slug: string;
  title: string;
  lesson_type: "concept" | "exercise" | "quiz" | "project";
  estimated_minutes: number;
  is_sample: boolean;
  locked: boolean;
  state: LessonState;
};

export type ExerciseData = {
  slug: string;
  title: string;
  instructions: string;
  starter_code: string;
  visible_tests: string;
};

export type LessonDetail = LessonSummary & {
  body?: string;
  exercises?: ExerciseData[];
};

export type LessonLink = { module: string; lesson: string; title: string } | null;

export type TrackListResponse = { tracks: TrackSummary[] };

export type TrackDetailResponse = {
  track: TrackData;
  modules: (ModuleData & { lessons: LessonSummary[] })[];
};

export type ModuleDetailResponse = {
  track: TrackData;
  module: ModuleData;
  lessons: LessonSummary[];
};

export type LessonDetailResponse = {
  track: TrackData;
  module: ModuleData;
  lesson: LessonDetail;
  previous: LessonLink;
  next: LessonLink;
};

// -- the learner's dashboard -------------------------------------------------

export type ModuleProgress = {
  slug: string;
  title: string;
  order: number;
  lesson_count: number;
  completed_count: number;
  percent: number;
};

export type TrackProgress = {
  slug: string;
  title: string;
  lesson_count: number;
  completed_count: number;
  percent: number;
  modules: ModuleProgress[];
};

export type ContinueLink = {
  track: string;
  module: string;
  lesson: string;
  title: string;
} | null;

export type DashboardResponse = {
  tracks: TrackProgress[];
  continue_to: ContinueLink;
  streak: number;
};

// GET from Django with the visitor's cookies. Returns null on 404 (the page
// turns that into notFound()); any other failure is a real error.
export async function apiGet<T>(path: string): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${backend}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} responded with ${res.status}`);
  return (await res.json()) as T;
}
