import assert from "node:assert/strict";
import { test } from "vitest";

import { safeNextPath } from "./auth";

test("keeps same-site paths", () => {
  assert.equal(safeNextPath("/tracks"), "/tracks");
  assert.equal(
    safeNextPath("/tracks/python-fundamentals/getting-started/say-hello"),
    "/tracks/python-fundamentals/getting-started/say-hello",
  );
});

test("falls back to the home page when next is missing", () => {
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath(""), "/");
});

test("rejects destinations that would leave the site", () => {
  assert.equal(safeNextPath("https://evil.example.com"), "/");
  assert.equal(safeNextPath("//evil.example.com"), "/");
  assert.equal(safeNextPath("/\\evil.example.com"), "/");
  assert.equal(safeNextPath("javascript:alert(1)"), "/");
  assert.equal(safeNextPath("tracks"), "/");
});
