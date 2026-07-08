import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateLaunch } from "./launch.ts";

test("validateLaunch: existing dir under home + non-empty prompt", async () => {
  const dir = await fs.mkdtemp(path.join(os.homedir(), ".launch-test-"));
  try {
    const v = await validateLaunch(dir, "build the feature");
    assert.deepEqual(v, { projectPath: dir, prompt: "build the feature" });
    await assert.rejects(() => validateLaunch("/nonexistent-dir-xyz", "hi"));
    await assert.rejects(() => validateLaunch("/etc", "hi")); // outside home
    await assert.rejects(() => validateLaunch(dir, ""));
    await assert.rejects(() => validateLaunch(dir, 42));
    await assert.rejects(() => validateLaunch("relative/path", "hi"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
