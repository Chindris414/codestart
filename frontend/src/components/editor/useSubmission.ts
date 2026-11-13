"use client";

import { useEffect, useState } from "react";

import {
  fetchLatestSubmission,
  fetchSubmission,
  pollDelay,
  submitCode,
  type Submission,
} from "@/lib/submissions";

const SEND_FAILED = "Your code could not be sent. Check your connection and try again.";
const STILL_TRYING = "Lost touch with the server. Still trying…";

// Submit and follow one exercise's submission until it has a result.
//
// On mount (logged-in learners only) it shows the newest earlier result, so
// a page reload keeps it. While a submission is queued or running it polls
// the server: every second at first, then less often. The server itself
// turns a submission that never gets a result into an error after a couple
// of minutes, so polling always ends.
//
// The parent gives the component using this hook key={exercise slug}, so
// switching exercise starts fresh and stops any polling.
export function useSubmission({
  slugPath,
  exerciseSlug,
  enabled,
}: {
  slugPath: string | null;
  exerciseSlug: string;
  enabled: boolean;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The newest earlier result, once.
  useEffect(() => {
    if (!enabled || !slugPath) return;
    let cancelled = false;
    fetchLatestSubmission(slugPath, exerciseSlug)
      .then((latest) => {
        if (!cancelled && latest) setSubmission((current) => current ?? latest);
      })
      .catch(() => {
        // No earlier result to show is fine; Submit still works.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, slugPath, exerciseSlug]);

  // Follow a waiting submission until it is finished.
  const waitingId = submission && !submission.is_finished ? submission.id : null;
  useEffect(() => {
    if (!waitingId) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const latest = await fetchSubmission(waitingId);
        if (cancelled) return;
        setNotice(null);
        setSubmission((current) => (current && current.id === latest.id ? { ...current, ...latest } : current));
        if (latest.is_finished) return;
      } catch {
        if (cancelled) return;
        setNotice(STILL_TRYING);
      }
      attempt += 1;
      timer = setTimeout(tick, pollDelay(attempt));
    };
    timer = setTimeout(tick, pollDelay(attempt));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [waitingId]);

  async function submit(code: string) {
    if (!slugPath || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const outcome = await submitCode(slugPath, exerciseSlug, code);
      if (outcome.kind === "queued") {
        setSubmission(outcome.submission);
      } else if (outcome.kind === "busy") {
        setNotice(outcome.message);
        // Show (and follow) the submission that is still being checked, if
        // it belongs to this exercise; it may be for another one.
        if (outcome.activeId) {
          const active = await fetchSubmission(outcome.activeId);
          if (active.exercise === exerciseSlug && active.lesson === slugPath) setSubmission(active);
        }
      } else {
        setNotice(outcome.message);
      }
    } catch {
      setNotice(SEND_FAILED);
    } finally {
      setSending(false);
    }
  }

  const waiting = sending || (submission !== null && !submission.is_finished);
  return { submission, sending, waiting, notice, submit };
}
