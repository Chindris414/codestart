"use client";

import Link from "next/link";

import { explainError } from "@/lib/python/errorExplanations";
import { waitingText, type Submission } from "@/lib/submissions";

import ErrorExplanation from "./ErrorExplanation";
import { useSubmission } from "./useSubmission";

// Submit: check the code on the server against the exercise's tests. Run
// (above) stays the quick way to try things in the browser; Submit is the
// one that counts. Visitors see a log-in prompt instead of the button.
//
// The parent gives this component key={exercise slug}, so each exercise has
// its own result and switching exercise stops any polling.
export default function SubmitPanel({
  slugPath,
  lessonPath,
  exerciseSlug,
  code,
  isLoggedIn,
}: {
  slugPath: string | null;
  lessonPath: string;
  exerciseSlug: string;
  code: string;
  isLoggedIn: boolean;
}) {
  const { submission, sending, waiting, notice, submit } = useSubmission({
    slugPath,
    exerciseSlug,
    enabled: isLoggedIn,
  });

  if (!isLoggedIn) {
    const next = `?next=${encodeURIComponent(lessonPath)}`;
    return (
      <div className="mt-4 rounded border bg-gray-50 p-4 text-sm">
        <Link href={`/login${next}`} className="font-medium text-blue-700 underline">
          Log in
        </Link>{" "}
        or{" "}
        <Link href={`/signup${next}`} className="font-medium text-blue-700 underline">
          create a free account
        </Link>{" "}
        to submit your code and have it checked against the tests.
      </div>
    );
  }

  const status = sending ? "Sending your code…" : waiting && submission ? waitingText(submission.status) : "";

  return (
    <div className="mt-4 rounded border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={waiting || !slugPath}
          className="rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Submit for checking
        </button>
        <span role="status" className="text-sm text-gray-600">
          {waiting && <span aria-hidden="true" className="mr-1 inline-block animate-pulse">●</span>}
          {status}
        </span>
      </div>
      {notice && (
        <p role="alert" className="mt-2 text-sm text-amber-800">
          {notice}
        </p>
      )}
      {submission?.is_finished && <SubmissionResult submission={submission} fallbackCode={code} />}
    </div>
  );
}

const HEADLINE_STYLE: Record<string, string> = {
  passed: "border-green-300 bg-green-50 text-green-900",
  failed: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-gray-300 bg-gray-50 text-gray-900",
};

function SubmissionResult({ submission, fallbackCode }: { submission: Submission; fallbackCode: string }) {
  const { summary, checks = [], output = "", problem } = submission.results;
  const icon = submission.status === "passed" ? "✓" : submission.status === "failed" ? "✗" : "!";

  // Same plain-language explanation as after a failed Run, when Python
  // reported a named error.
  const explanation =
    problem?.kind === "exception" && problem.error_type
      ? explainError({ name: problem.error_type, message: problem.detail ?? "", line: problem.line ?? null })
      : null;
  const sourceLine =
    problem?.line != null ? ((submission.code ?? fallbackCode).split("\n")[problem.line - 1] ?? null) : null;

  return (
    <section aria-label="Result of your submission" className="mt-3 space-y-3 text-sm">
      <p className={`rounded border p-3 font-medium ${HEADLINE_STYLE[submission.status] ?? HEADLINE_STYLE.error}`}>
        <span aria-hidden="true" className="mr-2">
          {icon}
        </span>
        {summary || (submission.status === "passed" ? "All checks passed." : "Your code did not pass yet.")}
      </p>

      {problem && !explanation && <p className="rounded border border-amber-300 bg-amber-50 p-3">{problem.message}</p>}
      {explanation && <ErrorExplanation explanation={explanation} line={problem?.line ?? null} source={sourceLine} />}

      {checks.length > 0 && (
        <ul className="space-y-2">
          {checks.map((check, index) => (
            <li key={index} className="rounded border p-2">
              <span className={check.passed ? "text-green-700" : "text-amber-800"}>
                <span aria-hidden="true">{check.passed ? "✓ " : "✗ "}</span>
                <span className="sr-only">{check.passed ? "Passed: " : "Not passed: "}</span>
                <code className="font-mono">{check.name}</code>
              </span>
              {!check.passed && check.message && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-800">
                  {check.message}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}

      {output && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Your program&apos;s output
          </h4>
          <pre className="max-h-64 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{output}</pre>
        </div>
      )}
    </section>
  );
}
