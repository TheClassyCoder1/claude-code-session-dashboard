// Client-safe types + pure helpers (no Node imports), so client components can
// use them without dragging the fs-based reader into the browser bundle.

import type { TokenCounts } from "./pricing";

export type FileBucket = { created: string[]; edited: string[] };

export type FeatureRecord = {
  schemaVersion: number;
  sessionId: string;
  projectPath: string;
  projectName: string;
  model: string;
  tokens: TokenCounts;
  turns: number;
  filesByArea: Record<string, FileBucket>;
  commands: string[];
  userPrompts: string[];
  summary: string;
  summaryHeadline: string;
  summarySource: string;
  summaryUsage?: unknown;
  summaryCostUsd?: number;
  startedAt: string;
  endedAt: string;
  updatedAt: string;
  // Derived in the reader:
  estimatedCostUsd: number;
  totalTokens: number;
};

export type Aggregates = {
  features: number;
  projects: number;
  totalTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
};

export type Status = "todo" | "in_progress" | "done";

export function countChanges(r: FeatureRecord): number {
  return Object.values(r.filesByArea).reduce(
    (s, b) => s + b.created.length + b.edited.length,
    0,
  );
}

/** Lifecycle status derived from the captured record. */
export function deriveStatus(r: FeatureRecord): Status {
  if (r.summary && r.summarySource) return "done";
  if (r.turns > 0 || countChanges(r) > 0) return "in_progress";
  return "todo";
}

export const STATUS_META: Record<
  Status,
  { label: string; description: string; badge: string; dot: string; order: number }
> = {
  in_progress: {
    label: "In progress",
    description: "Being worked on — no end-of-session summary yet.",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    order: 0,
  },
  todo: {
    label: "To do",
    description: "Session started but not picked up yet.",
    badge: "bg-slate-200 text-slate-600",
    dot: "bg-slate-400",
    order: 1,
  },
  done: {
    label: "Done",
    description: "Completed — summarized at session end.",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    order: 2,
  },
};

export function aggregate(records: FeatureRecord[]): Aggregates {
  return {
    features: records.length,
    projects: new Set(records.map((r) => r.projectPath)).size,
    totalTokens: records.reduce((s, r) => s + r.totalTokens, 0),
    totalOutputTokens: records.reduce((s, r) => s + r.tokens.output, 0),
    totalCostUsd: records.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}
