"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";

import {
  deleteServerDraft,
  fetchServerDrafts,
  lessonSlugPath,
  readLocalDrafts,
  removeLocalDraft,
  saveServerDraft,
  writeLocalDraft,
  type StoredDraft,
} from "@/lib/draftSync";
import { normalizeCode, type DraftAction, type DraftState } from "@/lib/exerciseDrafts";

// "idle" until the learner changes something; then "saving" → "saved" (on the
// server) or "local" (this browser, for visitors), or "error" with retries.
export type SaveStatus = "idle" | "saving" | "saved" | "local" | "error";

export const SAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;

// Autosave for one lesson's exercise drafts.
//
// On mount it loads saved drafts (server for logged-in learners, localStorage
// for visitors) and hydrates them into the reducer — only into exercises the
// learner has not already typed in. After that, any change is written out a
// moment after typing pauses, immediately when the tab is hidden or closed
// (keepalive), and on unmount (client-side navigation away).
//
// discardDraft(slug) is Reset's half of the deal: it deletes the stored draft
// so a refresh really comes back to the starter code.
export function useDraftAutosave({
  lessonPath,
  isLoggedIn,
  state,
  dispatch,
}: {
  lessonPath: string;
  isLoggedIn: boolean;
  state: DraftState;
  dispatch: Dispatch<DraftAction>;
}): { status: SaveStatus; discardDraft: (slug: string) => void } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const slugPath = lessonSlugPath(lessonPath);

  // flush() runs from timers and window listeners, so it reads everything
  // through refs. They are synced in the first effect below, which runs
  // before any of the places that call flush (timers, listeners, effects
  // declared later).
  const draftsRef = useRef(state.drafts);
  const startersRef = useRef(state.starters);
  // What the store (server or localStorage) is known to hold, per exercise;
  // null until hydration decides it. Saving means closing the gap between
  // draftsRef and this.
  const lastSavedRef = useRef<Record<string, string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedule(delay: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, delay);
  }

  async function flush(keepalive = false) {
    const lastSaved = lastSavedRef.current;
    if (!lastSaved || !slugPath) return;
    const changed = Object.entries(draftsRef.current).filter(
      ([slug, code]) => code !== lastSaved[slug],
    );
    if (changed.length === 0) return;

    if (!isLoggedIn) {
      try {
        for (const [slug, code] of changed) {
          // Code typed back to exactly the starter needs no draft.
          if (code === startersRef.current[slug]) removeLocalDraft(slugPath, slug);
          else writeLocalDraft(slugPath, slug, code);
          lastSaved[slug] = code;
        }
        setStatus("local");
      } catch {
        setStatus("error"); // storage unavailable; edits still live on the page
      }
      return;
    }

    setStatus("saving");
    try {
      await Promise.all(
        changed.map(([slug, code]) => saveServerDraft(slugPath, slug, code, { keepalive })),
      );
      for (const [slug, code] of changed) lastSaved[slug] = code;
      const stillDirty = Object.entries(draftsRef.current).some(
        ([slug, code]) => code !== lastSaved[slug],
      );
      setStatus(stillDirty ? "saving" : "saved"); // typed more while saving
    } catch {
      setStatus("error");
      schedule(RETRY_DELAY_MS);
    }
  }
  const flushRef = useRef(flush);
  useEffect(() => {
    draftsRef.current = state.drafts;
    startersRef.current = state.starters;
    flushRef.current = flush;
  });

  // Load saved drafts once per mount. (With Next.js <Activity>, coming back
  // to a recently left lesson mounts again and re-hydrates; the reducer keeps
  // anything the learner already typed.)
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      let stored: Record<string, StoredDraft> = {};
      if (slugPath) {
        try {
          stored = isLoggedIn ? await fetchServerDrafts(slugPath) : readLocalDrafts(slugPath);
        } catch {
          // can't reach the store: start from the starter code, autosave will retry
        }
      }
      if (cancelled) return;
      const codes = Object.fromEntries(
        Object.entries(stored).map(([slug, draft]) => [slug, draft.code]),
      );
      dispatch({ type: "hydrate", drafts: codes });

      const baseline = { ...startersRef.current };
      for (const [slug, code] of Object.entries(codes)) {
        if (slug in baseline) baseline[slug] = normalizeCode(code);
      }
      lastSavedRef.current = baseline;
      // Anything typed while we were loading is newer than the store: save it.
      void flushRef.current();
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount; the parent remounts us per lesson (key={lessonPath})
  }, []);

  // A changed draft is written out SAVE_DELAY_MS after the last keystroke.
  useEffect(() => {
    const lastSaved = lastSavedRef.current;
    if (!lastSaved) return; // still hydrating; the hydrate effect flushes after
    const dirty = Object.entries(state.drafts).some(([slug, code]) => code !== lastSaved[slug]);
    if (!dirty) return;
    setStatus("saving");
    schedule(SAVE_DELAY_MS);
  }, [state.drafts]);

  // Closing or hiding the tab, and navigating away (unmount), save at once.
  useEffect(() => {
    const onPageHide = () => void flushRef.current(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current(true);
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
      void flushRef.current(true);
    };
  }, []);

  function discardDraft(slug: string) {
    if (!slugPath) return;
    if (lastSavedRef.current) lastSavedRef.current[slug] = startersRef.current[slug];
    if (!isLoggedIn) {
      try {
        removeLocalDraft(slugPath, slug);
        setStatus("local");
      } catch {
        setStatus("error");
      }
      return;
    }
    setStatus("saving");
    deleteServerDraft(slugPath, slug)
      .then(() => setStatus("saved"))
      .catch(() => setStatus("error"));
  }

  return { status, discardDraft };
}
