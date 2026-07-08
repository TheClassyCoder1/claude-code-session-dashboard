import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Last assistant text from a session transcript — the "what Claude is saying
// right now" tail for in-progress cards. Server-only; the page re-reads it on
// each RSC refresh, so it's near-live without any extra polling machinery.
// Path must live under ~/.claude (where Claude Code keeps transcripts).
export async function readLiveTail(transcriptPath: string | undefined): Promise<string> {
  if (!transcriptPath) return "";
  const resolved = path.resolve(transcriptPath);
  if (!resolved.startsWith(path.join(os.homedir(), ".claude") + path.sep)) return "";
  let raw: string;
  try {
    raw = await fs.readFile(resolved, "utf8");
  } catch {
    return "";
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let o;
    try {
      o = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (o.type !== "assistant") continue;
    const content = o.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) return text.slice(0, 500);
  }
  return "";
}
