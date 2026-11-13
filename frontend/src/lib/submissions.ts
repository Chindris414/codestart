import { postJson, type ApiData } from "./auth";

// Submit: the learner's code is checked on the server, in a sandbox, against
// the exercise's tests. The API only ever returns the learner's own
// submissions, and never the tests' source or the solution.

export type SubmissionStatus = "queued" | "running" | "passed" | "failed" | "error";

export type Check = { name: string; passed: boolean; message: string };

export type Problem = {
  kind: "timeout" | "memory" | "output_limit" | "needs_input" | "exception";
  message: string; // ready-made plain-language sentence
  error_type?: string; // e.g. "NameError"
  line?: number;
  detail?: string; // Python's own message, e.g. "name 'x' is not defined"
};

export type SubmissionResults = {
  summary?: string;
  checks?: Check[];
  output?: string;
  problem?: Problem;
};

export type Submission = {
  id: string;
  exercise?: string; // exercise slug
  lesson?: string; // "track/module/lesson"
  status: SubmissionStatus;
  is_finished: boolean;
  created_at: string;
  results: SubmissionResults;
  code?: string;
};

export type SubmitOutcome =
  | { kind: "queued"; submission: Submission }
  | { kind: "busy"; activeId: string | null; message: string }
  | { kind: "rejected"; message: string };

export function submissionsUrl(slugPath: string, exerciseSlug: string): string {
  const [track, module, lesson] = slugPath.split("/").map(encodeURIComponent);
  return (
    `/api/tracks/${track}/modules/${module}/lessons/${lesson}` +
    `/exercises/${encodeURIComponent(exerciseSlug)}/submissions/`
  );
}

function submissionUrl(id: string): string {
  return `/api/me/submissions/${encodeURIComponent(id)}/`;
}

export async function submitCode(
  slugPath: string,
  exerciseSlug: string,
  code: string,
): Promise<SubmitOutcome> {
  const res = await postJson(submissionsUrl(slugPath, exerciseSlug), { code });
  const data = res.data as ApiData & { id?: string; status?: SubmissionStatus; created_at?: string; active_submission?: string | null };
  if (res.status === 202 && data.id) {
    return {
      kind: "queued",
      submission: {
        id: data.id,
        status: data.status ?? "queued",
        is_finished: false,
        created_at: data.created_at ?? new Date().toISOString(),
        results: {},
        code,
      },
    };
  }
  if (res.status === 409) {
    return {
      kind: "busy",
      activeId: data.active_submission ?? null,
      message: data.error ?? "Your last submission is still being checked.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { kind: "rejected", message: "Please log in again to submit your code." };
  }
  return { kind: "rejected", message: data.error ?? "Your code could not be sent. Please try again." };
}

export async function fetchSubmission(id: string): Promise<Submission> {
  const res = await fetch(submissionUrl(id), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Fetching submission failed with ${res.status}`);
  const data = (await res.json()) as { submission: Submission };
  return data.submission;
}

// The learner's newest submission for an exercise, with its code, or null.
export async function fetchLatestSubmission(
  slugPath: string,
  exerciseSlug: string,
): Promise<Submission | null> {
  const res = await fetch(submissionsUrl(slugPath, exerciseSlug), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Fetching submissions failed with ${res.status}`);
  const data = (await res.json()) as { submissions: { id: string }[] };
  const newest = data.submissions?.[0];
  return newest ? fetchSubmission(newest.id) : null;
}

// Check often at first (most submissions finish in a couple of seconds),
// then back off.
export function pollDelay(attempt: number): number {
  if (attempt < 5) return 1000;
  if (attempt < 15) return 2000;
  return 3000;
}

export function waitingText(status: SubmissionStatus): string {
  return status === "running" ? "Checking your code…" : "Queued, waiting for a free checker…";
}
