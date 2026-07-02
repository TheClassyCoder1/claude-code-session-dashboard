import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOK_EVENTS, pruneStaleHooks, INSTALLS, refreshTimeout, RETIRED_COMMANDS } from "./install.mjs";

const CMD = "~/.claude/feature-logger/feature-logger.mjs";
const ours = () => ({ matcher: "", hooks: [{ type: "command", command: CMD }] });

test("HOOK_EVENTS covers lifecycle + the live-state events", () => {
  assert.deepEqual(
    [...HOOK_EVENTS].sort(),
    ["Notification", "PostToolUse", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"],
  );
});

test("pruneStaleHooks drops our command from events no longer wanted", () => {
  const hooks = { Stop: [ours()], PreToolUse: [ours()] };
  const pruned = pruneStaleHooks(hooks, CMD, ["Stop"]);
  assert.deepEqual(pruned, ["PreToolUse"]);
  assert.equal(hooks.PreToolUse, undefined); // emptied → removed
  assert.equal(hooks.Stop.length, 1); // kept
});

test("pruneStaleHooks preserves other tools' hooks on a stale event", () => {
  const other = { matcher: "", hooks: [{ type: "command", command: "/other/tool.sh" }] };
  const hooks = { PreToolUse: [ours(), other] };
  const pruned = pruneStaleHooks(hooks, CMD, ["Stop"]);
  assert.deepEqual(pruned, ["PreToolUse"]);
  assert.deepEqual(hooks.PreToolUse, [other]); // only ours removed; event kept
});

test("INSTALLS: feature-logger on its events (60s), dashboard-hook on PreToolUse+Stop (600s)", () => {
  const fl = INSTALLS.find((i) => i.command.includes("feature-logger"));
  const dh = INSTALLS.find((i) => i.command.includes("dashboard-hook"));
  assert.deepEqual([...fl.events].sort(), [...HOOK_EVENTS].sort());
  assert.equal(fl.timeout, 60);
  assert.deepEqual([...dh.events].sort(), ["PreToolUse", "Stop"]);
  assert.equal(dh.timeout, 600);
});

test("RETIRED_COMMANDS lists the old split hook scripts", () => {
  assert.ok(RETIRED_COMMANDS.some((c) => c.includes("approval-gate")));
  assert.ok(RETIRED_COMMANDS.some((c) => c.includes("prompt-relay")));
});

test("refreshTimeout upgrades a stale 60s entry to 600s", () => {
  const DH = "~/.claude/dashboard-hook/dashboard-hook.mjs";
  const arr = [{ matcher: "", hooks: [{ type: "command", command: DH, timeout: 60 }] }];
  const changed = refreshTimeout(arr, DH, 600);
  assert.equal(changed, true);
  assert.equal(arr[0].hooks[0].timeout, 600);
  assert.equal(refreshTimeout(arr, DH, 600), false);
});

test("pruning per-command leaves the other command's hook intact", () => {
  const FL = "~/.claude/feature-logger/feature-logger.mjs";
  const AG = "~/.claude/approval-gate/approval-gate.mjs";
  const hooks = {
    PreToolUse: [
      { matcher: "", hooks: [{ type: "command", command: AG }] },
      { matcher: "", hooks: [{ type: "command", command: FL }] }, // stale FL on PreToolUse
    ],
  };
  const pruned = pruneStaleHooks(hooks, FL, HOOK_EVENTS);
  assert.deepEqual(pruned, ["PreToolUse"]);
  assert.equal(hooks.PreToolUse.length, 1);
  assert.equal(hooks.PreToolUse[0].hooks[0].command, AG);
});

test("pruneStaleHooks leaves wanted events and untouched events alone", () => {
  const hooks = { Stop: [ours()], Notification: [ours()] };
  const pruned = pruneStaleHooks(hooks, CMD, HOOK_EVENTS);
  assert.deepEqual(pruned, []);
  assert.equal(hooks.Stop.length, 1);
  assert.equal(hooks.Notification.length, 1);
});
