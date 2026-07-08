import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { z } from "zod";

// Launch a new headless `claude -p` run in a project directory. The session is
// picked up by the feature-logger hooks like any other, so it appears on the
// dashboard. Auth-gated at the route; validation here keeps it to real project
// dirs under the user's home.

export async function validateLaunch(
  projectPath: unknown,
  prompt: unknown,
): Promise<{ projectPath: string; prompt: string }> {
  const p = z.string().min(1).parse(projectPath);
  const text = z.string().min(1).max(10_000).parse(prompt);
  if (!path.isAbsolute(p)) throw new Error("projectPath must be absolute");
  const resolved = path.resolve(p);
  const home = os.homedir();
  if (resolved !== home && !resolved.startsWith(home + path.sep)) {
    throw new Error("projectPath must be under your home directory");
  }
  const stat = await fs.stat(resolved); // throws if missing
  if (!stat.isDirectory()) throw new Error("projectPath is not a directory");
  return { projectPath: resolved, prompt: text };
}

/** Fire-and-forget: spawn `claude -p <prompt>` detached in the project dir. */
export async function launchSession(projectPath: unknown, prompt: unknown): Promise<void> {
  const v = await validateLaunch(projectPath, prompt);
  const child = spawn("claude", ["-p", v.prompt], {
    cwd: v.projectPath,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
