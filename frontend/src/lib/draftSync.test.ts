import { beforeEach, describe, expect, test, vi } from "vitest";

import { sendJson } from "./auth";
import {
  clearLocalDrafts,
  collectLocalDrafts,
  fetchServerDrafts,
  importLocalDrafts,
  lessonSlugPath,
  readLocalDrafts,
  removeLocalDraft,
  writeLocalDraft,
} from "./draftSync";

vi.mock("./auth", () => ({ sendJson: vi.fn() }));
const sendJsonMock = vi.mocked(sendJson);

const LESSON = "python-basics/intro/practice";

beforeEach(() => {
  sendJsonMock.mockReset();
  sendJsonMock.mockResolvedValue({ ok: true, status: 200, data: {} });
});

describe("lessonSlugPath", () => {
  test("accepts paths with and without the /tracks prefix", () => {
    expect(lessonSlugPath("/tracks/python-basics/intro/practice")).toBe(LESSON);
    expect(lessonSlugPath("/python-basics/intro/practice")).toBe(LESSON);
  });

  test("rejects paths that are not a track/module/lesson triple", () => {
    expect(lessonSlugPath("/tracks/python-basics/intro")).toBeNull();
    expect(lessonSlugPath("/a/b/c/d")).toBeNull();
  });
});

describe("local drafts", () => {
  test("written drafts come back for their lesson only, with a timestamp", () => {
    writeLocalDraft(LESSON, "greet", "print('hi')");
    writeLocalDraft("other-track/mod/les", "greet", "elsewhere");

    const drafts = readLocalDrafts(LESSON);
    expect(Object.keys(drafts)).toEqual(["greet"]);
    expect(drafts.greet.code).toBe("print('hi')");
    expect(Date.parse(drafts.greet.saved_at!)).not.toBeNaN();
  });

  test("removing a draft leaves the lesson's other drafts alone", () => {
    writeLocalDraft(LESSON, "greet", "a");
    writeLocalDraft(LESSON, "count", "b");
    removeLocalDraft(LESSON, "greet");
    expect(Object.keys(readLocalDrafts(LESSON))).toEqual(["count"]);
  });

  test("corrupt or foreign localStorage entries are ignored", () => {
    localStorage.setItem("codestart:draft:v1:" + LESSON + "/broken", "not json");
    localStorage.setItem("codestart:draft:v1:" + LESSON + "/wrong", JSON.stringify({ nope: 1 }));
    localStorage.setItem("unrelated-key", "whatever");
    expect(readLocalDrafts(LESSON)).toEqual({});
    expect(collectLocalDrafts()).toEqual([]);
  });

  test("collect gathers drafts across lessons; clear removes only ours", () => {
    writeLocalDraft(LESSON, "greet", "a");
    writeLocalDraft("track2/mod/les", "count", "b");
    localStorage.setItem("unrelated-key", "keep me");

    const items = collectLocalDrafts();
    expect(items.map((i) => `${i.lesson}#${i.exercise}`).sort()).toEqual([
      "python-basics/intro/practice#greet",
      "track2/mod/les#count",
    ]);

    clearLocalDrafts();
    expect(collectLocalDrafts()).toEqual([]);
    expect(localStorage.getItem("unrelated-key")).toBe("keep me");
  });
});

describe("importLocalDrafts", () => {
  test("sends every local draft and clears them on success", async () => {
    writeLocalDraft(LESSON, "greet", "print('hi')");
    await importLocalDrafts();

    expect(sendJsonMock).toHaveBeenCalledTimes(1);
    const [method, url, body] = sendJsonMock.mock.calls[0];
    expect(method).toBe("POST");
    expect(url).toBe("/api/me/drafts/import/");
    const drafts = (body as { drafts: { lesson: string; exercise: string; code: string }[] }).drafts;
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ lesson: LESSON, exercise: "greet", code: "print('hi')" });

    expect(collectLocalDrafts()).toEqual([]);
  });

  test("does nothing when there are no local drafts", async () => {
    await importLocalDrafts();
    expect(sendJsonMock).not.toHaveBeenCalled();
  });

  test("keeps the local drafts when the import fails, and never throws", async () => {
    writeLocalDraft(LESSON, "greet", "print('hi')");
    sendJsonMock.mockRejectedValueOnce(new Error("offline"));
    await expect(importLocalDrafts()).resolves.toBeUndefined();
    expect(collectLocalDrafts()).toHaveLength(1);
  });
});

describe("fetchServerDrafts", () => {
  test("returns the drafts mapping from the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ drafts: { greet: { code: "x", saved_at: "2026-11-12T10:00:00Z" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await fetchServerDrafts(LESSON);
    expect(drafts.greet.code).toBe("x");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/me/drafts/?lesson=${encodeURIComponent(LESSON)}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
    vi.unstubAllGlobals();
  });

  test("throws on an error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchServerDrafts(LESSON)).rejects.toThrow("401");
    vi.unstubAllGlobals();
  });
});
