// Where autosaved exercise code lives, and how it moves around.
//
// A logged-in learner's drafts are stored on the server (one per exercise),
// so a refresh or another device gets them back. A visitor's drafts go to
// localStorage instead, and right after login or signup importLocalDrafts()
// hands them to the server, where the newest version of each draft wins.
//
// localStorage can be unavailable (private mode, blocked storage) and can
// contain junk; every reader here treats that as "no draft", never an error.

import { sendJson } from "./auth";

export type StoredDraft = { code: string; saved_at: string | null };

const LOCAL_PREFIX = "codestart:draft:v1:";

// The lesson page passes paths like "/tracks/<track>/<module>/<lesson>".
// The API and the localStorage keys use the bare "<track>/<module>/<lesson>".
export function lessonSlugPath(lessonPath: string): string | null {
  const parts = lessonPath.split("/").filter(Boolean);
  if (parts[0] === "tracks") parts.shift();
  return parts.length === 3 ? parts.join("/") : null;
}

function draftUrl(slugPath: string, exerciseSlug: string): string {
  const [track, module, lesson] = slugPath.split("/").map(encodeURIComponent);
  return (
    `/api/tracks/${track}/modules/${module}/lessons/${lesson}` +
    `/exercises/${encodeURIComponent(exerciseSlug)}/draft/`
  );
}

// -- a visitor's drafts, in this browser only --------------------------------

function localKey(slugPath: string, exerciseSlug: string): string {
  return `${LOCAL_PREFIX}${slugPath}/${exerciseSlug}`;
}

function parseStored(raw: string | null): StoredDraft | null {
  try {
    const value = JSON.parse(raw ?? "") as unknown;
    if (value && typeof value === "object" && typeof (value as StoredDraft).code === "string") {
      const saved_at = (value as StoredDraft).saved_at;
      return { code: (value as StoredDraft).code, saved_at: typeof saved_at === "string" ? saved_at : null };
    }
  } catch {
    // fall through: corrupt or missing entries count as "no draft"
  }
  return null;
}

export function readLocalDrafts(slugPath: string): Record<string, StoredDraft> {
  const drafts: Record<string, StoredDraft> = {};
  const prefix = localKey(slugPath, "");
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const draft = parseStored(localStorage.getItem(key));
      if (draft) drafts[key.slice(prefix.length)] = draft;
    }
  } catch {
    // storage unavailable: start from the starter code
  }
  return drafts;
}

export function writeLocalDraft(slugPath: string, exerciseSlug: string, code: string): void {
  const stored: StoredDraft = { code, saved_at: new Date().toISOString() };
  localStorage.setItem(localKey(slugPath, exerciseSlug), JSON.stringify(stored));
}

export function removeLocalDraft(slugPath: string, exerciseSlug: string): void {
  localStorage.removeItem(localKey(slugPath, exerciseSlug));
}

export type LocalDraftItem = {
  lesson: string;
  exercise: string;
  code: string;
  saved_at: string | null;
};

// Every local draft, shaped for the import endpoint: the key's last segment
// is the exercise slug, the rest is the lesson path.
export function collectLocalDrafts(): LocalDraftItem[] {
  const items: LocalDraftItem[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LOCAL_PREFIX)) continue;
      const parts = key.slice(LOCAL_PREFIX.length).split("/");
      const draft = parseStored(localStorage.getItem(key));
      if (!draft || parts.length !== 4) continue;
      items.push({
        lesson: parts.slice(0, 3).join("/"),
        exercise: parts[3],
        code: draft.code,
        saved_at: draft.saved_at,
      });
    }
  } catch {
    // storage unavailable: nothing to import
  }
  return items;
}

export function clearLocalDrafts(): void {
  try {
    const mine = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LOCAL_PREFIX)) mine.push(key);
    }
    for (const key of mine) localStorage.removeItem(key);
  } catch {
    // storage unavailable: nothing to clear
  }
}

// -- a logged-in learner's drafts, on the server ------------------------------

export async function fetchServerDrafts(slugPath: string): Promise<Record<string, StoredDraft>> {
  const res = await fetch(`/api/me/drafts/?lesson=${encodeURIComponent(slugPath)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Fetching drafts failed with ${res.status}`);
  const data = (await res.json()) as { drafts: Record<string, StoredDraft> };
  return data.drafts ?? {};
}

export async function saveServerDraft(
  slugPath: string,
  exerciseSlug: string,
  code: string,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<void> {
  const res = await sendJson("PUT", draftUrl(slugPath, exerciseSlug), { code }, { keepalive });
  if (!res.ok) throw new Error(`Saving the draft failed with ${res.status}`);
}

export async function deleteServerDraft(slugPath: string, exerciseSlug: string): Promise<void> {
  const res = await sendJson("DELETE", draftUrl(slugPath, exerciseSlug));
  if (!res.ok) throw new Error(`Deleting the draft failed with ${res.status}`);
}

// -- carrying a visitor's drafts into their new account -----------------------

// Called right after a successful login or signup. Never throws: a failed
// import must not break logging in, and the local drafts then simply stay in
// this browser for a later attempt.
export async function importLocalDrafts(): Promise<void> {
  const drafts = collectLocalDrafts();
  if (drafts.length === 0) return;
  try {
    const res = await sendJson("POST", "/api/me/drafts/import/", { drafts });
    if (res.ok) clearLocalDrafts();
  } catch {
    // offline or server error: keep the local copies
  }
}
