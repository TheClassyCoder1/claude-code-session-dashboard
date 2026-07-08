import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthed, authCookieValue, AUTH_COOKIE } from "./auth.ts";

test("no DASHBOARD_TOKEN configured → always authed (local default)", () => {
  delete process.env.DASHBOARD_TOKEN;
  assert.equal(isAuthed(null), true);
  assert.equal(isAuthed(""), true);
});

test("token configured → requires matching cookie", () => {
  process.env.DASHBOARD_TOKEN = "s3cret";
  assert.equal(isAuthed(null), false);
  assert.equal(isAuthed(`${AUTH_COOKIE}=wrong`), false);
  assert.equal(isAuthed(`other=1; ${AUTH_COOKIE}=${authCookieValue("s3cret")}`), true);
  delete process.env.DASHBOARD_TOKEN;
});

test("authCookieValue is not the raw token", () => {
  assert.notEqual(authCookieValue("s3cret"), "s3cret");
});
