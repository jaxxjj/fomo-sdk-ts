import test from "node:test";
import assert from "node:assert/strict";
import { isAccessFailure } from "./support/qualification.mjs";

test("qualification stops on auth failure even without an HTTP status", () => {
  const statuses = [401, 403, 429, 430, 431];
  assert.equal(isAccessFailure({ kind: "authentication" }, statuses), true);
  assert.equal(isAccessFailure({ kind: "session_changed" }, statuses), true);
  for (const status of statuses)
    assert.equal(isAccessFailure({ kind: "http", status }, statuses), true);
  assert.equal(isAccessFailure(undefined, statuses), false);
  assert.equal(isAccessFailure({ kind: "http", status: 503 }, statuses), false);
  assert.equal(isAccessFailure({ kind: "http", status: 430 }, [401, 403, 429]), false);
});
