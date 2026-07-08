import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLiveTail } from "./tail.ts";

test("readLiveTail: last assistant text from a transcript under ~/.claude", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tail-"));
  process.env.HOME = home;
  const dir = path.join(home, ".claude", "projects", "p");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "t.jsonl");
  await fs.writeFile(
    file,
    [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "old" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Running tests now." }] } }),
    ].join("\n"),
  );
  assert.equal(await readLiveTail(file), "Running tests now.");
  assert.equal(await readLiveTail("/etc/passwd"), ""); // outside ~/.claude
  assert.equal(await readLiveTail(path.join(dir, "missing.jsonl")), "");
  assert.equal(await readLiveTail(undefined), "");
});
