import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Reads your local Claude Code history (~/.claude/projects/<proj>/<session>.jsonl)
// and reconstructs "what you worked on" as work items — entirely offline, no API
// key. Rather than grouping by the prompts you typed (noisy), we collect every
// file the assistant created/edited across a project and bucket them into logical
// feature areas, so the board reads like real work: "API routes", "Board UI", etc.

export type WorkItem = {
  sourceKey: string; // stable id for dedup across re-imports
  title: string;
  body: string;
  details: string;
  project: string;
};

const MUTATING = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Commands worth surfacing on the "Project setup" card.
const SIGNIFICANT_CMD =
  /\b(git\s+(commit|push|merge|rebase|tag)|npm\s+(install|i|ci)|npx\s+create-|prisma\s+migrate|npm\s+run\s+(build|test|lint)|yarn\s+\w|pnpm\s+(install|add))/;

// Feature areas, in board display order.
const AREAS = [
  "Project setup",
  "Data layer & libs",
  "API routes",
  "Board UI",
  "Docs",
  "Other",
] as const;
type Area = (typeof AREAS)[number];

const CONFIG_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "eslint.config.mjs",
  "eslint.config.js",
  ".eslintrc.json",
  "postcss.config.mjs",
  "postcss.config.js",
  "tailwind.config.ts",
  "tailwind.config.js",
  ".gitignore",
  "next-env.d.ts",
  "components.json",
]);

function classify(rel: string): Area {
  const base = rel.split("/").pop() ?? rel;
  if (CONFIG_FILES.has(base) || base.startsWith(".env")) return "Project setup";
  if (rel.startsWith("src/lib/") || rel.startsWith("lib/")) return "Data layer & libs";
  if (
    rel.startsWith("src/app/api/") ||
    rel.startsWith("app/api/") ||
    rel.startsWith("pages/api/")
  )
    return "API routes";
  if (rel.startsWith("src/components/") || rel.startsWith("components/")) return "Board UI";
  if (rel.startsWith("src/app/") || rel.startsWith("app/")) return "Board UI";
  if (base.endsWith(".md")) return "Docs";
  return "Other";
}

type ProjectData = {
  cwd: string;
  created: Set<string>;
  edited: Set<string>;
  commands: string[];
};

function scanTranscript(raw: string, data: ProjectData): void {
  for (const line of raw.trim().split("\n")) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!data.cwd && typeof o.cwd === "string") data.cwd = o.cwd;
    if (o.type !== "assistant") continue;

    const message = o.message as { content?: unknown } | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (!b || typeof b !== "object") continue;
      const block = b as { type?: string; name?: string; input?: Record<string, unknown> };
      if (block.type !== "tool_use") continue;
      const inp = block.input ?? {};
      if (block.name === "Write" && typeof inp.file_path === "string") {
        data.created.add(inp.file_path);
      } else if (MUTATING.has(block.name ?? "")) {
        const fp = (inp.file_path ?? inp.notebook_path) as string | undefined;
        if (typeof fp === "string") data.edited.add(fp);
      } else if (block.name === "Bash" && typeof inp.command === "string") {
        data.commands.push(inp.command);
      }
    }
  }
}

function buildItems(data: ProjectData, multiProject: boolean): WorkItem[] {
  const { cwd } = data;
  if (!cwd) return []; // can't compute project-relative paths without a cwd

  // Bucket project-relative files by area (files outside the project are skipped).
  const buckets = new Map<Area, { created: string[]; edited: string[] }>();
  const rel = (f: string): string | null =>
    f.startsWith(cwd + "/") ? f.slice(cwd.length + 1) : null;
  const add = (f: string, kind: "created" | "edited") => {
    const r = rel(f);
    if (!r) return;
    const area = classify(r);
    if (!buckets.has(area)) buckets.set(area, { created: [], edited: [] });
    buckets.get(area)![kind].push(r);
  };
  data.created.forEach((f) => add(f, "created"));
  data.edited.forEach((f) => {
    if (!data.created.has(f)) add(f, "edited");
  });

  const sigCmds = [
    ...new Set(
      data.commands
        .map((c) => c.split("\n")[0].trim())
        .filter((c) => SIGNIFICANT_CMD.test(c)),
    ),
  ].slice(0, 6);

  const projName = path.basename(cwd) || cwd;
  const items: WorkItem[] = [];

  for (const area of AREAS) {
    const b = buckets.get(area);
    if (!b || (b.created.length === 0 && b.edited.length === 0)) continue;

    const parts: string[] = [];
    if (b.created.length) parts.push(`${b.created.length} created`);
    if (b.edited.length) parts.push(`${b.edited.length} edited`);

    const detail: string[] = [];
    if (b.created.length) detail.push(`Created: ${[...b.created].sort().join(", ")}`);
    if (b.edited.length) detail.push(`Edited: ${[...b.edited].sort().join(", ")}`);
    if (area === "Project setup" && sigCmds.length) {
      detail.push(`Key commands:\n${sigCmds.map((c) => `  • ${c.slice(0, 80)}`).join("\n")}`);
    }

    items.push({
      sourceKey: `${cwd}::${area}`,
      title: multiProject ? `${projName}: ${area}` : area,
      body: `${parts.join(", ")} in ${projName}.`,
      details: detail.join("\n"),
      project: cwd,
    });
  }
  return items;
}

/** Scan every Claude Code project on this machine and return feature-area work items. */
export async function readClaudeCodeWorkItems(): Promise<WorkItem[]> {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  let projectDirs: string[];
  try {
    projectDirs = await fs.readdir(projectsDir);
  } catch {
    return []; // no Claude Code history on this machine
  }

  const projects: ProjectData[] = [];
  for (const proj of projectDirs) {
    const dir = path.join(projectsDir, proj);
    let files: string[];
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    const data: ProjectData = { cwd: "", created: new Set(), edited: new Set(), commands: [] };
    for (const file of files) {
      try {
        scanTranscript(await fs.readFile(path.join(dir, file), "utf8"), data);
      } catch {
        // skip unreadable/partial transcript
      }
    }
    if (data.cwd && (data.created.size > 0 || data.edited.size > 0)) {
      projects.push(data);
    }
  }

  const multiProject = projects.length > 1;
  return projects.flatMap((p) => buildItems(p, multiProject));
}
