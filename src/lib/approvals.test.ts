import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSafeSessionId,
  readMode,
  writeMode,
  writeDecision,
  readPendingApprovals,
  readRelayWindowMs,
  writeRelayWindowMs,
  readAwaitingPrompts,
  writePrompt,
  readNtfyTopic,
  writeNtfyTopic,
  archiveRecord,
} from "./approvals.ts";

async function tmpHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "approvals-"));
  process.env.HOME = home;
  await fs.mkdir(path.join(home, ".claude", "feature-log"), { recursive: true });
  return home;
}

test("isSafeSessionId rejects path separators and traversal", () => {
  assert.equal(isSafeSessionId("abc-123_4.json"), true);
  assert.equal(isSafeSessionId("../etc/passwd"), false);
  assert.equal(isSafeSessionId("a/b"), false);
  assert.equal(isSafeSessionId(""), false);
});

test("readMode defaults to cli, reflects writeMode", async () => {
  await tmpHome();
  assert.equal(await readMode(), "cli");
  assert.equal(await writeMode("dashboard"), "dashboard");
  assert.equal(await readMode(), "dashboard");
});

test("writeMode rejects bad values", async () => {
  await tmpHome();
  await assert.rejects(() => writeMode("nope"));
});

test("writeDecision validates id + decision and writes the file", async () => {
  const home = await tmpHome();
  await writeDecision("sess-1", "allow");
  const f = path.join(home, ".claude", "feature-log", "decisions", "sess-1.json");
  assert.equal(JSON.parse(await fs.readFile(f, "utf8")).decision, "allow");
  await assert.rejects(() => writeDecision("../x", "allow"));
  await assert.rejects(() => writeDecision("sess-1", "maybe"));
});

test("relay window: default 600000, clamps, merges without dropping mode", async () => {
  await tmpHome();
  assert.equal(await readRelayWindowMs(), 600_000);
  await writeMode("dashboard");
  assert.equal(await writeRelayWindowMs(120_000), 120_000);
  assert.equal(await readRelayWindowMs(), 120_000);
  assert.equal(await readMode(), "dashboard"); // preserved
  assert.equal(await writeRelayWindowMs(5), 30_000); // clamped up
  assert.equal(await writeRelayWindowMs(9_999_999), 600_000); // clamped down
});

test("writeMode preserves an existing relay window", async () => {
  await tmpHome();
  await writeRelayWindowMs(120_000);
  await writeMode("dashboard");
  assert.equal(await readRelayWindowMs(), 120_000);
});

test("ntfy topic: default empty, set/clear, merges with mode + window, rejects junk", async () => {
  await tmpHome();
  assert.equal(await readNtfyTopic(), "");
  await writeMode("dashboard");
  await writeRelayWindowMs(120_000);
  assert.equal(await writeNtfyTopic("my-topic_1"), "my-topic_1");
  assert.equal(await readNtfyTopic(), "my-topic_1");
  assert.equal(await readMode(), "dashboard");
  assert.equal(await readRelayWindowMs(), 120_000);
  await writeNtfyTopic("");
  assert.equal(await readNtfyTopic(), "");
  await assert.rejects(() => writeNtfyTopic("bad topic!"));
  await assert.rejects(() => writeNtfyTopic(42));
});

test("writePrompt validates and writes queued prompt", async () => {
  const home = await tmpHome();
  await writePrompt("sess-1", "do the thing");
  const f = path.join(home, ".claude", "feature-log", "queued", "sess-1.json");
  assert.equal(JSON.parse(await fs.readFile(f, "utf8")).prompt, "do the thing");
  await assert.rejects(() => writePrompt("../x", "hi"));
  await assert.rejects(() => writePrompt("sess-1", ""));
  await assert.rejects(() => writePrompt("sess-1", 42));
});

test("archiveRecord moves the record file into archived/, validates inputs", async () => {
  const home = await tmpHome();
  const slugDir = path.join(home, ".claude", "feature-log", "-repo-proj");
  await fs.mkdir(slugDir, { recursive: true });
  await fs.writeFile(path.join(slugDir, "sess-1.json"), "{}");
  await archiveRecord("/repo/proj", "sess-1");
  const archived = path.join(home, ".claude", "feature-log", "archived", "-repo-proj", "sess-1.json");
  assert.equal(JSON.parse(await fs.readFile(archived, "utf8")) instanceof Object, true);
  await assert.rejects(() => fs.access(path.join(slugDir, "sess-1.json")));
  await assert.rejects(() => archiveRecord("/repo/proj", "../evil"));
  await assert.rejects(() => archiveRecord(42, "sess-1"));
  await assert.rejects(() => archiveRecord("/repo/proj", "missing")); // no such record
});

test("readAwaitingPrompts returns fresh, drops stale", async () => {
  const home = await tmpHome();
  const dir = path.join(home, ".claude", "feature-log", "awaiting");
  await fs.mkdir(dir, { recursive: true });
  const now = Date.now();
  await fs.writeFile(
    path.join(dir, "fresh.json"),
    JSON.stringify({ sessionId: "fresh", createdAt: new Date(now).toISOString(), lastReply: "All tests pass." }),
  );
  await fs.writeFile(path.join(dir, "stale.json"), JSON.stringify({ sessionId: "stale", createdAt: new Date(now - 700_000).toISOString() }));
  const a = await readAwaitingPrompts(now);
  assert.deepEqual(a.map((x) => x.sessionId), ["fresh"]);
  assert.equal(a[0].lastReply, "All tests pass.");
});

test("readPendingApprovals returns fresh, drops stale", async () => {
  const home = await tmpHome();
  const dir = path.join(home, ".claude", "feature-log", "pending");
  await fs.mkdir(dir, { recursive: true });
  const now = Date.now();
  await fs.writeFile(
    path.join(dir, "fresh.json"),
    JSON.stringify({ sessionId: "fresh", tool: "Bash", input: "ls", cwd: "/r", createdAt: new Date(now).toISOString() }),
  );
  await fs.writeFile(
    path.join(dir, "stale.json"),
    JSON.stringify({ sessionId: "stale", tool: "Bash", input: "ls", cwd: "/r", createdAt: new Date(now - 700_000).toISOString() }),
  );
  const pending = await readPendingApprovals(now);
  assert.deepEqual(pending.map((p) => p.sessionId), ["fresh"]);
});
